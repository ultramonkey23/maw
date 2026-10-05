#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */

process.env.MAW_LAB_MODE = 'on';
await import('./llxprt.mjs');
