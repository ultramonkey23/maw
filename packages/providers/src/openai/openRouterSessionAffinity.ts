/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';

export interface OpenRouterSessionAffinityContext {
  readonly providerName: string;
  readonly runtimeId: string;
}

const OPENROUTER_PROVIDER = 'openrouter';
const SESSION_PREFIX = 'maw-';

/**
 * OpenRouter uses session_id as a sticky-routing key for multi-turn agent
 * sessions. Keep the value opaque so MAW does not expose its raw runtime/session
 * identifier to provider-side observability, while remaining stable for the
 * lifetime of the runtime.
 *
 * Caller-supplied session_id always wins.
 */
export function applyOpenRouterSessionAffinity(
  request: Record<string, unknown>,
  context: OpenRouterSessionAffinityContext,
): void {
  if (
    context.providerName.trim().toLowerCase() !== OPENROUTER_PROVIDER ||
    request['session_id'] !== undefined
  ) {
    return;
  }

  const runtimeId = context.runtimeId.trim();
  if (runtimeId === '') return;

  const digest = createHash('sha256').update(runtimeId).digest('hex');
  request['session_id'] = `${SESSION_PREFIX}${digest}`;
}
