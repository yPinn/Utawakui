import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function plan(overrides = {}) {
  return {
    version: 3,
    updatedAt: null,
    trackIds: [],
    currentTrackId: null,
    positionSeconds: 0,
    settings: {
      volume: 0.25,
      isMuted: false,
      loop: true,
      fadeInSeconds: 1,
      fadeOutSeconds: 0.6,
      dimDb: -12,
      dimAttackMs: 100,
      dimReleaseMs: 600,
      preRollSeconds: 0.75,
      postRollSeconds: 1,
    },
    items: [],
    ...overrides,
  };
}

async function loadPlanOwner(overrides = {}) {
  let libraryUpdated;
  const bridge = {
    getBgmStandbyPlan: vi.fn().mockResolvedValue({ ok: true, plan: plan() }),
    setBgmStandbyTrack: vi.fn().mockResolvedValue({
      ok: true,
      plan: plan({
        trackIds: ['track-1'],
        currentTrackId: 'track-1',
        items: [{ trackId: 'track-1', title: 'One', artist: 'A' }],
      }),
    }),
    updateBgmStandbySettings: vi.fn(),
    updateBgmStandbyPosition: vi.fn(),
    onLibraryUpdated: vi.fn((listener) => {
      libraryUpdated = listener;
      return vi.fn();
    }),
    ...overrides,
  };
  vi.stubGlobal('window', { Utawakui: bridge });
  vi.doMock('./useAppDiagnostics.js', () => ({
    useAppDiagnostics: () => ({
      recordError: vi.fn(() => ({ message: 'BGM 未更新。' })),
    }),
  }));
  const { useBgmStandbyPlan } = await import('./useBgmStandbyPlan.js');
  return {
    owner: useBgmStandbyPlan(),
    bridge,
    libraryUpdated: () => libraryUpdated,
  };
}

describe('useBgmStandbyPlan', () => {
  it('keeps base volume and Talk attenuation as independent defaults', async () => {
    vi.doMock('./useAppDiagnostics.js', () => ({
      useAppDiagnostics: () => ({
        recordError: vi.fn(() => ({ message: 'BGM 未更新。' })),
      }),
    }));
    const { BGM_STANDBY_DEFAULT_SETTINGS } =
      await import('./useBgmStandbyPlan.js');

    expect(BGM_STANDBY_DEFAULT_SETTINGS.volume).toBe(0.25);
    expect(BGM_STANDBY_DEFAULT_SETTINGS.dimDb).toBe(-12);
  });

  it('initializes once and refreshes from authoritative plan snapshots', async () => {
    const { owner, bridge, libraryUpdated } = await loadPlanOwner();

    await Promise.all([owner.initialize(), owner.initialize()]);
    await libraryUpdated()();

    expect(bridge.getBgmStandbyPlan).toHaveBeenCalledTimes(2);
    expect(owner.state.isInitialized).toBe(true);
    expect(owner.state.plan.trackIds).toEqual([]);
  });

  it('serializes mutations and replaces local state only with full main snapshots', async () => {
    const { owner, bridge } = await loadPlanOwner();
    await owner.initialize();

    await expect(owner.setTrack('track-1')).resolves.toBe(true);

    expect(bridge.setBgmStandbyTrack).toHaveBeenCalledWith('track-1');
    expect(owner.state.plan.currentTrackId).toBe('track-1');
    expect(owner.currentItem.value).toEqual({
      trackId: 'track-1',
      title: 'One',
      artist: 'A',
    });
  });

  it('forwards bounded scalar intents without deriving media URLs', async () => {
    const response = { ok: true, plan: plan() };
    const { owner, bridge } = await loadPlanOwner({
      updateBgmStandbySettings: vi.fn().mockResolvedValue(response),
      updateBgmStandbyPosition: vi.fn().mockResolvedValue(response),
    });
    await owner.initialize();

    await owner.updateSettings({ volume: 0.4, fadeOutSeconds: 1.2 });
    await owner.updatePosition('track-1', 12);

    expect(bridge.updateBgmStandbySettings).toHaveBeenCalledWith({
      volume: 0.4,
      fadeOutSeconds: 1.2,
    });
    expect(bridge.updateBgmStandbyPosition).toHaveBeenCalledWith({
      trackId: 'track-1',
      positionSeconds: 12,
    });
  });

  it('keeps expected validation separate from operational errors', async () => {
    const { owner } = await loadPlanOwner({
      setBgmStandbyTrack: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          code: 'BGM_TRACK_UNAVAILABLE',
          field: 'trackId',
          message: '這首本機曲目目前無法作為 BGM。',
        },
      }),
    });
    await owner.initialize();

    await expect(owner.setTrack('missing')).resolves.toBe(false);
    expect(owner.state.validationError).toEqual({
      code: 'BGM_TRACK_UNAVAILABLE',
      field: 'trackId',
      message: '這首本機曲目目前無法作為 BGM。',
    });
    expect(owner.state.error).toBeNull();
  });

  it('is a silent no-op without the preload bridge', async () => {
    vi.stubGlobal('window', {});
    vi.doMock('./useAppDiagnostics.js', () => ({
      useAppDiagnostics: () => ({ recordError: vi.fn() }),
    }));
    const { useBgmStandbyPlan } = await import('./useBgmStandbyPlan.js');
    const owner = useBgmStandbyPlan();

    await owner.initialize();
    await expect(owner.setTrack('track-1')).resolves.toBe(false);
    expect(owner.state.isInitialized).toBe(true);
  });
});
