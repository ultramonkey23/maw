#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */

process.env.MAW_LAB_MODE = 'off';
// MAW historically starts on OpenRouter; explicit CLI/profile choices still win.
if (!process.env.LLXPRT_DEFAULT_PROVIDER?.trim()) {
  process.env.LLXPRT_DEFAULT_PROVIDER = 'OpenRouter';
}
await import('./llxprt.mjs');
