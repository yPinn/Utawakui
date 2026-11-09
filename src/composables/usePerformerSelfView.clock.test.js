import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reactive, shallowRef } from 'vue';
const fixture = vi.hoisted(() => ({
  player: null,
  lyrics: null,
  tracksById: null,
}));
vi.mock('./usePlayer.js', () => ({ usePlayer: () => fixture.player }));
vi.mock('./usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => ({ state: {}, upcomingTracks: shallowRef([]) }),
}));
vi.mock('./useLyrics.js', () => ({ useLyrics: () => fixture.lyrics }));
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
