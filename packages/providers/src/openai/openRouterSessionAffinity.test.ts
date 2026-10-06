/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'bun:test';
import { applyOpenRouterSessionAffinity } from './openRouterSessionAffinity.js';

describe('OpenRouter session affinity', () => {
  it('adds one opaque stable session id for OpenRouter', () => {
    const first: Record<string, unknown> = {};
    const second: Record<string, unknown> = {};

    applyOpenRouterSessionAffinity(first, {
      providerName: 'OpenRouter',
      runtimeId: 'session-visible-to-maw-only',
    });
    applyOpenRouterSessionAffinity(second, {
      providerName: 'openrouter',
      runtimeId: 'session-visible-to-maw-only',
    });

    expect(first.session_id).toBe(second.session_id);
    expect(String(first.session_id)).toMatch(/^maw-[0-9a-f]{64}$/);
    expect(String(first.session_id)).not.toContain(
      'session-visible-to-maw-only',
    );
    expect(String(first.session_id).length).toBeLessThanOrEqual(256);
  });

  it('changes the affinity key when the runtime changes', () => {
    const first: Record<string, unknown> = {};
    const second: Record<string, unknown> = {};

    applyOpenRouterSessionAffinity(first, {
      providerName: 'OpenRouter',
      runtimeId: 'runtime-a',
    });
    applyOpenRouterSessionAffinity(second, {
      providerName: 'OpenRouter',
      runtimeId: 'runtime-b',
    });

    expect(first.session_id).not.toBe(second.session_id);
  });

  it('preserves a caller-specified session id', () => {
    const request: Record<string, unknown> = {
      session_id: 'caller-owned-session',
    };

    applyOpenRouterSessionAffinity(request, {
      providerName: 'OpenRouter',
      runtimeId: 'runtime-key',
    });

    expect(request.session_id).toBe('caller-owned-session');
  });

  it('does not affect other OpenAI-compatible providers', () => {
    const request: Record<string, unknown> = {};

    applyOpenRouterSessionAffinity(request, {
      providerName: 'openai',
      runtimeId: 'runtime-key',
    });

    expect(request.session_id).toBeUndefined();
  });

  it('does not emit an affinity key for a blank runtime id', () => {
    const request: Record<string, unknown> = {};

    applyOpenRouterSessionAffinity(request, {
      providerName: 'OpenRouter',
      runtimeId: '   ',
    });

    expect(request.session_id).toBeUndefined();
  });
});
