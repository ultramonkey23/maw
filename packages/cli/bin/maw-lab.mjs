#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */

process.env.MAW_LAB_MODE = 'on';
// Lab owns execution authority; MAW Lab mode must not add an LLxprt sandbox.
process.env.LLXPRT_SANDBOX = 'false';
await import('./llxprt.mjs');
