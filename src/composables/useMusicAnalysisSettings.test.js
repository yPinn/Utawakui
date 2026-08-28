import { describe, expect, it, vi } from 'vitest';
import { useMusicAnalysisSettings } from './useMusicAnalysisSettings.js';

function createHarness(overrides = {}) {
  let progressListener;
  const unsubscribe = vi.fn();
  const bridge = {
    getAutoMusicAnalysis: vi.fn().mockResolvedValue(true),
    setAutoMusicAnalysis: vi.fn(async (enabled) => enabled),
    getMusicStructureCapabilityStatus: vi.fn().mockResolvedValue({
      status: 'ready',
      installed: true,
      modelName: 'Beat This! small0',
    }),
    prepareMusicStructureCapability: vi.fn(),
    repairMusicStructureCapability: vi.fn(),
    removeMusicStructureCapability: vi.fn(),
    onMusicStructureCapabilityProgress: vi.fn((listener) => {
      progressListener = listener;
      return unsubscribe;
    }),
    ...overrides,
  };
  const settings = useMusicAnalysisSettings({ bridge });
  return {
    bridge,
    settings,
    unsubscribe,
    progress: (value) => progressListener(value),
  };
}

describe('Music Analysis settings owner', () => {
  it('loads the capability and automatic-analysis preference together', async () => {
    const { bridge, settings } = createHarness();

    await settings.initialize();

    expect(settings.capability.value).toMatchObject({ status: 'ready' });
    expect(settings.autoAnalyze.value).toBe(true);
    expect(bridge.onMusicStructureCapabilityProgress).toHaveBeenCalledOnce();
  });

  it('persists an explicit automatic-analysis choice', async () => {
    const { bridge, settings } = createHarness();
    await settings.initialize();

    await expect(settings.setAutoAnalyze(false)).resolves.toBe(true);
    expect(bridge.setAutoMusicAnalysis).toHaveBeenCalledWith(false);
    expect(settings.autoAnalyze.value).toBe(false);
  });

  it('restores the prior choice and shows bounded copy when saving fails', async () => {
    const { settings } = createHarness({
      setAutoMusicAnalysis: vi
        .fn()
        .mockRejectedValue(new Error('private config path')),
    });
    await settings.initialize();

    await expect(settings.setAutoAnalyze(false)).resolves.toBe(false);
    expect(settings.autoAnalyze.value).toBe(true);
    expect(settings.preferenceError.value).toBe(
      '目前無法儲存自動分析設定，請再試一次。',
    );
  });

  it('uses a safe default when the preference bridge is unavailable', async () => {
    const { settings } = createHarness({ getAutoMusicAnalysis: undefined });

    await settings.initialize();

    expect(settings.autoAnalyze.value).toBe(true);
    expect(settings.preferenceError.value).toBe(
      '目前無法讀取自動分析設定，請重新啟動後再試。',
    );
  });

  it('releases the capability progress subscription on disposal', async () => {
    const { settings, unsubscribe } = createHarness();
    await settings.initialize();

    settings.dispose();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
