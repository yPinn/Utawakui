import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let playerState;
let queueState;
let lyricsState;
let initializeLibrary;
let initializePlaylists;
let initializeLyrics;
let libraryHydration;
let playlistHydration;
let lyricsHydration;
let bridge;

beforeEach(() => {
  vi.resetModules();
  playerState = reactive({
    track: null,
    isPlaying: false,
    playbackPhase: 'idle',
    currentTime: 0,
    duration: 0,
    tempoRate: 1,
    continuityRevision: 0,
    error: null,
  });
  queueState = reactive({
    historyEntries: [],
    currentTrack: null,
    sourceName: '',
  });
  lyricsState = reactive({ offsetSeconds: 0 });
  libraryHydration = deferred();
  playlistHydration = deferred();
  lyricsHydration = deferred();
  initializeLibrary = vi.fn(() => libraryHydration.promise);
  initializePlaylists = vi.fn(() => playlistHydration.promise);
  initializeLyrics = vi.fn(() => lyricsHydration.promise);
  bridge = {
    connectOutputSource: vi.fn(async () => ({
      running: true,
      bootId: 'boot-main',
      revision: 0,
      desired: { running: true, port: 8700 },
      observed: {
        serviceLifecycle: 'listening',
        sourceSynchronization: 'syncing',
      },
    })),
    getOutputSettings: vi.fn(async () => ({
      autoStart: true,
      port: 8700,
      displayDelayMs: 0,
    })),
    getOutputStatus: vi.fn(async () => ({
      running: true,
      bootId: 'boot-main',
      revision: 1,
      desired: { running: true, port: 8700 },
      observed: {
        serviceLifecycle: 'listening',
        sourceSynchronization: 'ready',
      },
    })),
    publishOutputSnapshot: vi.fn(async () => true),
    suggestOutputPorts: vi.fn(async () => [8701, 8702]),
    updateOutputSettings: vi.fn(async (settings) => ({
      settings,
      status: {
        running: settings.autoStart,
        bootId: 'boot-main',
        desired: { running: settings.autoStart, port: settings.port },
        observed: {
          serviceLifecycle: settings.autoStart ? 'listening' : 'stopped',
          sourceSynchronization: 'ready',
        },
      },
    })),
    startOutput: vi.fn(async () => ({
      running: true,
      bootId: 'boot-main',
      desired: { running: true, port: 8700 },
      observed: {
        serviceLifecycle: 'listening',
        sourceSynchronization: 'ready',
      },
    })),
    stopOutput: vi.fn(async () => ({
      running: false,
      bootId: 'boot-main',
      desired: { running: false, port: 8700 },
      observed: {
        serviceLifecycle: 'stopped',
        sourceSynchronization: 'ready',
      },
    })),
    listOutputSlots: vi.fn(async () => ({ version: 2, slots: {} })),
    upsertOutputSlot: vi.fn(async (kind, slot) => ({
      version: 2,
      slots: { [kind]: slot },
    })),
  };
  vi.stubGlobal('window', { Utawakui: bridge });

  vi.doMock('./usePlayer.js', () => ({
    usePlayer: () => ({ state: playerState }),
  }));
  vi.doMock('./usePlaybackQueue.js', () => ({
    usePlaybackQueue: () => ({
      state: queueState,
      upcomingTracks: { value: [] },
    }),
  }));
  vi.doMock('./useLyrics.js', () => ({
    useLyrics: () => ({
      state: lyricsState,
      selectedTrack: { value: null },
      selectedSource: { value: null },
      lyricLines: { value: [] },
      activeLineIndex: { value: -1 },
      initialize: initializeLyrics,
    }),
  }));
  vi.doMock('./useLibrary.js', () => ({
    useLibrary: () => ({ initialize: initializeLibrary }),
  }));
  vi.doMock('./usePlaylists.js', () => ({
    usePlaylists: () => ({ initialize: initializePlaylists }),
  }));
  vi.doMock('./useFeatureGateAccess.js', () => ({
    useFeatureGateAccess: () => ({
      requireFeatureGate: vi.fn(async () => true),
    }),
  }));
  vi.doMock('./useFeatureGates.js', () => ({
    useFeatureGates: () => ({ isFeatureEnabled: () => true }),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function loadRuntime() {
  const { useOutputRuntime } = await import('./useOutputRuntime.js');
  return useOutputRuntime();
}

describe('output source handshake', () => {
  it('has no IPC or hydration side effects at module import time', async () => {
    await loadRuntime();

    expect(bridge.connectOutputSource).not.toHaveBeenCalled();
    expect(initializeLibrary).not.toHaveBeenCalled();
    expect(initializePlaylists).not.toHaveBeenCalled();
    expect(initializeLyrics).not.toHaveBeenCalled();
    expect(bridge.publishOutputSnapshot).not.toHaveBeenCalled();
  });

  it('publishes exactly one full v2 snapshot after all sources settle', async () => {
    const runtime = await loadRuntime();
    const first = runtime.initialize();
    const repeated = runtime.initialize();

    await flushMicrotasks();
    expect(bridge.connectOutputSource).toHaveBeenCalledOnce();
    expect(bridge.publishOutputSnapshot).not.toHaveBeenCalled();

    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await Promise.all([first, repeated]);

    expect(initializeLibrary).toHaveBeenCalledOnce();
    expect(initializePlaylists).toHaveBeenCalledOnce();
    expect(initializeLyrics).toHaveBeenCalledOnce();
    expect(bridge.publishOutputSnapshot).toHaveBeenCalledOnce();
    expect(bridge.publishOutputSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        contractVersion: 3,
        bootId: 'boot-main',
        sourceEpoch: expect.any(String),
        kind: 'full',
        revision: 1,
        payload: expect.objectContaining({ version: 2, revision: 1 }),
      }),
    );
  });

  it('does not run a renderer-owned auto-start loop', async () => {
    bridge.connectOutputSource.mockResolvedValueOnce({
      running: false,
      bootId: 'boot-main',
      revision: 0,
      desired: { running: true, port: 8700 },
      observed: {
        serviceLifecycle: 'starting',
        sourceSynchronization: 'syncing',
      },
    });
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;

    expect(bridge.startOutput).not.toHaveBeenCalled();
  });

  it('fails closed without an unhandled rejection when source connection fails', async () => {
    bridge.connectOutputSource.mockRejectedValueOnce(
      new Error('source connection failed'),
    );
    const runtime = await loadRuntime();

    await expect(runtime.initialize()).resolves.toBe(false);

    expect(runtime.state.error).toContain('輸出初始化失敗');
    expect(bridge.publishOutputSnapshot).not.toHaveBeenCalled();
    expect(initializeLibrary).not.toHaveBeenCalled();
  });

  it('uses update envelopes until playback continuity changes', async () => {
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    const firstEnvelope = bridge.publishOutputSnapshot.mock.calls[0][0];

    playerState.currentTime = 2;
    await flushMicrotasks();
    expect(bridge.publishOutputSnapshot.mock.calls.at(-1)[0]).toMatchObject({
      sourceEpoch: firstEnvelope.sourceEpoch,
      kind: 'update',
      revision: 2,
      payload: { version: 2, revision: 2 },
    });

    playerState.continuityRevision += 1;
    await flushMicrotasks();
    const nextEnvelope = bridge.publishOutputSnapshot.mock.calls.at(-1)[0];
    expect(nextEnvelope).toMatchObject({
      kind: 'full',
      revision: 1,
      payload: { version: 2, revision: 1 },
    });
    expect(nextEnvelope.sourceEpoch).not.toBe(firstEnvelope.sourceEpoch);
  });
});

describe('output runtime actions', () => {
  async function initializeRuntime() {
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    return runtime;
  }

  it('refreshes status, persists settings, and delegates start/stop intents', async () => {
    const runtime = await initializeRuntime();

    await expect(runtime.refreshStatus()).resolves.toMatchObject({
      running: true,
      observed: { serviceLifecycle: 'listening' },
    });
    await expect(
      runtime.updateSettings({
        autoStart: false,
        port: 8702,
        displayDelayMs: 300,
      }),
    ).resolves.toBe(true);
    expect(bridge.updateOutputSettings).toHaveBeenCalledWith({
      autoStart: false,
      port: 8702,
      displayDelayMs: 300,
    });

    await expect(runtime.start()).resolves.toBe(true);
    await expect(runtime.stop()).resolves.toBe(true);
    expect(bridge.startOutput).toHaveBeenCalledOnce();
    expect(bridge.stopOutput).toHaveBeenCalledOnce();
  });

  it('loads seed slots and persists template and appearance changes', async () => {
    const runtime = await initializeRuntime();
    const seed = {
      templateId: 'focus-line',
      styleSetIds: [],
      settings: { alignment: 'left' },
    };

    await runtime.loadSlots({ lyrics: seed });
    expect(bridge.upsertOutputSlot).toHaveBeenCalledWith('lyrics', seed);
    expect(runtime.state.slots.lyrics).toEqual(seed);

    await expect(
      runtime.saveTemplateSelection('lyrics', 'karaoke-stack'),
    ).resolves.toBe(true);
    await expect(
      runtime.saveSlotSettings('lyrics', { alignment: 'center' }),
    ).resolves.toBe(true);
    expect(bridge.upsertOutputSlot).toHaveBeenLastCalledWith(
      'lyrics',
      expect.objectContaining({ settings: { alignment: 'center' } }),
    );
  });

  it('surfaces bounded failures and port suggestions without throwing', async () => {
    const runtime = await initializeRuntime();
    bridge.getOutputStatus.mockResolvedValueOnce({
      running: false,
      bootId: 'boot-main',
      error: { message: 'listen EADDRINUSE' },
    });
    await runtime.refreshStatus();
    expect(runtime.state.suggestedPorts).toEqual([8701, 8702]);

    bridge.updateOutputSettings.mockRejectedValueOnce(
      new Error('listen EADDRINUSE'),
    );
    await expect(
      runtime.updateSettings({
        autoStart: true,
        port: 8701,
        displayDelayMs: 0,
      }),
    ).resolves.toBe(false);
    expect(runtime.state.error).toContain('保存輸出設定失敗');

    bridge.startOutput.mockRejectedValueOnce(new Error('start failed'));
    await expect(runtime.start()).resolves.toBe(false);
    bridge.stopOutput.mockRejectedValueOnce(new Error('stop failed'));
    await expect(runtime.stop()).resolves.toBe(false);
    bridge.listOutputSlots.mockRejectedValueOnce(new Error('slots failed'));
    await expect(runtime.loadSlots()).resolves.toBeUndefined();
    expect(runtime.state.error).toContain('讀取輸出設定失敗');
  });
});
