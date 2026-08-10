import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let playerState;
let listTracksMock;
let getTrackLyricsMock;
let libraryBackfillStatusHandler;
let playTrackMock;
let playMock;
let seekMock;

const trackA = {
  id: 'track-a',
  title: 'Track A',
  artist: 'Artist A',
  duration: 120,
  url: 'utawakui-media://track/track-a/audio.mp3',
  lyrics: {
    status: 'available',
    sources: [{ filename: 'en.vtt', language: 'en', kind: 'youtube-cc' }],
  },
};

const trackB = {
  id: 'track-b',
  title: 'Track B',
  artist: 'Artist B',
  duration: 120,
  url: 'utawakui-media://track/track-b/audio.mp3',
  lyrics: {
    status: 'available',
    sources: [{ filename: 'en.vtt', language: 'en', kind: 'youtube-cc' }],
  },
};

const trackMissingLyrics = {
  id: 'track-missing',
  title: 'Track Missing',
  artist: 'Artist Missing',
  duration: 120,
  url: 'utawakui-media://track/track-missing/audio.mp3',
  lyrics: {
    status: 'missing',
    sources: [],
  },
};

const trackUncheckedLyrics = {
  id: 'track-unchecked',
  title: 'Track Unchecked',
  artist: 'Artist Unchecked',
  duration: 120,
  url: 'utawakui-media://track/track-unchecked/audio.mp3',
  lyrics: {
    status: 'unchecked',
    sources: [],
  },
};

const lyricsText = `WEBVTT

00:00:01.000 --> 00:00:10.000
Opening

00:00:40.000 --> 00:00:50.000
Middle`;

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

async function loadLyrics() {
  const module = await import('./useLyrics.js');
  await flushPromises();
  return module.useLyrics();
}

beforeEach(() => {
  vi.resetModules();
  libraryBackfillStatusHandler = null;
  playerState = reactive({
    track: trackA,
    currentTime: 42,
    isPlaying: true,
    duration: 120,
  });
  listTracksMock = vi.fn().mockResolvedValue([trackA, trackB]);
  getTrackLyricsMock = vi.fn().mockResolvedValue({
    source: { filename: 'en.vtt', language: 'en', kind: 'youtube-cc' },
    text: lyricsText,
  });
  playTrackMock = vi.fn(async (track) => {
    playerState.track = track;
  });
  playMock = vi.fn();
  seekMock = vi.fn((time) => {
    playerState.currentTime = time;
  });

  vi.doMock('./usePlayer.js', () => ({
    usePlayer: () => ({
      state: playerState,
      playTrack: playTrackMock,
      play: playMock,
      seek: seekMock,
    }),
  }));

  vi.stubGlobal('window', {
    Utawakui: {
      listTracks: listTracksMock,
      getTrackLyrics: getTrackLyricsMock,
      onLibraryUpdated: vi.fn((handler) => {
        void handler;
        return vi.fn();
      }),
      onLibraryBackfillStatus: vi.fn((handler) => {
        libraryBackfillStatusHandler = handler;
        return vi.fn();
      }),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useLyrics', () => {
  it('orders tracks with lyrics first while preserving default order within each group', async () => {
    listTracksMock.mockResolvedValue([
      trackMissingLyrics,
      trackA,
      trackUncheckedLyrics,
      trackB,
    ]);

    const lyrics = await loadLyrics();

    expect(lyrics.state.tracks.map((track) => track.id)).toEqual([
      trackA.id,
      trackB.id,
      trackMissingLyrics.id,
      trackUncheckedLyrics.id,
    ]);
    expect(lyrics.state.selectedTrackId).toBe(trackA.id);
  });

  it('does not advance lyrics for a manually selected non-playing track', async () => {
    const lyrics = await loadLyrics();

    expect(lyrics.state.selectedTrackId).toBe(trackA.id);
    expect(lyrics.activeLineIndex.value).toBe(1);

    lyrics.selectTrack(trackB.id);
    await flushPromises();

    expect(lyrics.state.selectedTrackId).toBe(trackB.id);
    expect(lyrics.activeLineIndex.value).toBe(-1);
    expect(lyrics.activeLine.value).toBe(null);
  });

  it('starts following the selected lyrics after clicking a line to play that track', async () => {
    const lyrics = await loadLyrics();
    const { usePlaybackQueue } = await import('./usePlaybackQueue.js');
    const queue = usePlaybackQueue();

    lyrics.selectTrack(trackB.id);
    await flushPromises();

    await lyrics.playFromLine(lyrics.lyricLines.value[1]);

    expect(playTrackMock).toHaveBeenCalledWith(trackB);
    expect(seekMock).toHaveBeenCalledWith(40);
    expect(queue.state.tracks.map((track) => track.id)).toEqual([trackB.id]);
    expect(queue.state.currentTrackId).toBe(trackB.id);
    expect(queue.currentTrack.value).toEqual(trackB);
    expect(lyrics.activeLineIndex.value).toBe(1);
  });

  it('exposes library backfill status for reload progress', async () => {
    const lyrics = await loadLyrics();

    libraryBackfillStatusHandler({
      stage: 'track',
      isRunning: true,
      total: 3,
      completed: 1,
      trackId: trackB.id,
      title: trackB.title,
    });

    expect(lyrics.isReloading.value).toBe(true);
    expect(lyrics.state.backfillStatus).toMatchObject({
      isRunning: true,
      total: 3,
      completed: 1,
      currentTrackId: trackB.id,
      currentTitle: trackB.title,
      error: null,
    });

    libraryBackfillStatusHandler({
      stage: 'done',
      isRunning: false,
      total: 3,
      completed: 3,
    });

    expect(lyrics.isReloading.value).toBe(false);
    expect(lyrics.state.backfillStatus).toMatchObject({
      isRunning: false,
      total: 3,
      completed: 3,
      currentTrackId: null,
    });
  });
});
