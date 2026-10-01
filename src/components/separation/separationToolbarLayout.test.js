import { describe, expect, it } from 'vitest';
import { separationToolbarPanelStyle } from './separationToolbarLayout.js';

describe('separation toolbar layout', () => {
  it('uses a deliberately small windowed／compact panel', () => {
    expect(separationToolbarPanelStyle('compact')).toEqual({
      minInlineSize:
        'min(17rem, calc(100vw - (2 * var(--ui-floating-viewport-inset))))',
      inlineSize: 'clamp(17rem, 26vw, 20rem)',
      maxInlineSize:
        'min(20rem, calc(100vw - (2 * var(--ui-floating-viewport-inset))))',
      minBlockSize:
        'min(14rem, calc(100vh - (2 * var(--ui-floating-viewport-inset))))',
      blockSize: 'clamp(14rem, 46vh, 21rem)',
      maxBlockSize:
        'min(21rem, calc(100vh - (2 * var(--ui-floating-viewport-inset))))',
    });
  });

  it('uses the larger bounded panel only for maximized／fullscreen standard density', () => {
    expect(separationToolbarPanelStyle('standard')).toEqual({
      minInlineSize:
        'min(20rem, calc(100vw - (2 * var(--ui-floating-viewport-inset))))',
      inlineSize: 'clamp(20rem, 28vw, 24rem)',
      maxInlineSize:
        'min(24rem, calc(100vw - (2 * var(--ui-floating-viewport-inset))))',
      minBlockSize:
        'min(18rem, calc(100vh - (2 * var(--ui-floating-viewport-inset))))',
      blockSize: 'clamp(18rem, 60vh, 32rem)',
      maxBlockSize:
        'min(32rem, calc(100vh - (2 * var(--ui-floating-viewport-inset))))',
    });
  });

  it('falls back to compact instead of guessing an unsupported state', () => {
    expect(separationToolbarPanelStyle('wide')).toEqual(
      separationToolbarPanelStyle('compact'),
    );
  });
});
