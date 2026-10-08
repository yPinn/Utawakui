import { describe, expect, it, vi } from 'vitest';
import { createOutputPreferencesController } from './useOutputPreferences.js';

function createHarness({
  recentColors = ['#112233'],
  savedColors = ['#445566'],
} = {}) {
  const state = { recentColors, savedColors, error: '' };
  const persistRecentColors = vi.fn(async (colors) => ({
    preferences: { recentColors: colors, savedColors: state.savedColors },
  }));
  const persistSavedColors = vi.fn(async (colors) => ({
    preferences: { recentColors: state.recentColors, savedColors: colors },
  }));
  const controller = createOutputPreferencesController({
    getRecentColors: () => state.recentColors,
    setRecentColors: (colors) => {
      state.recentColors = colors;
    },
    getSavedColors: () => state.savedColors,
    setSavedColors: (colors) => {
      state.savedColors = colors;
    },
    setError: (error) => {
      state.error = error;
    },
    persistRecentColors,
    persistSavedColors,
    reportError: (error) => error.message,
  });
  return {
    controller,
    persistRecentColors,
    persistSavedColors,
    state,
  };
}

describe('Output color preferences controller', () => {
  it('loads recent and saved colors from one Output workspace document', () => {
    const { controller, state } = createHarness({
      recentColors: [],
      savedColors: [],
    });

    controller.apply({
      preferences: {
        recentColors: ['#AABBCC'],
        savedColors: ['#112233', '#445566'],
      },
    });

    expect(state.recentColors).toEqual(['#aabbcc']);
    expect(state.savedColors).toEqual(['#112233', '#445566']);
  });

  it('toggles a stable saved color and persists only that bounded preference', async () => {
    const { controller, persistSavedColors, state } = createHarness();

    await expect(controller.toggleSavedColor('#AABBCC')).resolves.toBe(true);
    expect(persistSavedColors).toHaveBeenCalledWith(['#445566', '#aabbcc']);
    expect(state.savedColors).toEqual(['#445566', '#aabbcc']);
  });

  it('rolls back a failed saved-color write so the action can retry', async () => {
    const { controller, persistSavedColors, state } = createHarness();
    persistSavedColors.mockRejectedValueOnce(new Error('palette write failed'));

    await expect(controller.toggleSavedColor('#AABBCC')).resolves.toBe(false);
    expect(state.savedColors).toEqual(['#445566']);
    expect(state.error).toBe('palette write failed');

    await expect(controller.toggleSavedColor('#AABBCC')).resolves.toBe(true);
    expect(persistSavedColors).toHaveBeenCalledTimes(2);
    expect(state.savedColors).toEqual(['#445566', '#aabbcc']);
  });
});
