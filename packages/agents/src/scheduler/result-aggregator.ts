/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @internal
 * Owns result buffering, ordered publishing, and batch output-limit computation.
 * Extracted from CoreToolScheduler as part of the Phase 2 decomposition
 * (issue 1580).
 *
 * Ordering guarantee: results are published in `executionIndex` order
 * regardless of which tool finishes first, using a reentrancy-guarded loop
 * with a `setImmediate` recovery path for the race where a result arrives
 * after the loop exits but before the flag is cleared.
 */

import type { ToolCallResponseInfo } from '../core/turn.js';
import type { ToolResult } from '@vybestack/llxprt-code-tools';
import { ToolErrorType } from '@vybestack/llxprt-code-tools/types/tool-error.js';
import { DEFAULT_AGENT_ID } from '../core/turn.js';
import {
  convertToFunctionResponse,
  extractAgentIdFromMetadata,
  createErrorResponse,
  extractModelFacingErrorText,
} from '@vybestack/llxprt-code-core/utils/generateContentResponseUtilities.js';
import {
  ESCAPE_BUFFER_PERCENTAGE,
  estimateTokens,
  getOutputLimits,
  type ToolOutputSettingsProvider,
} from '@vybestack/llxprt-code-core/utils/toolOutputLimiter.js';
import { DebugLogger } from '@vybestack/llxprt-code-core/debug/index.js';
import type { ScheduledToolCall } from '@vybestack/llxprt-code-core/scheduler/types.js';

const logger = new DebugLogger('llxprt:scheduler:result-aggregator');

// ---- callback interface -----------------------------------------------------

/**
 * Callbacks provided by CoreToolScheduler so ResultAggregator can publish
 * without importing the scheduler class (prevents circular dependency).
 */
export interface ResultPublishCallbacks {
  /** Transition a call to the 'success' terminal state. */
  setSuccess(callId: string, response: ToolCallResponseInfo): void;
  /** Transition a call to the 'error' terminal state. */
  setError(callId: string, response: ToolCallResponseInfo): void;
  /**
   * Returns the active Config (or equivalent provider) so ResultAggregator
   * can compute per-tool token limits when no batch override is in effect.
   */
  getFallbackOutputConfig(): ToolOutputSettingsProvider;
}

// ---- internal buffer entry type --------------------------------------------

interface BufferedEntry {
  result: ToolResult;
  callId: string;
  toolName: string;
  scheduledCall: ScheduledToolCall;
  executionIndex: number;
  /** If true, skip publishing — the call is already in 'cancelled' terminal state. */
  isCancelled?: boolean;
}

interface BatchOutputBudget {
  readonly baseEphemeral: Record<string, unknown>;
  remainingTokens: number;
}

function estimateModelFacingToolTokens(
  responseParts: ToolCallResponseInfo['responseParts'],
): number {
  let total = 0;
  for (const part of responseParts) {
    if (part.type !== 'tool_response') continue;
    const result = part.result;
    if (typeof result !== 'object' || result === null) continue;
    const record = result as Record<string, unknown>;
    for (const key of ['output', 'error'] as const) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) {
        total += estimateTokens(value);
      }
    }
  }
  return total;
}

// ---- ResultAggregator -------------------------------------------------------
function hasTruthyTruncateMode(ephemeral: Record<string, unknown>): boolean {
  const value = ephemeral['tool-output-truncate-mode'];
  if (typeof value === 'number') {
    return value !== 0 && !Number.isNaN(value);
  }
  return (
    value !== undefined && value !== null && value !== false && value !== ''
  );
}

/**
 * @internal
 */
export class ResultAggregator {
  /** Pending tool results keyed by callId. */
  private readonly pendingResults = new Map<string, BufferedEntry>();
  /**
   * Secondary index over the same entries for ordered publication.
   *
   * executionIndex is assigned once by CoreToolScheduler, so publication can
   * address the next result directly instead of rescanning every pending
   * callId entry on each slot.
   */
  private readonly pendingResultsByExecutionIndex = new Map<
    number,
    BufferedEntry
  >();
  /** The executionIndex of the next result to publish. */
  private nextPublishIndex = 0;
  /** Total tools in the current batch; set by {@link beginBatch}. */
  private currentBatchSize = 0;
  /**
   * Invocation-local batch token budget.
   *
   * undefined = not initialized for the current batch yet
   * null      = no batch limiter (single tool or canonical limit disabled)
   * object    = limited budget whose unused capacity rolls forward
   */
  private batchOutputBudget: BatchOutputBudget | null | undefined = undefined;
  /** Reentrancy guard for {@link publishBufferedResults}. */
  private isPublishingBufferedResults = false;
  /** Set when a second publish is requested during an active publish pass. */
  private pendingPublishRequest = false;

  constructor(private readonly callbacks: ResultPublishCallbacks) {}

  // ---- public buffering API ------------------------------------------------

  /** Keep call-id and execution-order indexes in lockstep. */
  private storeBufferedEntry(entry: BufferedEntry): void {
    const previousByCallId = this.pendingResults.get(entry.callId);
    if (previousByCallId) {
      this.pendingResultsByExecutionIndex.delete(
        previousByCallId.executionIndex,
      );
    }

    const previousByExecutionIndex =
      this.pendingResultsByExecutionIndex.get(entry.executionIndex);
    if (previousByExecutionIndex) {
      this.pendingResults.delete(previousByExecutionIndex.callId);
    }

    this.pendingResults.set(entry.callId, entry);
    this.pendingResultsByExecutionIndex.set(entry.executionIndex, entry);
  }

  /** Store a successful tool result for ordered publishing. */
  bufferResult(
    callId: string,
    toolName: string,
    scheduledCall: ScheduledToolCall,
    result: ToolResult,
    executionIndex: number,
  ): void {
    const entry: BufferedEntry = {
      result,
      callId,
      toolName,
      scheduledCall,
      executionIndex,
    };
    this.storeBufferedEntry(entry);
  }

  /** Store an error result (ToolResult with `.error` set) for ordered publishing. */
  bufferError(
    callId: string,
    toolName: string,
    scheduledCall: ScheduledToolCall,
    error: Error,
    executionIndex: number,
  ): void {
    const errorResult: ToolResult = {
      error: {
        message: error.message,
        type: ToolErrorType.UNHANDLED_EXCEPTION,
      },
      llmContent: error.message,
      returnDisplay: error.message,
    };
    const entry: BufferedEntry = {
      result: errorResult,
      callId,
      toolName,
      scheduledCall,
      executionIndex,
    };
    this.storeBufferedEntry(entry);
  }

  /**
   * Store a placeholder for a cancelled call so the ordered-publish loop can
   * advance past this index.  The call is already in 'cancelled' terminal state
   * so no callback is fired — the entry is simply discarded after its index is
   * consumed.
   */
  bufferCancelled(
    callId: string,
    scheduledCall: ScheduledToolCall,
    executionIndex: number,
  ): void {
    const cancelledResult: ToolResult = {
      error: {
        message: 'Tool call cancelled by user.',
        type: ToolErrorType.EXECUTION_FAILED,
      },
      llmContent: 'Tool call cancelled by user.',
      returnDisplay: 'Cancelled',
    };
    const entry: BufferedEntry = {
      result: cancelledResult,
      callId,
      toolName: scheduledCall.request.name,
      scheduledCall,
      executionIndex,
      isCancelled: true,
    };
    this.storeBufferedEntry(entry);
  }

  // ---- batch initialisation ------------------------------------------------

  /**
   * Called once at the start of each execution batch to record how many tools
   * are participating and to apply proportional output-token limits when the
   * batch has more than one tool.
   */
  beginBatch(size: number): void {
    this.currentBatchSize = size;
    this.initializeBatchOutputBudget(size);
  }

  // ---- publishing ----------------------------------------------------------

  /**
   * Publishes buffered results in `executionIndex` order.
   *
   * Reentrancy guard: if called while a publish pass is already running the
   * call sets `pendingPublishRequest` and returns immediately.  The running
   * pass will loop once more before releasing the lock.
   *
   * Recovery path: after releasing the lock we check whether any buffered
   * results are ready (i.e. the next expected index is present) and schedule
   * a follow-up via `setImmediate` to avoid missing results that arrived while
   * the lock was held.
   */
  async publishBufferedResults(signal: AbortSignal): Promise<void> {
    if (this.isPublishingBufferedResults) {
      this.pendingPublishRequest = true;
      return;
    }

    this.isPublishingBufferedResults = true;
    this.pendingPublishRequest = false;

    try {
      await this.publishBufferedResultsPass(signal);
    } finally {
      this.isPublishingBufferedResults = false;
      this.scheduleFollowUpIfNeeded(signal);
    }
  }

  // ---- state reset ---------------------------------------------------------

  /**
   * Clears all buffered state.  Called by `CoreToolScheduler.cancelAll()` and
   * indirectly by `dispose()`.
   */
  reset(): void {
    this.pendingResults.clear();
    this.pendingResultsByExecutionIndex.clear();
    this.nextPublishIndex = 0;
    this.currentBatchSize = 0;
    this.isPublishingBufferedResults = false;
    this.pendingPublishRequest = false;
    this.batchOutputBudget = undefined;
  }

  // ---- private helpers -----------------------------------------------------

  /** Find a buffered entry by its executionIndex in O(1) average time. */
  private findByExecutionIndex(index: number): BufferedEntry | undefined {
    return this.pendingResultsByExecutionIndex.get(index);
  }

  /**
   * Issue #987 fix: if tools complete before `beginBatch` is called,
   * `currentBatchSize` may still be 0.  Recover it from the actual pending
   * entries so publishing can proceed.
   */
  private recoverBatchSizeIfNeeded(): void {
    if (this.currentBatchSize !== 0 || this.pendingResults.size === 0) {
      return;
    }

    let maxIndex = -1;
    for (const executionIndex of this.pendingResultsByExecutionIndex.keys()) {
      if (executionIndex > maxIndex) {
        maxIndex = executionIndex;
      }
    }

    const recovered = Math.min(maxIndex + 1, this.pendingResults.size);
    this.currentBatchSize = recovered > 0 ? recovered : 1;
    if (this.batchOutputBudget === undefined) {
      this.initializeBatchOutputBudget(this.currentBatchSize);
    }

    if (logger.enabled) {
      logger.debug(
        () =>
          `Recovered batch size from pending results: currentBatchSize=${this.currentBatchSize}, ` +
          `pendingResults.size=${this.pendingResults.size}, maxIndex=${maxIndex}`,
      );
    }
  }

  /** When the entire batch has been published, reset counters for the next batch. */
  private resetBatchIfComplete(): void {
    if (
      this.nextPublishIndex === this.currentBatchSize &&
      this.currentBatchSize > 0
    ) {
      this.nextPublishIndex = 0;
      this.currentBatchSize = 0;
      this.pendingResults.clear();
      this.pendingResultsByExecutionIndex.clear();
      this.batchOutputBudget = undefined;
    }
  }

  private async publishBufferedResultsPass(signal: AbortSignal): Promise<void> {
    this.pendingPublishRequest = false;
    this.recoverBatchSizeIfNeeded();

    while (this.nextPublishIndex < this.currentBatchSize) {
      const nextBuffered = this.findByExecutionIndex(this.nextPublishIndex);
      if (!nextBuffered) {
        break; // Gap — wait for the missing result to arrive
      }

      if (nextBuffered.isCancelled !== true) {
        await this.publishResult(nextBuffered, signal);
      }

      this.pendingResults.delete(nextBuffered.callId);
      this.pendingResultsByExecutionIndex.delete(nextBuffered.executionIndex);
      this.nextPublishIndex++;
    }

    this.resetBatchIfComplete();
    if (this.consumePendingPublishRequest()) {
      await this.publishBufferedResultsPass(signal);
    }
  }

  private consumePendingPublishRequest(): boolean {
    return this.pendingPublishRequest;
  }

  /**
   * After releasing the reentrancy lock, schedule a follow-up publish via
   * `setImmediate` when the next expected result is already buffered.  This
   * handles the race where:
   *  1. We break the inner `while` loop waiting for result N.
   *  2. Result N arrives and calls `publishBufferedResults`.
   *  3. That call sees the lock held, sets `pendingPublishRequest`, and returns.
   *  4. We exit the `do-while` without seeing the flag (it was set after the check).
   */

  private scheduleFollowUpIfNeeded(signal: AbortSignal): void {
    if (this.pendingResults.size === 0) {
      return;
    }
    const hasNext =
      this.findByExecutionIndex(this.nextPublishIndex) !== undefined;
    if (hasNext) {
      setImmediate(() => {
        void this.publishBufferedResults(signal);
      });
    }
  }

  /**
   * Convert a buffered result to a `ToolCallResponseInfo` and invoke the
   * appropriate status callback (`setSuccess` or `setError`).
   */
  private async publishResult(
    buffered: BufferedEntry,
    _signal: AbortSignal,
  ): Promise<void> {
    const { result, callId, toolName, scheduledCall } = buffered;

    const outputConfig = this.outputConfigForNextResult();

    if (result.error === undefined) {
      const responseParts = convertToFunctionResponse(
        toolName,
        callId,
        result.llmContent,
        outputConfig,
      );

      const metadataAgentId = extractAgentIdFromMetadata(result.metadata);

      const successResponse: ToolCallResponseInfo = {
        callId,
        responseParts,
        resultDisplay: result.returnDisplay,
        error: undefined,
        errorType: undefined,
        agentId:
          metadataAgentId ?? scheduledCall.request.agentId ?? DEFAULT_AGENT_ID,
        ...(result.suppressDisplay !== undefined && {
          suppressDisplay: result.suppressDisplay,
        }),
      };

      this.chargeBatchBudget(responseParts);

      logger.debug(
        `callId=${callId}, toolName=${toolName}, returnDisplay type=${typeof result.returnDisplay}, hasValue=${Boolean(result.returnDisplay)}`,
      );

      this.callbacks.setSuccess(callId, successResponse);
    } else {
      const error = new Error(result.error.message);
      const errorResponse = createErrorResponse(
        scheduledCall.request,
        error,
        result.error.type,
        extractModelFacingErrorText(result.llmContent, toolName, outputConfig),
      );
      this.chargeBatchBudget(errorResponse.responseParts);
      this.callbacks.setError(callId, errorResponse);
    }
  }

  /**
   * Initialize batch-level output budgeting for parallel tool batches.
   *
   * The canonical output-limit parser owns disabled/default semantics. A
   * limited batch starts with the configured budget intact; each result gets a
   * fair share of the *remaining* budget over the slots still unpublished.
   * Actual model-facing output is charged back after publication, so unused
   * capacity circulates forward instead of being stranded in an equal slice.
   */
  private initializeBatchOutputBudget(batchSize: number): void {
    if (batchSize <= 1) {
      this.batchOutputBudget = null;
      return;
    }

    try {
      const fallback = this.callbacks.getFallbackOutputConfig();
      const ephemeral =
        typeof fallback.getEphemeralSettings === 'function'
          ? fallback.getEphemeralSettings()
          : {};
      const { tokenLimit } = getOutputLimits(fallback);

      if (tokenLimit.kind === 'disabled') {
        this.batchOutputBudget = null;
        if (logger.enabled) {
          logger.debug(
            () =>
              `Batch of ${batchSize} tools: tool output token limiting is disabled.`,
          );
        }
        return;
      }

      this.batchOutputBudget = {
        baseEphemeral: ephemeral,
        remainingTokens: tokenLimit.maxTokens,
      };

      if (logger.enabled) {
        logger.debug(
          () =>
            `Batch of ${batchSize} tools: initialized circulating output budget ` +
            `of ${tokenLimit.maxTokens} tokens.`,
        );
      }
    } catch (error) {
      if (logger.enabled) {
        logger.debug(
          () =>
            `Failed to initialize batch output budget; skipping batch guard: ${error}`,
        );
      }
      this.batchOutputBudget = null;
    }
  }

  private outputConfigForNextResult(): ToolOutputSettingsProvider {
    const budget = this.batchOutputBudget;
    if (!budget) {
      return this.callbacks.getFallbackOutputConfig();
    }

    const slotsRemaining = Math.max(
      1,
      this.currentBatchSize - this.nextPublishIndex,
    );
    const fairShare = Math.max(
      1,
      Math.floor(budget.remainingTokens / slotsRemaining),
    );

    if (logger.enabled) {
      logger.debug(
        () =>
          `Publishing batch slot ${this.nextPublishIndex + 1}/${this.currentBatchSize}: ` +
          `fair-share limit ${fairShare} from ${budget.remainingTokens} remaining tokens.`,
      );
    }

    return {
      getEphemeralSettings: () => ({
        ...budget.baseEphemeral,
        'tool-output-max-tokens': fairShare,
        ...(hasTruthyTruncateMode(budget.baseEphemeral)
          ? {}
          : { 'tool-output-truncate-mode': 'truncate' }),
      }),
    };
  }

  private chargeBatchBudget(
    responseParts: ToolCallResponseInfo['responseParts'],
  ): void {
    const budget = this.batchOutputBudget;
    if (!budget) return;

    const modelFacingTokens = estimateModelFacingToolTokens(responseParts);
    if (modelFacingTokens <= 0) return;

    // toolOutputLimiter reserves 20% for JSON/string escaping. Convert the
    // actual model-facing payload back into the same configured-budget units
    // before returning unused capacity to later results.
    const consumedBudget = Math.ceil(
      modelFacingTokens / ESCAPE_BUFFER_PERCENTAGE,
    );
    budget.remainingTokens = Math.max(
      0,
      budget.remainingTokens - consumedBudget,
    );
  }
}
