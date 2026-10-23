import { reactive, shallowRef } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectLyricsTextSelection } from '../../shared/presentation/lyricsTextProcessing.mjs';

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
let selectedLyricsTrack;
let selectedLyricsSource;
let lyricsDocument;
let displayLyricsDocument;
let activeLineId;
let activeSegmentId;
let musicStructureSignals;
let loadMusicStructureForTrack;
let libraryTracksById;
let initializeLibrary;
let initializePlaylists;
let initializeLyrics;
let refreshConfirmations;
let featureGateState;
let outputEnabled;
let recordError;
let libraryHydration;
let playlistHydration;
let lyricsHydration;
let bridge;
let arrangementActive;
let arrangementCurrent;
let arrangementPlanState;
let experimentalLyrics;
let hiddenCreditIds;
let mediaPositionMs;
let samplePlaybackClock;

beforeEach(() => {
  hiddenCreditIds = shallowRef([]);
  mediaPositionMs = null;
  samplePlaybackClock = vi.fn(({ now }) => ({
    trackId: playerState.track?.id ?? null,
    continuityRevision: playerState.continuityRevision,
    positionMs: mediaPositionMs ?? playerState.currentTime * 1000,
    rate: playerState.tempoRate,
    phase: playerState.playbackPhase,
    sampledAt: now(),
  }));
  experimentalLyrics = { outputDocument: shallowRef(null) };
  vi.resetModules();
  arrangementActive = shallowRef(false);
  arrangementCurrent = shallowRef(null);
  arrangementPlanState = reactive({ plan: { source: null, items: [] } });
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
  selectedLyricsTrack = shallowRef(null);
  selectedLyricsSource = shallowRef(null);
  lyricsDocument = shallowRef({
    documentId: 'lyrics-empty',
    granularity: 'T0',
    lines: [],
  });
  displayLyricsDocument = lyricsDocument;
  activeLineId = shallowRef(null);
  activeSegmentId = shallowRef(null);
  musicStructureSignals = shallowRef(null);
  loadMusicStructureForTrack = vi.fn(async () => null);
  libraryTracksById = shallowRef(new Map());
  libraryHydration = deferred();
  playlistHydration = deferred();
  lyricsHydration = deferred();
  initializeLibrary = vi.fn(() => libraryHydration.promise);
  initializePlaylists = vi.fn(() => playlistHydration.promise);
  initializeLyrics = vi.fn(() => lyricsHydration.promise);
  featureGateState = reactive({ error: '' });
  outputEnabled = true;
  recordError = vi.fn((error, options) => ({
    message: options.message,
  }));
  refreshConfirmations = vi.fn(async () => ({
    'public-output-flow': { enabled: true },
  }));
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
    getLyricsReading: vi.fn(async () => null),
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
    openOutputWindow: vi.fn(async () => ({ kind: 'lyrics' })),
    listOutputSlots: vi.fn(async () => ({
      version: 3,
      slots: {},
      preferences: {
        recentColors: ['#112233'],
        savedColors: ['#445566'],
      },
    })),
    upsertOutputSlot: vi.fn(async (kind, slot) => ({
      version: 3,
      slots: { [kind]: slot },
      preferences: {
        recentColors: ['#112233'],
        savedColors: ['#445566'],
      },
    })),
    updateOutputRecentColors: vi.fn(async (colors) => ({
      version: 3,
      slots: {},
      preferences: { recentColors: colors, savedColors: ['#445566'] },
    })),
    updateOutputSavedColors: vi.fn(async (colors) => ({
      version: 3,
      slots: {},
      preferences: { recentColors: ['#112233'], savedColors: colors },
    })),
  };
  vi.stubGlobal('window', { Utawakui: bridge });

  vi.doMock('./usePlayer.js', () => ({
    usePlayer: () => ({ state: playerState, samplePlaybackClock }),
  }));
  vi.doMock('./usePerformanceSessionPlayback.js', () => ({
    usePerformanceSessionPlayback: () => ({
      ownsPlayback: arrangementActive,
      currentItem: arrangementCurrent,
    }),
  }));
  vi.doMock('./usePerformanceSessionPlan.js', () => ({
    usePerformanceSessionPlan: () => ({ state: arrangementPlanState }),
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
      selectedTrack: selectedLyricsTrack,
      selectedSource: selectedLyricsSource,
      lyricsDocument,
      displayLyricsDocument,
      experimentalLyrics,
      lyricsTextProcessing: {
        project: (document) =>
          projectLyricsTextSelection(document, hiddenCreditIds.value),
      },
      lyricLines: { value: [] },
      activeLineIndex: { value: -1 },
      activeLineId,
      activeSegmentId,
      initialize: initializeLyrics,
    }),
  }));
  vi.doMock('./useLibrary.js', () => ({
    useLibrary: () => ({
      initialize: initializeLibrary,
      tracksById: libraryTracksById,
    }),
  }));
  vi.doMock('./useMusicStructureSignals.js', () => ({
    useMusicStructureSignals: () => ({
      current: musicStructureSignals,
      loadForTrack: loadMusicStructureForTrack,
    }),
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
    useFeatureGates: () => ({
      state: featureGateState,
      isFeatureEnabled: () => outputEnabled,
      refreshConfirmations,
    }),
  }));
  vi.doMock('./useAppDiagnostics.js', () => ({
    useAppDiagnostics: () => ({ recordError }),
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

it('preserves the exact public runtime API', async () => {
  const runtime = await loadRuntime();

  expect(Object.keys(runtime).sort()).toEqual([
    'initialize',
    'loadSlots',
    'openWindow',
    'refreshProjection',
    'refreshSettings',
    'refreshStatus',
    'saveOutputSlot',
    'saveRecentColor',
    'saveSlotSettings',
    'saveTemplateSelection',
    'start',
    'state',
    'stop',
    'toggleSavedColor',
    'updateSettings',
  ]);
});

it('opens a read-only window with only a kind intent and contains failures for retry', async () => {
  const runtime = await loadRuntime();
  await expect(runtime.openWindow('setlist')).resolves.toBe(true);
  expect(bridge.openOutputWindow).toHaveBeenCalledWith('setlist');
  bridge.openOutputWindow.mockRejectedValueOnce(
    new Error('private main cause'),
  );
  await expect(runtime.openWindow('lyrics')).resolves.toBe(false);
  expect(runtime.state.error).toBe('輸出視窗未開啟，請確認服務已啟動後重試。');
  expect(runtime.state.isOpeningWindow).toBe(false);
  await expect(runtime.openWindow('lyrics')).resolves.toBe(true);
});

it('deduplicates concurrent UI opens while the main operation is pending', async () => {
  const pending = deferred();
  bridge.openOutputWindow.mockReturnValueOnce(pending.promise);
  const runtime = await loadRuntime();
  const first = runtime.openWindow('lyrics');
  await flushMicrotasks();
  await expect(runtime.openWindow('setlist')).resolves.toBe(false);
  pending.resolve({ kind: 'lyrics' });
  await expect(first).resolves.toBe(true);
  expect(bridge.openOutputWindow).toHaveBeenCalledTimes(1);
});

describe('output source handshake', () => {
  it('publishes confirmed credit exclusions and restores without changing source text or singing times', async () => {
    playerState.track = { id: 'track-1', title: 'Song', url: 'media://song' };
    playerState.currentTime = 0.5;
    selectedLyricsTrack.value = { id: 'track-1', title: 'Song' };
    selectedLyricsSource.value = { filename: 'manual.lrc', language: 'zh' };
    const document = {
      documentId: 'source-text',
      granularity: 'T1',
      lines: [
        { lineId: 'credit', text: '作詞：測試', startMs: 0, endMs: 1000 },
        {
          lineId: 'voice',
          text: '[女]一起唱（和聲）',
          startMs: 1000,
          endMs: 4000,
        },
      ],
    };
    lyricsDocument.value = document;
    activeLineId.value = 'credit';
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    bridge.publishOutputSnapshot.mockClear();
    hiddenCreditIds.value = ['credit'];
    await flushMicrotasks();
    await flushMicrotasks();
    const messages = bridge.publishOutputSnapshot.mock.calls.map(
      ([message]) => message,
    );
    const projected = messages
      .filter((message) => message.stream === 'lyrics.document')
      .at(-1).payload.document;
    expect(projected.lines).toEqual([document.lines[1]]);
    expect(projected.documentId).not.toBe(document.documentId);
    expect(
      messages.filter((message) => message.stream === 'state.snapshot').at(-1)
        .payload.lyrics.activeLineId,
    ).toBeNull();
    expect(lyricsDocument.value).toEqual(document);
    hiddenCreditIds.value = [];
    await flushMicrotasks();
    await flushMicrotasks();
    const restored = bridge.publishOutputSnapshot.mock.calls
      .map(([message]) => message)
      .filter((message) => message.stream === 'lyrics.document')
      .at(-1).payload.document;
    expect(restored.lines).toEqual(document.lines);
    expect(restored.documentId).toBe(document.documentId);
  });
  async function initializePlaying() {
    playerState.track = { id: 'a', title: 'A', url: 'media://a' };
    playerState.playbackPhase = 'playing';
    playerState.currentTime = 1;
    const runtime = await loadRuntime();
    const initializing = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initializing;
    bridge.publishOutputSnapshot.mockClear();
    return runtime;
  }

  it('pairs fresh media with publication time after awaiting documents and on offset/rate updates', async () => {
    const runtime = await initializePlaying();
    const pending = deferred();
    bridge.publishOutputSnapshot.mockImplementationOnce(() => pending.promise);
    const refresh = runtime.refreshProjection();
    await flushMicrotasks();
    mediaPositionMs = 1456;
    pending.resolve(true);
    await refresh;
    const state = bridge.publishOutputSnapshot.mock.calls
      .map(([e]) => e)
      .filter((e) => e.stream === 'state.snapshot')
      .at(-1);
    expect(state.payload.playback.positionMs).toBe(1456);
    expect(state.payload.generatedAt).toBe(
      samplePlaybackClock.mock.results.at(-1).value.sampledAt,
    );
    mediaPositionMs = 1666;
    playerState.tempoRate = 1.25;
    lyricsState.offsetSeconds = 0.2;
    await flushMicrotasks();
    expect(
      bridge.publishOutputSnapshot.mock.calls.at(-1)[0].payload,
    ).toMatchObject({
      playback: { positionMs: 1666, rate: 1.25 },
      lyrics: { offsetMs: 200 },
    });
  });

  it('resamples when rejected state recovery waits for status', async () => {
    await initializePlaying();
    bridge.publishOutputSnapshot.mockImplementationOnce(async () => {
      mediaPositionMs = 1800;
      return false;
    });
    lyricsState.offsetSeconds = 0.1;
    await flushMicrotasks();
    const states = bridge.publishOutputSnapshot.mock.calls
      .map(([e]) => e)
      .filter((e) => e.stream === 'state.snapshot');
    expect(states).toHaveLength(2);
    expect(states[1].payload.playback.positionMs).toBe(1800);
  });

  it('abandons a rejected state recovery when continuity changed during the response', async () => {
    await initializePlaying();
    bridge.publishOutputSnapshot.mockImplementationOnce(async () => {
      playerState.track = { id: 'b', title: 'B', url: 'media://b' };
      playerState.continuityRevision++;
      mediaPositionMs = 50;
      return false;
    });
    lyricsState.offsetSeconds = 0.1;
    await flushMicrotasks();
    const states = bridge.publishOutputSnapshot.mock.calls
      .map(([e]) => e)
      .filter((e) => e.stream === 'state.snapshot');
    expect(states[0].payload.playback.track.id).toBe('a');
    expect(
      states.slice(1).every((e) => e.payload.playback.track.id === 'b'),
    ).toBe(true);
    expect(states.at(-1)).toMatchObject({
      kind: 'full',
      payload: { playback: { positionMs: 50 } },
    });
  });

  it('skips stale content after a document wait crosses a track continuity change', async () => {
    const runtime = await initializePlaying();
    const pending = deferred();
    bridge.publishOutputSnapshot.mockImplementationOnce(() => pending.promise);
    const refresh = runtime.refreshProjection();
    await flushMicrotasks();
    playerState.track = { id: 'b', title: 'B', url: 'media://b' };
    playerState.continuityRevision++;
    mediaPositionMs = 300;
    await flushMicrotasks();
    pending.resolve(true);
    await refresh;
    const states = bridge.publishOutputSnapshot.mock.calls
      .map(([e]) => e)
      .filter((e) => e.stream === 'state.snapshot');
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((e) => e.payload.playback.track.id === 'b')).toBe(true);
    expect(states[0].kind).toBe('full');
  });

  it('does not reference an old lyrics document if the selected source changes during delivery', async () => {
    const runtime = await initializePlaying();
    selectedLyricsTrack.value = { id: 'a' };
    lyricsDocument.value = {
      documentId: 'old',
      granularity: 'T1',
      lines: [{ lineId: 'one', text: 'Old', startMs: 0, endMs: 5000 }],
    };
    await flushMicrotasks();
    bridge.publishOutputSnapshot.mockClear();
    const pending = deferred();
    bridge.publishOutputSnapshot.mockImplementationOnce(() => pending.promise);
    const refresh = runtime.refreshProjection();
    await flushMicrotasks();
    lyricsDocument.value = {
      documentId: 'new',
      granularity: 'T1',
      lines: [{ lineId: 'two', text: 'New', startMs: 1000, endMs: 5000 }],
    };
    mediaPositionMs = 1500;
    await flushMicrotasks();
    pending.resolve(true);
    await refresh;
    const states = bridge.publishOutputSnapshot.mock.calls
      .map(([e]) => e)
      .filter((e) => e.stream === 'state.snapshot');
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((e) => e.payload.lyrics.documentId === 'new')).toBe(
      true,
    );
    expect(states[0].kind).toBe('update');
    expect(states.at(-1).payload.lyrics.activeLineId).toBe('two');
  });

  it('keeps manual arrangement position and rate independent of physical media sampling', async () => {
    await initializePlaying();
    mediaPositionMs = 9000;
    playerState.tempoRate = 1.5;
    const manual = {
      itemId: 'manual',
      mode: 'manual',
      displayTitle: 'Manual',
      progress: 'playing',
    };
    arrangementPlanState.plan.items = [manual];
    arrangementCurrent.value = manual;
    arrangementActive.value = true;
    await flushMicrotasks();
    expect(
      bridge.publishOutputSnapshot.mock.calls.at(-1)[0].payload.playback,
    ).toMatchObject({
      positionMs: 0,
      rate: 1,
      status: 'playing',
      track: { id: 'manual' },
    });
  });

  it('keeps document replacement within an accepted epoch against the real Projection Hub', async () => {
    const { createOutputProjectionHub } =
      await import('../../electron/lib/outputProjection.js');
    const hub = createOutputProjectionHub({ bootId: 'boot-main' });
    hub.connectSource('clock-test');
    const receipts = [];
    bridge.publishOutputSnapshot.mockImplementation(async (envelope) => {
      const accepted = hub.publish(envelope, 'clock-test');
      receipts.push({ envelope, accepted });
      return accepted;
    });
    selectedLyricsTrack.value = { id: 'a' };
    lyricsDocument.value = {
      documentId: 'old',
      granularity: 'T1',
      lines: [{ lineId: 'one', text: 'Old', startMs: 0, endMs: 5000 }],
    };
    const runtime = await initializePlaying();
    const pending = deferred();
    bridge.publishOutputSnapshot.mockImplementationOnce(async (envelope) => {
      const accepted = hub.publish(envelope, 'clock-test');
      receipts.push({ envelope, accepted });
      await pending.promise;
      return accepted;
    });
    const refresh = runtime.refreshProjection();
    await flushMicrotasks();
    lyricsDocument.value = {
      documentId: 'new',
      granularity: 'T1',
      lines: [{ lineId: 'two', text: 'New', startMs: 0, endMs: 5000 }],
    };
    await flushMicrotasks();
    pending.resolve();
    await expect(refresh).resolves.toBe(true);
    expect(receipts.length).toBeGreaterThan(4);
    expect(receipts.every(({ accepted }) => accepted)).toBe(true);
  });
  it('publishes arrangement labels and confirmed results, then returns to ordinary playback without modifying either owner', async () => {
    const runtime = await loadRuntime();
    playerState.track = { id: 'track-1', title: 'Canonical', url: 'private' };
    playerState.playbackPhase = 'paused';
    arrangementPlanState.plan = {
      source: { name: 'Tonight' },
      items: [
        {
          itemId: 'done',
          trackId: 'track-1',
          displayTitle: 'Encore',
          progress: 'completed',
        },
        {
          itemId: 'now',
          trackId: 'track-1',
          displayTitle: 'Live version',
          progress: 'playing',
        },
        {
          itemId: 'skipped',
          trackId: 'track-1',
          displayTitle: 'Skipped',
          progress: 'skipped',
        },
      ],
    };
    arrangementCurrent.value = { ...arrangementPlanState.plan.items[1] };
    arrangementActive.value = true;
    const initializing = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initializing;
    const envelopes = () =>
      bridge.publishOutputSnapshot.mock.calls.map(([envelope]) => envelope);
    const document = () =>
      envelopes()
        .filter((e) => e.stream === 'queue.document')
        .at(-1).payload.document;
    expect(document()).toMatchObject({
      sourceName: 'Tonight',
      items: [
        { state: 'played', track: { title: 'Encore' } },
        { state: 'current', track: { title: 'Live version' } },
      ],
    });
    expect(envelopes().at(-1).payload.playback).toMatchObject({
      status: 'paused',
      track: { id: 'track-1', title: 'Live version' },
    });
    const documentsBeforeClock = envelopes().filter(
      (e) => e.stream === 'queue.document',
    ).length;
    playerState.currentTime = 12;
    await flushMicrotasks();
    expect(
      envelopes().filter((e) => e.stream === 'queue.document'),
    ).toHaveLength(documentsBeforeClock);
    expect(envelopes().at(-1).payload.playback.positionMs).toBe(12000);
    arrangementPlanState.plan.items[1].progress = 'completed';
    arrangementCurrent.value = null;
    await flushMicrotasks();
    expect(document().items.map((i) => i.state)).toEqual(['played', 'played']);
    queueState.sourceName = 'Album';
    queueState.currentTrack = playerState.track;
    arrangementActive.value = false;
    await flushMicrotasks();
    expect(document()).toMatchObject({
      sourceName: 'Album',
      items: [{ state: 'current', track: { title: 'Canonical' } }],
    });
    expect(playerState.track.title).toBe('Canonical');
    expect(arrangementPlanState.plan.items[0].progress).toBe('completed');
  });
  it('has no IPC or hydration side effects at module import time', async () => {
    await loadRuntime();

    expect(bridge.connectOutputSource).not.toHaveBeenCalled();
    expect(initializeLibrary).not.toHaveBeenCalled();
    expect(initializePlaylists).not.toHaveBeenCalled();
    expect(initializeLyrics).not.toHaveBeenCalled();
    expect(bridge.publishOutputSnapshot).not.toHaveBeenCalled();
  });

  it('publishes one ordered split handshake after all sources settle', async () => {
    const runtime = await loadRuntime();
    const first = runtime.initialize();
    const repeated = runtime.initialize();

    await flushMicrotasks();
    expect(bridge.connectOutputSource).toHaveBeenCalledOnce();
    expect(refreshConfirmations).toHaveBeenCalledOnce();
    expect(bridge.publishOutputSnapshot).not.toHaveBeenCalled();

    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await Promise.all([first, repeated]);

    expect(initializeLibrary).toHaveBeenCalledOnce();
    expect(initializePlaylists).toHaveBeenCalledOnce();
    expect(initializeLyrics).toHaveBeenCalledOnce();
    expect(bridge.publishOutputSnapshot).toHaveBeenCalledTimes(2);
    expect(bridge.publishOutputSnapshot.mock.calls[0][0]).toMatchObject({
      contractVersion: 3,
      bootId: 'boot-main',
      sourceEpoch: expect.any(String),
      stream: 'queue.document',
      kind: 'full',
      revision: 1,
      payload: {
        document: { documentId: 'queue-current', items: [] },
      },
    });
    expect(bridge.publishOutputSnapshot.mock.calls[1][0]).toMatchObject({
      contractVersion: 3,
      bootId: 'boot-main',
      sourceEpoch: expect.any(String),
      stream: 'state.snapshot',
      kind: 'full',
      revision: 1,
      payload: {
        lyrics: { documentId: null, documentRevision: 0 },
        queue: { documentId: 'queue-current', documentRevision: 1 },
      },
    });
    expect(
      bridge.publishOutputSnapshot.mock.calls.filter(
        ([message]) =>
          message.stream === 'state.snapshot' && message.kind === 'full',
      ),
    ).toHaveLength(1);
  });

  it('publishes applied model starts before state, and disables them through the existing document stream', async () => {
    playerState.track = { id: 'track-1', title: 'Song', url: 'media://song' };
    selectedLyricsTrack.value = { id: 'track-1' };
    selectedLyricsSource.value = { filename: 'source.lrc', language: 'ja' };
    lyricsDocument.value = {
      documentId: 'doc',
      granularity: 'T1',
      lines: [{ lineId: 'line', text: '歌詞です', startMs: 1000, endMs: 5000 }],
    };
    const canonical = structuredClone(lyricsDocument.value);
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    bridge.publishOutputSnapshot.mockClear();
    experimentalLyrics.outputDocument.value = {
      ...canonical,
      lines: [
        {
          ...canonical.lines[0],
          estimatedStarts: {
            version: 1,
            segments: [
              { segmentId: 'model-a', text: '歌詞', startMs: 1200 },
              { segmentId: 'model-b', text: 'です', startMs: 3000 },
            ],
          },
        },
      ],
    };
    await flushMicrotasks();
    const messages = bridge.publishOutputSnapshot.mock.calls.map(
      ([value]) => value,
    );
    const contentIndex = messages.findIndex(
      (m) => m.stream === 'lyrics.document',
    );
    const stateIndex = messages.findIndex((m) => m.stream === 'state.snapshot');
    expect(contentIndex).toBeGreaterThanOrEqual(0);
    expect(stateIndex).toBeGreaterThan(contentIndex);
    expect(
      messages[contentIndex].payload.document.lines[0].estimatedStarts.version,
    ).toBe(1);
    expect(messages[stateIndex].payload.lyrics.documentRevision).toBe(
      messages[contentIndex].revision,
    );
    const epoch = messages[stateIndex].sourceEpoch;
    bridge.publishOutputSnapshot.mockClear();
    experimentalLyrics.outputDocument.value = null;
    lyricsState.offsetSeconds = 0.1;
    await flushMicrotasks();
    const fallback = bridge.publishOutputSnapshot.mock.calls.map(
      ([value]) => value,
    );
    expect(
      fallback.find((m) => m.stream === 'lyrics.document').payload.document,
    ).toEqual({ ...canonical, trackId: 'track-1', source: { language: 'ja' } });
    expect(fallback.find((m) => m.stream === 'state.snapshot')).toMatchObject({
      sourceEpoch: epoch,
      payload: { lyrics: { offsetMs: 100 } },
    });
    expect(lyricsDocument.value).toEqual(canonical);
  });

  it('publishes the derived display lyrics document while keeping canonical authoring private', async () => {
    playerState.track = { id: 'track-1', title: 'Song', url: 'media://song' };
    selectedLyricsTrack.value = { id: 'track-1', title: 'Song' };
    selectedLyricsSource.value = { language: 'zh' };
    lyricsDocument.value = {
      documentId: 'lyrics-canonical',
      granularity: 'T1',
      lines: [
        {
          lineId: 'line-1',
          text: '简体歌词',
          startMs: 1000,
          endMs: 2000,
        },
      ],
    };
    displayLyricsDocument = shallowRef({
      documentId: 'lyrics-display-s2tw',
      granularity: 'T1',
      lines: [
        {
          lineId: 'line-1',
          text: '簡體歌詞',
          startMs: 1000,
          endMs: 2000,
        },
      ],
    });
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;

    const lyricsMessage = bridge.publishOutputSnapshot.mock.calls
      .map(([message]) => message)
      .find((message) => message.stream === 'lyrics.document');
    expect(lyricsMessage.payload.document).toMatchObject({
      documentId: 'lyrics-display-s2tw',
      lines: [{ lineId: 'line-1', text: '簡體歌詞' }],
    });
    expect(JSON.stringify(lyricsMessage)).not.toContain('简体歌词');
  });

  it('loads and publishes an existing Japanese reading when provider language is undetermined', async () => {
    const fingerprint = 'a'.repeat(64);
    playerState.track = { id: 'track-1', title: 'Song', url: 'media://song' };
    selectedLyricsTrack.value = { id: 'track-1', title: 'Song' };
    selectedLyricsSource.value = {
      filename: 'betterlyrics.lrc',
      language: 'und',
    };
    lyricsDocument.value = {
      documentId: 'betterlyrics:1',
      normalizerProfileId: 'lyrics-source-v2',
      source: { sha256: fingerprint },
      granularity: 'T1',
      lines: [
        {
          lineId: 'line-1',
          text: '残したこの火種は離さない',
          startMs: 15000,
          endMs: 19000,
        },
      ],
    };
    bridge.getLyricsReading.mockResolvedValue({
      version: 3,
      documentId: 'betterlyrics:1',
      normalizerProfileId: 'lyrics-source-v2',
      sourceFingerprint: fingerprint,
      lines: [
        {
          lineId: 'line-1',
          text: '残したこの火種は離さない',
          segments: [
            { t: '残', r: 'のこ' },
            { t: 'したこの' },
            { t: '火種', r: 'ひだね' },
            { t: 'は' },
            { t: '離', r: 'はな' },
            { t: 'さない' },
          ],
        },
      ],
    });

    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    await flushMicrotasks();

    expect(bridge.getLyricsReading).toHaveBeenCalledWith(
      'track-1',
      'betterlyrics.lrc',
      expect.objectContaining({
        documentId: 'betterlyrics:1',
        sourceFingerprint: fingerprint,
      }),
    );
    const lyricsMessages = bridge.publishOutputSnapshot.mock.calls
      .map(([message]) => message)
      .filter((message) => message.stream === 'lyrics.document');
    expect(
      lyricsMessages.at(-1).payload.document.reading.lines[0].segments,
    ).toContainEqual({ text: '火種', reading: 'ひだね' });
  });

  it('republishes the already-playing current projection on Workbench refresh', async () => {
    playerState.track = { id: 'track-1', title: 'Song', url: 'media://song' };
    playerState.isPlaying = true;
    playerState.playbackPhase = 'playing';
    playerState.currentTime = 44;
    selectedLyricsTrack.value = { id: 'track-1', title: 'Song' };
    selectedLyricsSource.value = { language: 'ja' };
    lyricsDocument.value = {
      documentId: 'lyrics-current',
      granularity: 'T1',
      lines: [
        {
          lineId: 'line-current',
          text: 'Current line',
          startMs: 43000,
          endMs: 46000,
        },
      ],
    };
    activeLineId.value = 'line-current';
    musicStructureSignals.value = {
      trackId: 'track-1',
      sourceRevision: 'a'.repeat(64),
      sourceDurationMs: 180000,
      signals: {
        level: 'M1',
        reason: 'current',
        tempo: { bpm: 120, confidence: 0.8 },
        beats: [],
        sections: [],
      },
    };
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    const initialSourceEpoch =
      bridge.publishOutputSnapshot.mock.calls.at(-1)[0].sourceEpoch;
    bridge.publishOutputSnapshot.mockClear();

    await expect(runtime.refreshProjection()).resolves.toBe(true);

    const refreshMessages = bridge.publishOutputSnapshot.mock.calls.map(
      ([message]) => message,
    );
    expect(refreshMessages.map((message) => message.stream)).toEqual([
      'lyrics.document',
      'music-structure.document',
      'queue.document',
      'state.snapshot',
    ]);
    expect(refreshMessages.map((message) => message.kind)).toEqual([
      'update',
      'update',
      'update',
      'update',
    ]);
    expect(
      new Set(refreshMessages.map((message) => message.sourceEpoch)),
    ).toEqual(new Set([initialSourceEpoch]));
    expect(bridge.publishOutputSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: 'state.snapshot',
        payload: expect.objectContaining({
          playback: expect.objectContaining({ positionMs: 44000 }),
          lyrics: expect.objectContaining({
            documentId: 'lyrics-current',
            documentRevision: 2,
            activeLineId: 'line-current',
          }),
          musicStructure: expect.objectContaining({ documentRevision: 2 }),
          queue: expect.objectContaining({ documentRevision: 2 }),
        }),
      }),
    );
  });

  it('does not refresh a projection before Output is running or while its gate is off', async () => {
    const runtime = await loadRuntime();

    await expect(runtime.refreshProjection()).resolves.toBe(false);
    expect(bridge.publishOutputSnapshot).not.toHaveBeenCalled();

    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    bridge.publishOutputSnapshot.mockClear();
    outputEnabled = false;

    await expect(runtime.refreshProjection()).resolves.toBe(false);
    expect(bridge.publishOutputSnapshot).not.toHaveBeenCalled();
  });

  it('retains a forced content refresh until a later projection is accepted', async () => {
    playerState.track = { id: 'track-1', title: 'Song', url: 'media://song' };
    playerState.isPlaying = true;
    playerState.playbackPhase = 'playing';
    selectedLyricsTrack.value = { id: 'track-1', title: 'Song' };
    lyricsDocument.value = {
      documentId: 'lyrics-current',
      granularity: 'T1',
      lines: [
        {
          lineId: 'line-current',
          text: 'Current line',
          startMs: 0,
          endMs: null,
        },
      ],
    };
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    bridge.publishOutputSnapshot.mockClear();
    bridge.publishOutputSnapshot.mockResolvedValueOnce(false);

    await expect(runtime.refreshProjection()).resolves.toBe(false);
    expect(
      bridge.publishOutputSnapshot.mock.calls.map(
        ([message]) => message.stream,
      ),
    ).toEqual(['lyrics.document']);
    bridge.publishOutputSnapshot.mockClear();

    playerState.currentTime = 1;
    await flushMicrotasks();

    expect(
      bridge.publishOutputSnapshot.mock.calls.map(
        ([message]) => message.stream,
      ),
    ).toEqual(['lyrics.document', 'queue.document', 'state.snapshot']);
  });

  it('renews the source epoch and retries a rejected paused state immediately', async () => {
    playerState.track = { id: 'track-1', title: 'Song', url: 'media://song' };
    playerState.isPlaying = true;
    playerState.playbackPhase = 'playing';
    playerState.currentTime = 12;
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    const initialEpoch =
      bridge.publishOutputSnapshot.mock.calls.at(-1)[0].sourceEpoch;
    bridge.publishOutputSnapshot.mockClear();
    bridge.publishOutputSnapshot
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    playerState.isPlaying = false;
    playerState.playbackPhase = 'paused';
    playerState.currentTime = 12.25;
    await flushMicrotasks();

    const stateMessages = bridge.publishOutputSnapshot.mock.calls.map(
      ([message]) => message,
    );
    expect(stateMessages).toHaveLength(2);
    expect(stateMessages[0]).toMatchObject({
      stream: 'state.snapshot',
      kind: 'update',
      sourceEpoch: initialEpoch,
      payload: { playback: { status: 'paused', positionMs: 12250 } },
    });
    expect(stateMessages[1]).toMatchObject({
      stream: 'state.snapshot',
      kind: 'full',
      revision: 1,
      payload: { playback: { status: 'paused', positionMs: 12250 } },
    });
    expect(stateMessages[1].sourceEpoch).not.toBe(initialEpoch);
  });

  it('accepts a forced refresh when rejected state recovery succeeds', async () => {
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    bridge.publishOutputSnapshot.mockClear();
    bridge.publishOutputSnapshot
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(runtime.refreshProjection()).resolves.toBe(true);

    expect(
      bridge.publishOutputSnapshot.mock.calls.map(([message]) => [
        message.stream,
        message.kind,
      ]),
    ).toEqual([
      ['queue.document', 'update'],
      ['state.snapshot', 'update'],
      ['state.snapshot', 'full'],
    ]);
  });

  it('preserves a newer forced refresh while an earlier document batch is in flight', async () => {
    playerState.track = { id: 'track-1', title: 'Song', url: 'media://song' };
    playerState.isPlaying = true;
    playerState.playbackPhase = 'playing';
    selectedLyricsTrack.value = { id: 'track-1', title: 'Song' };
    lyricsDocument.value = {
      documentId: 'lyrics-current',
      granularity: 'T1',
      lines: [
        {
          lineId: 'line-current',
          text: 'Current line',
          startMs: 0,
          endMs: null,
        },
      ],
    };
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    bridge.publishOutputSnapshot.mockClear();
    const firstDocument = deferred();
    let delayedFirstDocument = false;
    bridge.publishOutputSnapshot.mockImplementation((message) => {
      if (!delayedFirstDocument && message.stream === 'lyrics.document') {
        delayedFirstDocument = true;
        return firstDocument.promise;
      }
      return Promise.resolve(true);
    });

    const firstRefresh = runtime.refreshProjection();
    await flushMicrotasks();
    expect(
      bridge.publishOutputSnapshot.mock.calls.map(
        ([message]) => message.stream,
      ),
    ).toEqual(['lyrics.document']);

    const secondRefresh = runtime.refreshProjection();
    firstDocument.resolve(true);
    await Promise.all([firstRefresh, secondRefresh]);

    expect(
      bridge.publishOutputSnapshot.mock.calls.map(
        ([message]) => message.stream,
      ),
    ).toEqual([
      'lyrics.document',
      'queue.document',
      'state.snapshot',
      'lyrics.document',
      'queue.document',
      'state.snapshot',
    ]);
  });

  it('waits for source hydration before honoring an early Preview refresh', async () => {
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    await flushMicrotasks();
    expect(runtime.state.status.running).toBe(true);

    const refresh = runtime.refreshProjection();
    await flushMicrotasks();
    expect(bridge.publishOutputSnapshot).not.toHaveBeenCalled();

    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    await expect(refresh).resolves.toBe(true);
    expect(bridge.publishOutputSnapshot.mock.calls.at(-1)[0]).toMatchObject({
      stream: 'state.snapshot',
      kind: 'update',
    });
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

  it('surfaces an automatic startup failure returned by the initial handshake', async () => {
    bridge.connectOutputSource.mockResolvedValueOnce({
      running: false,
      bootId: 'boot-main',
      error: { code: 'EADDRINUSE', message: 'listen EADDRINUSE' },
      desired: { running: true, port: 8700 },
      observed: {
        serviceLifecycle: 'error',
        sourceSynchronization: 'syncing',
      },
    });
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();

    await expect(initialization).resolves.toBe(true);
    expect(runtime.state.error).toBe(
      '輸出服務未啟動，請檢查連接埠後再試一次。',
    );
    expect(runtime.state.suggestedPorts).toEqual([8701, 8702]);
    expect(recordError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        source: 'output',
        operation: 'automatic-start',
      }),
    );
  });

  it('surfaces feature confirmation hydration failures before connecting', async () => {
    refreshConfirmations.mockImplementationOnce(async () => {
      featureGateState.error = '目前無法讀取功能狀態，請再試一次。';
      return {};
    });
    const runtime = await loadRuntime();

    await expect(runtime.initialize()).resolves.toBe(false);

    expect(runtime.state.error).toBe('目前無法讀取功能狀態，請再試一次。');
    expect(bridge.connectOutputSource).not.toHaveBeenCalled();
    expect(initializeLibrary).not.toHaveBeenCalled();
  });

  it('fails closed without an unhandled rejection when source connection fails', async () => {
    bridge.connectOutputSource.mockRejectedValueOnce(
      new Error('source connection failed'),
    );
    const runtime = await loadRuntime();

    await expect(runtime.initialize()).resolves.toBe(false);

    expect(runtime.state.error).toBe('輸出初始化未完成，請再試一次。');
    expect(bridge.publishOutputSnapshot).not.toHaveBeenCalled();
    expect(initializeLibrary).not.toHaveBeenCalled();
  });

  it('keeps projection publishing disabled when the Output feature gate is off', async () => {
    outputEnabled = false;
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();

    await initialization;
    playerState.currentTime = 1;
    await flushMicrotasks();

    expect(bridge.publishOutputSnapshot).not.toHaveBeenCalled();
  });

  it('refreshes runtime status when main rejects an Output envelope', async () => {
    bridge.publishOutputSnapshot.mockResolvedValueOnce(false);
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();

    await expect(initialization).resolves.toBe(true);

    expect(bridge.publishOutputSnapshot).toHaveBeenCalledOnce();
    expect(bridge.getOutputStatus).toHaveBeenCalledOnce();
  });

  it('records a bounded diagnostic when projection publishing throws', async () => {
    bridge.publishOutputSnapshot.mockRejectedValueOnce(
      new Error('private projection failure'),
    );
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();

    await expect(initialization).resolves.toBe(true);

    expect(runtime.state.error).toBe('輸出畫面未更新，請再試一次。');
    expect(recordError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: 'publish', source: 'output' }),
    );
  });

  it('coalesces clock changes to the latest projection while publishing', async () => {
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;

    bridge.publishOutputSnapshot.mockClear();
    const inFlight = deferred();
    bridge.publishOutputSnapshot
      .mockImplementationOnce(() => inFlight.promise)
      .mockResolvedValue(true);

    playerState.currentTime = 1;
    await flushMicrotasks();
    playerState.currentTime = 2;
    await flushMicrotasks();
    playerState.currentTime = 3;
    await flushMicrotasks();

    expect(bridge.publishOutputSnapshot).toHaveBeenCalledOnce();
    inFlight.resolve(true);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(bridge.publishOutputSnapshot).toHaveBeenCalledTimes(2);
    expect(bridge.publishOutputSnapshot.mock.calls.at(-1)[0]).toMatchObject({
      stream: 'state.snapshot',
      payload: { playback: { positionMs: 3000 } },
    });
  });

  it('uses update envelopes until playback continuity changes', async () => {
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    const firstEnvelope = bridge.publishOutputSnapshot.mock.calls.at(-1)[0];

    playerState.currentTime = 2;
    await flushMicrotasks();
    expect(bridge.publishOutputSnapshot.mock.calls.at(-1)[0]).toMatchObject({
      sourceEpoch: firstEnvelope.sourceEpoch,
      stream: 'state.snapshot',
      kind: 'update',
      revision: 2,
      payload: { playback: { positionMs: 2000 } },
    });

    playerState.continuityRevision += 1;
    await flushMicrotasks();
    const nextEnvelope = bridge.publishOutputSnapshot.mock.calls.at(-1)[0];
    expect(nextEnvelope).toMatchObject({
      stream: 'state.snapshot',
      kind: 'full',
      revision: 1,
    });
    expect(nextEnvelope.sourceEpoch).not.toBe(firstEnvelope.sourceEpoch);
  });

  it('publishes changed lyrics content once before state and not on clock ticks', async () => {
    playerState.track = { id: 'track-1', title: 'Song', url: 'media://song' };
    selectedLyricsTrack.value = { id: 'track-1', title: 'Song' };
    selectedLyricsSource.value = { language: 'ja', filename: 'main.ja.lrc' };
    lyricsDocument.value = {
      documentId: 'lyrics-1',
      granularity: 'T1',
      lines: [
        {
          lineId: 'line-1',
          text: 'First',
          startMs: 0,
          endMs: 1000,
        },
      ],
    };
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;

    expect(
      bridge.publishOutputSnapshot.mock.calls.map(
        ([message]) => message.stream,
      ),
    ).toEqual(['lyrics.document', 'queue.document', 'state.snapshot']);

    playerState.currentTime = 0.5;
    await flushMicrotasks();
    expect(bridge.publishOutputSnapshot.mock.calls.at(-1)[0].stream).toBe(
      'state.snapshot',
    );
    const contentCountAfterClock =
      bridge.publishOutputSnapshot.mock.calls.filter(
        ([message]) => message.stream === 'lyrics.document',
      ).length;

    lyricsDocument.value = {
      ...lyricsDocument.value,
      lines: [
        ...lyricsDocument.value.lines,
        {
          lineId: 'line-2',
          text: 'Second',
          startMs: 1000,
          endMs: 2000,
        },
      ],
    };
    await flushMicrotasks();
    const lastTwo = bridge.publishOutputSnapshot.mock.calls
      .slice(-2)
      .map(([message]) => message.stream);
    expect(lastTwo).toEqual(['lyrics.document', 'state.snapshot']);
    expect(
      bridge.publishOutputSnapshot.mock.calls.filter(
        ([message]) => message.stream === 'lyrics.document',
      ),
    ).toHaveLength(contentCountAfterClock + 1);

    const previousEpoch =
      bridge.publishOutputSnapshot.mock.calls.at(-1)[0].sourceEpoch;
    playerState.continuityRevision += 1;
    lyricsDocument.value = {
      ...lyricsDocument.value,
      lines: lyricsDocument.value.lines.map((line) => ({
        ...line,
        text: `${line.text}!`,
      })),
    };
    await flushMicrotasks();
    const continuityMessages = bridge.publishOutputSnapshot.mock.calls
      .slice(-2)
      .map(([message]) => message);
    expect(continuityMessages.map((message) => message.stream)).toEqual([
      'lyrics.document',
      'state.snapshot',
    ]);
    expect(continuityMessages[0].kind).toBe('full');
    expect(continuityMessages[1].kind).toBe('full');
    expect(continuityMessages[1].sourceEpoch).not.toBe(previousEpoch);
  });

  it('starts a lyrics stream with a full document when lyrics arrive later', async () => {
    playerState.track = { id: 'track-1', title: 'Song', url: 'media://song' };
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;

    selectedLyricsTrack.value = { id: 'track-1', title: 'Song' };
    selectedLyricsSource.value = { language: 'ja' };
    lyricsDocument.value = {
      documentId: 'lyrics-late',
      granularity: 'T0',
      lines: [
        {
          lineId: 'line-1',
          text: 'Late',
          startMs: null,
          endMs: null,
        },
      ],
    };
    await flushMicrotasks();

    const messages = bridge.publishOutputSnapshot.mock.calls
      .slice(-2)
      .map(([message]) => message);
    expect(messages.map((message) => message.stream)).toEqual([
      'lyrics.document',
      'state.snapshot',
    ]);
    expect(messages[0].kind).toBe('full');
    expect(messages[1].kind).toBe('update');
  });

  it('publishes current music cues once and references them on clock ticks', async () => {
    playerState.track = { id: 'track-1', title: 'Song', url: 'media://song' };
    musicStructureSignals.value = {
      trackId: 'track-1',
      sourceRevision: 'a'.repeat(64),
      sourceDurationMs: 180000,
      signals: {
        level: 'M2',
        reason: 'current',
        tempo: { bpm: 120, confidence: 0.8 },
        beats: [{ timeMs: 500, downbeat: true, confidence: 0.9 }],
        sections: [
          {
            sectionId: 'section_1',
            startMs: 0,
            endMs: 10000,
            role: 'chorus',
            confidence: 0.8,
          },
        ],
      },
    };
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;

    const initialMessages = bridge.publishOutputSnapshot.mock.calls.map(
      ([message]) => message,
    );
    expect(initialMessages.map((message) => message.stream)).toEqual([
      'music-structure.document',
      'queue.document',
      'state.snapshot',
    ]);
    expect(initialMessages.at(-1).payload.musicStructure).toEqual({
      documentId: `music-structure-${'a'.repeat(64)}`,
      documentRevision: 1,
    });

    playerState.currentTime = 1;
    await flushMicrotasks();
    expect(bridge.publishOutputSnapshot.mock.calls.at(-1)[0]).toMatchObject({
      stream: 'state.snapshot',
      payload: {
        musicStructure: {
          documentId: `music-structure-${'a'.repeat(64)}`,
          documentRevision: 1,
        },
      },
    });
    expect(
      bridge.publishOutputSnapshot.mock.calls.filter(
        ([message]) => message.stream === 'music-structure.document',
      ),
    ).toHaveLength(1);
  });

  it('loads current music cues after library hydration and reloads on track or library changes', async () => {
    playerState.track = { id: 'track-1', title: 'Song', url: 'media://song' };
    libraryTracksById.value = new Map([
      ['track-1', { id: 'track-1', contentHash: 'a'.repeat(64) }],
    ]);
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();

    await flushMicrotasks();
    expect(loadMusicStructureForTrack).not.toHaveBeenCalled();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();
    await initialization;
    expect(loadMusicStructureForTrack).toHaveBeenCalledWith('track-1');

    playerState.track = {
      id: 'track-2',
      title: 'Next',
      url: 'media://next',
    };
    libraryTracksById.value = new Map([
      ['track-2', { id: 'track-2', contentHash: 'b'.repeat(64) }],
    ]);
    await flushMicrotasks();
    expect(loadMusicStructureForTrack).toHaveBeenLastCalledWith('track-2');

    libraryTracksById.value = new Map([
      ['track-2', { id: 'track-2', contentHash: 'c'.repeat(64) }],
    ]);
    await flushMicrotasks();
    expect(loadMusicStructureForTrack).toHaveBeenCalledTimes(3);
    expect(loadMusicStructureForTrack).toHaveBeenLastCalledWith('track-2');
  });

  it('contains a failed optional music-structure refresh', async () => {
    loadMusicStructureForTrack.mockRejectedValueOnce(
      new Error('private sidecar failure'),
    );
    const runtime = await loadRuntime();
    const initialization = runtime.initialize();
    libraryHydration.resolve();
    playlistHydration.resolve();
    lyricsHydration.resolve();

    await expect(initialization).resolves.toBe(true);
    expect(runtime.state.error).toBe('');
  });
});

describe('output runtime actions', () => {
  it('preserves settings failures across healthy runtime and settings reads', async () => {
    const runtime = await loadRuntime();
    bridge.updateOutputSettings.mockRejectedValueOnce(new Error('private'));
    await runtime.updateSettings({
      autoStart: false,
      port: 8701,
      displayDelayMs: 0,
    });
    await runtime.refreshStatus();
    await runtime.refreshSettings();
    expect(runtime.state.errors['save-settings']).toContain('未儲存');
    expect(runtime.state.errors.status).toBeUndefined();
    await runtime.updateSettings({
      autoStart: false,
      port: 8701,
      displayDelayMs: 0,
    });
    expect(runtime.state.errors['save-settings']).toBeUndefined();
  });
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

  it('publishes an initial handshake when start runs before initialization', async () => {
    const runtime = await loadRuntime();

    await expect(runtime.start()).resolves.toBe(true);

    expect(
      bridge.publishOutputSnapshot.mock.calls.map(
        ([message]) => message.stream,
      ),
    ).toEqual(['queue.document', 'state.snapshot']);
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
      runtime.saveTemplateSelection('lyrics', 'manga-frame'),
    ).resolves.toBe(true);
    await expect(
      runtime.saveSlotSettings('lyrics', { alignment: 'center' }),
    ).resolves.toBe(true);
    expect(bridge.upsertOutputSlot).toHaveBeenLastCalledWith(
      'lyrics',
      expect.objectContaining({
        templateId: 'manga-frame',
        settings: { alignment: 'center' },
      }),
    );
  });

  it('loads and persists one shared bounded recent-color history', async () => {
    const runtime = await loadRuntime();

    await runtime.loadSlots();
    expect(runtime.state.preferences.recentColors).toEqual(['#112233']);

    await expect(runtime.saveRecentColor('#AABBCC')).resolves.toBe(true);
    expect(bridge.updateOutputRecentColors).toHaveBeenCalledWith([
      '#aabbcc',
      '#112233',
    ]);
    expect(runtime.state.preferences.recentColors).toEqual([
      '#aabbcc',
      '#112233',
    ]);

    await expect(runtime.saveRecentColor('not-a-color')).resolves.toBe(false);
    expect(bridge.updateOutputRecentColors).toHaveBeenCalledTimes(1);
  });

  it('loads and toggles one Output-wide saved palette without reordering it as recent history', async () => {
    const runtime = await loadRuntime();

    await runtime.loadSlots();
    expect(runtime.state.preferences.savedColors).toEqual(['#445566']);

    await expect(runtime.toggleSavedColor('#AABBCC')).resolves.toBe(true);
    expect(bridge.updateOutputSavedColors).toHaveBeenCalledWith([
      '#445566',
      '#aabbcc',
    ]);
    expect(runtime.state.preferences.savedColors).toEqual([
      '#445566',
      '#aabbcc',
    ]);
    expect(bridge.updateOutputRecentColors).not.toHaveBeenCalled();
  });

  it('rolls back an unpersisted recent color so the same commit can retry', async () => {
    const runtime = await loadRuntime();
    await runtime.loadSlots();
    bridge.updateOutputRecentColors.mockRejectedValueOnce(
      new Error('color history write failed'),
    );

    await expect(runtime.saveRecentColor('#AABBCC')).resolves.toBe(false);
    expect(runtime.state.preferences.recentColors).toEqual(['#112233']);
    expect(runtime.state.preferenceError).toBeTruthy();

    await expect(runtime.saveRecentColor('#AABBCC')).resolves.toBe(true);
    expect(bridge.updateOutputRecentColors).toHaveBeenCalledTimes(2);
    expect(runtime.state.preferences.recentColors).toEqual([
      '#aabbcc',
      '#112233',
    ]);
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
    expect(runtime.state.error).toBe('輸出設定未儲存，請再試一次。');

    bridge.startOutput.mockRejectedValueOnce(new Error('start failed'));
    await expect(runtime.start()).resolves.toBe(false);
    bridge.stopOutput.mockRejectedValueOnce(new Error('stop failed'));
    await expect(runtime.stop()).resolves.toBe(false);
    bridge.listOutputSlots.mockRejectedValueOnce(new Error('slots failed'));
    await expect(runtime.loadSlots()).resolves.toBeUndefined();
    expect(runtime.state.error).toBe('目前無法讀取輸出設定，請再試一次。');

    bridge.upsertOutputSlot.mockRejectedValueOnce(
      new Error('save slot failed'),
    );
    await expect(
      runtime.saveOutputSlot(
        'lyrics',
        { templateId: 'manga-frame' },
        { templateId: 'focus-line', styleSetIds: [], settings: {} },
      ),
    ).resolves.toBe(false);
    expect(runtime.state.error).toBe('輸出樣式未儲存，請再試一次。');
  });
});
