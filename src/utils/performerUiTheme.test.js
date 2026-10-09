import { describe, expect, it, vi } from 'vitest';
import { installPerformerUiTheme } from './performerUiTheme.js';

describe('installPerformerUiTheme', () => {
  it('applies the initial theme and every canonical live update', () => {
    let onTheme;
    const unsubscribe = vi.fn();
    const bridge = {
      initialUiTheme: 'light',
      onUiTheme: vi.fn((callback) => {
        onTheme = callback;
        return unsubscribe;
      }),
    };
    const root = { dataset: {} };

    expect(installPerformerUiTheme({ bridge, root })).toBe(unsubscribe);
    expect(root.dataset.uiTheme).toBe('light');

    onTheme('dark');
    expect(root.dataset.uiTheme).toBe('dark');

    onTheme('sepia');
    expect(root.dataset.uiTheme).toBe('dark');
  });

  it('defaults an unavailable or invalid bridge to light', () => {
    const root = { dataset: {} };

    expect(installPerformerUiTheme({ bridge: undefined, root })).toBe(
      undefined,
    );
    expect(root.dataset.uiTheme).toBe('light');
  });
});
