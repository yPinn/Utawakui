import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reactive, shallowRef } from 'vue';
import templates from '../../shared/outputTemplateValues.json';
const fixture = vi.hoisted(() => ({
  player: null,
  lyrics: null,
  tracksById: null,
  queue: null,
}));
vi.mock('./usePlayer.js', () => ({ usePlayer: () => fixture.player }));
vi.mock('./usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => fixture.queue,
}));
vi.mock('./useLyrics.js', () => ({ useLyrics: () => fixture.lyrics }));
vi.mock('./usePerformanceSessionPlayback.js', () => ({
  usePerformanceSessionPlayback: () => ({
    currentItem: shallowRef(null),
    pendingItems: shallowRef([]),
    historyItems: shallowRef([]),
  }),
}));
vi.mock('./useLibrary.js', () => ({
  useLibrary: () => ({ tracksById: fixture.tracksById }),
}));
vi.mock('./useLyricsReading.js', () => ({
  useLyricsReading: () => ({
    getDoc: vi.fn(),
    loadReading: vi.fn(),
    variant: shallowRef('off'),
  }),
}));
beforeEach(() => {
  vi.resetModules();
  fixture.tracksById = shallowRef(new Map());
  fixture.queue = {
    state: {},
    upcomingTracks: shallowRef([]),
    queuedTracks: shallowRef([]),
    sourceUpcomingTracks: shallowRef([]),
  };
  fixture.player = {
    state: reactive({
      track: { id: 'a' },
      currentTime: 1.1,
      duration: 10,
      playbackPhase: 'playing',
      isPlaying: true,
      tempoRate: 1,
    }),
    samplePlaybackClock: vi.fn(() => ({
      trackId: 'a',
      positionMs: 2250,
      rate: 1,
      phase: 'playing',
      sampledAt: '2026-10-28T12:00:00.250Z',
    })),
  };
  fixture.lyrics = {
    state: { offsetSeconds: 0, offsetSave: {} },
    selectedTrack: shallowRef({ id: 'a' }),
    selectedSource: shallowRef({ filename: 'a.lrc' }),
    lyricLines: shallowRef([{ lineId: 'l', text: 'AB', start: 1, end: 3 }]),
    activeLineIndex: shallowRef(0),
    localLyricsFrame: shallowRef({
      lineId: 'l',
      text: 'AB',
      timingSource: 't2',
      chunks: [
        { text: 'A', startMs: 1000, endMs: 2000, state: 'past' },
        { text: 'B', startMs: 2000, endMs: 3000, state: 'active' },
      ],
    }),
  };
  vi.stubGlobal('window', {
    Utawakui: {
      openPerformerView: vi.fn(async () => ({ open: true })),
      publishPerformerSnapshot: vi.fn(async () => true),
    },
  });
});
it('resolves published queue picks in their original group even when an ID occurs in both', async () => {
  const manual = { id: 'b', title: 'Manual entry' };
  const source = { id: 'b', title: 'Source entry' };
  fixture.queue.queuedTracks.value = [manual];
  fixture.queue.sourceUpcomingTracks.value = [source];
  fixture.queue.upcomingTracks.value = [manual, source];
  const { usePerformerSelfView } = await import('./usePerformerSelfView.js');
  const owner = usePerformerSelfView();
  await owner.open();
  const { manualQueueCount, state } =
    window.Utawakui.openPerformerView.mock.calls[0][0];
  expect(manualQueueCount).toBe(1);
  expect(owner.resolvePublishedQueueSelection(state.revision, 'a', 0)).toEqual({
    track: manual,
    source: false,
  });
  expect(owner.resolvePublishedQueueSelection(state.revision, 'a', 1)).toEqual({
    track: source,
    source: true,
  });
  fixture.queue.queuedTracks.value = [];
  expect(
    owner.resolvePublishedQueueSelection(state.revision, 'a', 0),
  ).toBeNull();
  expect(owner.resolvePublishedQueueSelection(state.revision, 'a', 1)).toEqual({
    track: source,
    source: true,
  });
  expect(
    owner.resolvePublishedQueueSelection(state.revision + 1000, 'a', 1),
  ).toBeNull();
});
it('publishes the latest library title for a cover already loaded in the player', async () => {
  const rawTitle = '螺旋 - Acoustic Ver. - / Covered by 厄倫蒂兒 Earendel';
  fixture.player.state.track = {
    id: 'a',
    title: rawTitle,
    artist: 'Earendel ch. 厄倫蒂兒',
  };
  fixture.tracksById.value = new Map([
    [
      'a',
      {
        ...fixture.player.state.track,
        workPresentation: { title: 'RASEN Acoustic Ver' },
      },
    ],
  ]);

  const { usePerformerSelfView } = await import('./usePerformerSelfView.js');
  await usePerformerSelfView().open();
  const snapshot = window.Utawakui.openPerformerView.mock.calls[0][0];
  expect(snapshot.state.playback.track).toEqual({
    id: 'a',
    title: 'RASEN Acoustic Ver',
    artist: 'Earendel ch. 厄倫蒂兒',
  });
  expect(fixture.player.state.track.title).toBe(rawTitle);
});
afterEach(() => vi.unstubAllGlobals());
it('pairs the word-boundary publication with an actual audio sample instead of stale timeupdate state', async () => {
  const { usePerformerSelfView } = await import('./usePerformerSelfView.js');
  await usePerformerSelfView().open();
  const value = window.Utawakui.openPerformerView.mock.calls[0][0];
  expect(value.state.playback.positionMs).toBe(2250);
  expect(value.state.generatedAt).toBe('2026-10-28T12:00:00.250Z');
  expect(value.wordCue).toEqual({
    lineIndex: 0,
    from: 1,
    to: 2,
    startMs: 2000,
    endMs: 3000,
  });
  expect(fixture.player.state.currentTime).toBe(1.1);
});

it('keeps publishing for paired phones while the desktop prompter is closed', async () => {
  let pushStatus;
  window.Utawakui.getPerformerViewStatus = vi.fn(async () => ({
    open: false,
    remoteReaders: 0,
  }));
  window.Utawakui.onPerformerViewStatus = vi.fn((listener) => {
    pushStatus = listener;
    return vi.fn();
  });
  const { usePerformerSelfView } = await import('./usePerformerSelfView.js');
  const { useAppNotifications } = await import('./useAppNotifications.js');
  const notices = useAppNotifications();
  const connectionNotice = () =>
    notices.items.value.find(({ key }) => key === 'companion-connection');
  const selfView = usePerformerSelfView();
  await selfView.initialize();
  const publish = window.Utawakui.publishPerformerSnapshot;
  expect(publish).not.toHaveBeenCalled();

  pushStatus({ open: false, remoteReaders: 1 });
  await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
  expect(selfView.state.remoteReaders).toBe(1);
  expect(connectionNotice()).toMatchObject({
    title: '手機遙控已連線',
    tone: 'success',
  });

  fixture.player.state.currentTime = 5;
  fixture.lyrics.activeLineIndex.value = 1;
  await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(2));

  pushStatus({ open: false, remoteReaders: 0 });
  expect(connectionNotice()).toMatchObject({
    title: '手機遙控已中斷',
    tone: 'info',
  });
  fixture.lyrics.activeLineIndex.value = 0;
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(publish).toHaveBeenCalledTimes(2);
  selfView.dispose?.();
  notices.clear('companion-connection');
});

it('publishes the enabled Output slots and binds option changes to that revision', async () => {
  window.Utawakui.getPerformerViewStatus = vi.fn(async () => ({
    open: false,
    remoteReaders: 1,
  }));
  const { usePerformerSelfView } = await import('./usePerformerSelfView.js');
  const selfView = usePerformerSelfView();
  const state = reactive({ slotsLoaded: false, slots: {} });
  const enabled = shallowRef(true);
  const runtime = {
    state,
    loadSlots: vi.fn(async () => {
      state.slots = Object.fromEntries(
        templates.slots.map(({ id, defaultTemplateId }) => [
          id,
          { templateId: defaultTemplateId, settings: {} },
        ]),
      );
      state.slotsLoaded = true;
    }),
    applyCompanionOutputOption: vi.fn(async () => 'applied'),
  };
  await selfView.initialize({
    output: { runtime, isEnabled: () => enabled.value },
  });
  const publish = window.Utawakui.publishPerformerSnapshot;
  await vi.waitFor(() =>
    expect(publish.mock.lastCall[0].outputSlots).toHaveLength(3),
  );
  const { state: published, outputSlots } = publish.mock.lastCall[0];
  const outputChange = {
    templateId: 'receipt-setlist',
    fieldKey: 'receiptDirection',
    value: 'up',
  };
  const intent = { revision: published.revision, trackId: 'a', outputChange };
  expect(await selfView.applyOutputOption(intent)).toBe('applied');
  expect(runtime.applyCompanionOutputOption).toHaveBeenCalledWith(
    outputSlots[1],
    outputChange,
  );
  expect(selfView.applyOutputOption({ ...intent, revision: 99999 })).toBe(
    'stale',
  );
  enabled.value = false;
  expect(selfView.applyOutputOption(intent)).toBe('unavailable');
  await vi.waitFor(() =>
    expect(publish.mock.lastCall[0]).not.toHaveProperty('outputSlots'),
  );
});
