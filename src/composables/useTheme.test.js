import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.doMock('vue', () => ({
    ref: (value) => ({ value }),
  }));
});

afterEach(() => {
  vi.doUnmock('vue');
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('useTheme', () => {
  it('defaults an unbridged renderer to the light theme before mount', async () => {
    const root = { dataset: {} };
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { documentElement: root });

    const { useTheme } = await import('./useTheme.js');

    expect(useTheme().theme.value).toBe('light');
    expect(root.dataset.uiTheme).toBe('light');
  });

  it('preserves an explicit dark theme and persists later user changes', async () => {
    const root = { dataset: {} };
    const setUiTheme = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      Utawakui: { initialUiTheme: 'dark', setUiTheme },
    });
    vi.stubGlobal('document', { documentElement: root });

    const { useTheme } = await import('./useTheme.js');
    const { theme, toggleTheme } = useTheme();

    expect(theme.value).toBe('dark');
    expect(root.dataset.uiTheme).toBe('dark');

    await toggleTheme();

    expect(theme.value).toBe('light');
    expect(root.dataset.uiTheme).toBe('light');
    expect(setUiTheme).toHaveBeenCalledWith('light');
  });
});
