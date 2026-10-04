/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'bun:test';
import { render } from '../../__tests__/render.js';
import { Header } from './Header.js';

describe('MAW responsive header', () => {
  it('renders a restrained branded wide header', () => {
    const frame =
      render(
        <Header terminalWidth={100} version="1.0" nightly={false} />,
      ).lastFrame() ?? '';
    expect(frame).toContain('MAW');
    expect(frame).toContain('LIVING CODE');
    expect(frame).toContain('TRACE / FORGE / PROVE');
    expect(frame).not.toContain('LLXPRT CODE');
  });

  it('fits into a narrow shell without the wide tagline', () => {
    const frame =
      render(
        <Header terminalWidth={22} version="1.0" nightly={false} />,
      ).lastFrame() ?? '';
    expect(frame).toContain('MAW');
    expect(frame).toContain('LIVING CODE');
    expect(frame).not.toContain('TRACE / FORGE / PROVE');
  });

  it('keeps user-defined ASCII art instead of stamping MAW over it', () => {
    const frame =
      render(
        <Header
          customAsciiArt="CUSTOM BANNER"
          terminalWidth={120}
          version="1.0"
          nightly={false}
        />,
      ).lastFrame() ?? '';
    expect(frame).toContain('CUSTOM BANNER');
    expect(frame).not.toContain('LIVING CODE');
  });
});
