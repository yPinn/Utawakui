import { describe, expect, it, vi } from 'vitest';
import { useSeparationSettings } from './useSeparationSettings.js';

function createHarness(overrides = {}) {
  const bridge = {
    getSeparationGpuAcceleration: vi.fn().mockResolvedValue(true),
    setSeparationGpuAcceleration: vi.fn(async (enabled) => enabled),
    getAutoSeparation: vi.fn().mockResolvedValue(false),
    setAutoSeparation: vi.fn(async (enabled) => enabled),
    ...overrides,
  };
  const settings = useSeparationSettings({ bridge });
  return { bridge, settings };
}

describe('Separation GPU acceleration settings owner', () => {
  it('loads the persisted preference, defaulting to on', async () => {
    const { settings } = createHarness();

    await settings.refreshPreference();

    expect(settings.gpuAcceleration.value).toBe(true);
  });

  it('persists an explicit GPU-off choice', async () => {
    const { bridge, settings } = createHarness();
    await settings.refreshPreference();

    await expect(settings.setGpuAcceleration(false)).resolves.toBe(true);
    expect(bridge.setSeparationGpuAcceleration).toHaveBeenCalledWith(false);
    expect(settings.gpuAcceleration.value).toBe(false);
  });

  it('restores the prior choice and shows bounded copy when saving fails', async () => {
    const { settings } = createHarness({
      setSeparationGpuAcceleration: vi
        .fn()
        .mockRejectedValue(new Error('private config path')),
    });
    await settings.refreshPreference();

    await expect(settings.setGpuAcceleration(false)).resolves.toBe(false);
    expect(settings.gpuAcceleration.value).toBe(true);
    expect(settings.preferenceError.value).toBe(
      '目前無法儲存 GPU 加速設定，已恢復原設定。',
    );
  });

  it('uses a safe default when the preference bridge is unavailable', async () => {
    const { settings } = createHarness({
      getSeparationGpuAcceleration: undefined,
    });

    await settings.refreshPreference();

    expect(settings.gpuAcceleration.value).toBe(true);
    expect(settings.preferenceError.value).toBe(
      '目前無法讀取 GPU 加速設定，請重新讀取。',
    );
  });
});

describe('Automatic separation settings owner', () => {
  it('defaults to off and persists an explicit opt-in', async () => {
    const { bridge, settings } = createHarness();
    await settings.refreshAutoSeparation();
    expect(settings.autoSeparate.value).toBe(false);

    await expect(settings.setAutoSeparate(true)).resolves.toBe(true);
    expect(bridge.setAutoSeparation).toHaveBeenCalledWith(true);
    expect(settings.autoSeparate.value).toBe(true);
  });

  it('shares one value between owners on the same bridge', async () => {
    const { bridge, settings } = createHarness();
    const other = useSeparationSettings({ bridge });
    await settings.setAutoSeparate(true);
    expect(other.autoSeparate.value).toBe(true);
  });

  it('restores the prior choice when saving fails', async () => {
    const { settings } = createHarness({
      setAutoSeparation: vi.fn().mockRejectedValue(new Error('private')),
    });
    await settings.refreshAutoSeparation();
    await expect(settings.setAutoSeparate(true)).resolves.toBe(false);
    expect(settings.autoSeparate.value).toBe(false);
    expect(settings.autoSeparationSaveError.value).toBe(
      '目前無法儲存自動產生伴奏設定，已恢復原設定。',
    );
  });
});
