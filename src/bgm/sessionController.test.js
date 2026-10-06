import { nextTick, reactive, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import { createBgmSessionController } from './sessionController.js';

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createHarness() {
  const planState = reactive({
    plan: {
      currentTrackId: 'bgm-track',
      positionSeconds: 14,
      settings: {
        volume: 0.6,
        isMuted: false,
        loop: true,
        fadeInSeconds: 1.5,
        fadeOutSeconds: 1,
        dimDb: -12,
        dimAttackMs: 100,
        dimReleaseMs: 600,
        preRollSeconds: 2,
        postRollSeconds: 2,
      },
    },
  });
  const plan = {
    state: planState,
    initialize: vi.fn(async () => {}),
    setTrack: vi.fn(async (trackId) => {
      planState.plan.currentTrackId = trackId;
      return true;
    }),
    updateSettings: vi.fn(async (settings) => {
      Object.assign(planState.plan.settings, settings);
      return true;
    }),
    updatePosition: vi.fn(async () => true),
  };
  const libraryState = reactive({
    tracks: [
      {
        id: 'bgm-track',
        title: 'BGM Track',
        url: 'utawakui-media://track/bgm-track/audio.wav',
        stemsUrl: 'utawakui-media://track/bgm-track/stems.wav',
        hasSeparation: true,
      },
      {
        id: 'other-track',
        title: 'Other',
        url: 'utawakui-media://track/other-track/audio.wav',
      },
    ],
  });
  const library = {
    state: libraryState,
    tracksById: ref(
      new Map(libraryState.tracks.map((track) => [track.id, track])),
    ),
    initialize: vi.fn(async () => {}),
  };
  const obs = {
    state: reactive({
      observed: {
        lifecycle: 'ready',
        streaming: { active: false },
        recording: { active: false },
      },
    }),
    refreshObsStatus: vi.fn(async () => {}),
  };
  let preStartHook;
  let playingListener;
  let pausedListener;
  let endedListener;
  let stoppedListener;
  const player = {
    cancelPendingStart: vi.fn(),
    pause: vi.fn(),
    registerBeforePlaybackStart: vi.fn((listener) => {
      preStartHook = listener;
      return vi.fn();
    }),
    onPlaying: vi.fn((listener) => {
      playingListener = listener;
      return vi.fn();
    }),
    onPaused: vi.fn((listener) => {
      pausedListener = listener;
      return vi.fn();
    }),
    onEnded: vi.fn((listener) => {
      endedListener = listener;
      return vi.fn();
    }),
    onStopped: vi.fn((listener) => {
      stoppedListener = listener;
      return vi.fn();
    }),
  };
  const deckState = reactive({
    playbackPhase: 'idle',
    currentTime: 0,
  });
  const deck = {
    state: deckState,
    configure: vi.fn(),
    load: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    setDimmed: vi.fn(),
    seek: vi.fn((position) => position),
    dispose: vi.fn(async () => {}),
  };
  const handoffState = reactive({
    sessionMode: 'inactive',
    phase: 'idle',
    audibleLane: null,
    bgmRequested: false,
    restorePending: false,
    error: null,
  });
  const coordinator = {
    state: handoffState,
    updateSessionMode: vi.fn(async (mode) => {
      handoffState.sessionMode = mode;
      return true;
    }),
    requestBgmPlay: vi.fn(async () => true),
    requestBgmPause: vi.fn(async () => true),
    acquirePreview: vi.fn(async () => ({ release: vi.fn() })),
    replaceBgmSource: vi.fn(async (replaceSource) => {
      replaceSource();
      return true;
    }),
    beforePerformanceStart: vi.fn(async () => true),
    notifyPerformancePlaying: vi.fn(),
    notifyPerformanceInterrupted: vi.fn(),
    notifyPerformanceEnded: vi.fn(async () => true),
    notifyBgmTerminated: vi.fn(),
    dispose: vi.fn(),
  };
  const projector = {
    update: vi.fn((observed) => {
      if (observed.streaming.active) return 'live';
      if (observed.recording.active) return 'record';
      return 'inactive';
    }),
  };
  const controller = createBgmSessionController({
    plan,
    library,
    obs,
    player,
    deck,
    coordinator,
    projector,
  });

  return {
    controller,
    coordinator,
    deck,
    deckState,
    endedListener: () => endedListener,
    handoffState,
    library,
    obs,
    plan,
    player,
    playingListener: () => playingListener,
    pausedListener: () => pausedListener,
    preStartHook: () => preStartHook,
    projector,
    stoppedListener: () => stoppedListener,
  };
}

describe('BGM session controller', () => {
  it('registers the player safety boundary before asynchronous data restore finishes', async () => {
    const restore = createDeferred();
    const { controller, plan, player } = createHarness();
    plan.initialize.mockImplementation(() => restore.promise);

    const initialization = controller.initialize();

    expect(player.registerBeforePlaybackStart).toHaveBeenCalledOnce();
    expect(player.onPlaying).toHaveBeenCalledOnce();
    expect(player.onPaused).toHaveBeenCalledOnce();
    expect(player.onEnded).toHaveBeenCalledOnce();
    expect(player.onStopped).toHaveBeenCalledOnce();

    restore.resolve();
    await initialization;
  });

  it('contains initialization failures as a bounded controller state', async () => {
    const { controller, plan } = createHarness();
    plan.initialize.mockRejectedValue(
      new Error('E:/private/bgm-standby.json failed'),
    );

    await expect(controller.initialize()).resolves.toBe(false);
    expect(controller.state).toEqual(
      expect.objectContaining({
        isInitialized: false,
        error: 'BGM 現場控制初始化失敗。',
      }),
    );
    expect(controller.state.error).not.toContain('E:/private');
  });

  it('initializes preparation and loads the original library audio silently', async () => {
    const { controller, deck, library, obs, plan } = createHarness();

    await controller.initialize();

    expect(plan.initialize).toHaveBeenCalledOnce();
    expect(library.initialize).toHaveBeenCalledOnce();
    expect(obs.refreshObsStatus).toHaveBeenCalledOnce();
    expect(deck.load).toHaveBeenCalledWith(
      'utawakui-media://track/bgm-track/audio.wav',
      expect.objectContaining({ loop: true, positionSeconds: 14 }),
    );
    expect(deck.load.mock.calls[0][0]).not.toContain('stems.wav');
    expect(deck.configure).toHaveBeenCalledWith(plan.state.plan.settings);
    expect(controller.state.isInitialized).toBe(true);
  });

  it('projects OBS state and wires the one player handoff boundary', async () => {
    const {
      controller,
      coordinator,
      endedListener,
      obs,
      pausedListener,
      playingListener,
      preStartHook,
      stoppedListener,
    } = createHarness();
    await controller.initialize();

    obs.state.observed.streaming.active = true;
    await nextTick();
    await nextTick();
    expect(coordinator.updateSessionMode).toHaveBeenLastCalledWith('live');

    await expect(preStartHook()()).resolves.toBe(true);
    expect(coordinator.beforePerformanceStart).toHaveBeenCalledOnce();

    playingListener()({ trackId: 'song', playbackRevision: 1 });
    expect(coordinator.notifyPerformancePlaying).toHaveBeenCalledOnce();

    pausedListener()({ trackId: 'song', playbackRevision: 1 });
    expect(coordinator.notifyPerformanceInterrupted).toHaveBeenCalledWith(
      'pause',
    );

    await endedListener()({ trackId: 'song', playbackRevision: 1 });
    expect(coordinator.notifyPerformanceEnded).toHaveBeenCalledOnce();

    await stoppedListener()({
      reason: 'error',
      trackId: 'song',
      playbackRevision: 2,
    });
    expect(coordinator.notifyPerformanceEnded).toHaveBeenCalledTimes(2);
  });

  it('keeps LIVE primary while exposing simultaneous recording', async () => {
    const { controller, obs } = createHarness();
    await controller.initialize();

    obs.state.observed.streaming.active = true;
    obs.state.observed.recording.active = true;
    await nextTick();

    expect(controller.sessionIndicators.value).toEqual({
      isLive: true,
      isRecording: true,
      isReconnecting: false,
    });
  });

  it('keeps explicit BGM controls separate from plan persistence', async () => {
    const { controller, coordinator, deck, plan } = createHarness();
    await controller.initialize();

    await controller.playBgm();
    await controller.pauseBgm();
    await controller.emergencyCut();
    controller.setDimmed(true);
    controller.previewVolume(0.7);
    controller.seekBgm(22.5);
    await controller.commitBgmPosition();
    await controller.setVolume(0.75);
    await controller.setMuted(true);

    expect(coordinator.requestBgmPlay).toHaveBeenCalledOnce();
    expect(coordinator.requestBgmPause).toHaveBeenNthCalledWith(1);
    expect(coordinator.requestBgmPause).toHaveBeenNthCalledWith(2, {
      immediate: true,
    });
    expect(deck.setDimmed).toHaveBeenCalledWith(true);
    expect(deck.setVolume).toHaveBeenCalledWith(0.7);
    expect(deck.setVolume).toHaveBeenCalledWith(0.75);
    expect(deck.seek).toHaveBeenCalledWith(22.5);
    expect(plan.updatePosition).toHaveBeenCalledWith('bgm-track', 0);
    expect(plan.updateSettings).toHaveBeenCalledWith({ volume: 0.75 });
    expect(plan.updateSettings).toHaveBeenCalledWith({ isMuted: true });
  });

  it('projects terminal deck events back into the handoff authority', async () => {
    const { controller, coordinator, deckState } = createHarness();
    await controller.initialize();

    deckState.playbackPhase = 'error';
    await nextTick();
    expect(coordinator.notifyBgmTerminated).toHaveBeenLastCalledWith('error');

    deckState.playbackPhase = 'ended';
    await nextTick();
    expect(coordinator.notifyBgmTerminated).toHaveBeenLastCalledWith('ended');
  });

  it('reloads only when the selected source changes and persists position on pause', async () => {
    const { controller, deck, deckState, plan } = createHarness();
    await controller.initialize();
    deck.load.mockClear();
    deckState.currentTime = 31.5;

    await controller.pauseBgm();
    expect(plan.updatePosition).toHaveBeenCalledWith('bgm-track', 31.5);

    await plan.setTrack('other-track');
    await nextTick();
    expect(deck.load).toHaveBeenCalledWith(
      'utawakui-media://track/other-track/audio.wav',
      expect.objectContaining({ positionSeconds: 14 }),
    );
  });

  it('lets the latest selection cancel an in-flight source change back to the loaded track', async () => {
    const { controller, coordinator, deck, plan } = createHarness();
    await controller.initialize();
    deck.load.mockClear();
    coordinator.replaceBgmSource.mockClear();
    const firstChange = createDeferred();
    const latestChange = createDeferred();
    coordinator.replaceBgmSource
      .mockImplementationOnce(() => firstChange.promise)
      .mockImplementationOnce(async (replaceSource) => {
        await latestChange.promise;
        replaceSource();
        return true;
      });

    await plan.setTrack('other-track');
    await nextTick();
    await plan.setTrack('bgm-track');
    await nextTick();

    expect(coordinator.replaceBgmSource).toHaveBeenCalledTimes(2);

    firstChange.resolve(false);
    latestChange.resolve();
    await vi.waitFor(() => expect(deck.load).toHaveBeenCalledOnce());
    expect(deck.load).toHaveBeenLastCalledWith(
      'utawakui-media://track/bgm-track/audio.wav',
      expect.any(Object),
    );
  });

  it('drops a gated start and pauses the performance before acquiring a preview', async () => {
    const { controller, coordinator, player } = createHarness();
    const order = [];
    player.cancelPendingStart.mockImplementation(() => order.push('cancel'));
    player.pause.mockImplementation(() => order.push('pause'));
    coordinator.acquirePreview.mockImplementation(async () => {
      order.push('acquire');
      return { release: vi.fn() };
    });
    const onPreempt = vi.fn();

    await expect(
      controller.acquirePreviewLane({ onPreempt }),
    ).resolves.not.toBeNull();

    expect(order).toEqual(['cancel', 'pause', 'acquire']);
    expect(coordinator.acquirePreview).toHaveBeenCalledWith({ onPreempt });
  });

  it('leaves a recording or live performance untouched when preview is blocked', async () => {
    const { controller, coordinator, handoffState, player } = createHarness();
    handoffState.sessionMode = 'live';

    await expect(controller.acquirePreviewLane()).resolves.toBeNull();

    expect(player.cancelPendingStart).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
    expect(coordinator.acquirePreview).not.toHaveBeenCalled();
  });
});
