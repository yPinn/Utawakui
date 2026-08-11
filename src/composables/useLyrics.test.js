import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let playerState;
let listTracksMock;
let getTrackLyricsMock;
let probeMusixmatchLyricsMock;
let getPlaylistsMock;
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

const lyricsText = `WEBVTT

00:00:01.000 --> 00:00:10.000
Opening

00:00:40.000 --> 00:00:50.000
Middle`;

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

// The Lyrics list is scoped to whichever playlist is selected (see
// useLyrics.js's applyScopedTracks) — tests must pick a playlist through
// the real usePlaylists.js singleton *before* useLyrics.js's own
// module-level refresh() runs, or the initial scope would resolve empty.
async function loadLyrics({ playlists, selectedId = 'p1' } = {}) {
  if (playlists) {
    getPlaylistsMock.mockResolvedValue(playlists);
    const { usePlaylists } = await import('./usePlaylists.js');
    await flushPromises();
    if (selectedId !== null) usePlaylists().select(selectedId);
  }
  const module = await import('./useLyrics.js');
  await flushPromises();
  return module.useLyrics();
}

const DEFAULT_PLAYLIST = {
  id: 'p1',
  name: 'Setlist A',
  trackIds: [trackA.id, trackB.id],
};

beforeEach(() => {
  vi.resetModules();
  libraryBackfillStatusHandler = null;
  playerState = reactive({
    track: trackA,
    currentTime: 42,
    isPlaying: true,
    duration: 120,
  });
  listTracksMock = vi
    .fn()
    .mockResolvedValue([trackA, trackB, trackMissingLyrics]);
  getTrackLyricsMock = vi.fn().mockResolvedValue({
    source: { filename: 'en.vtt', language: 'en', kind: 'youtube-cc' },
    text: lyricsText,
  });
  probeMusixmatchLyricsMock = vi.fn().mockResolvedValue({
    provider: 'musixmatch',
    status: 'available',
    lineCount: 2,
    firstLineStart: 1,
  });
  getPlaylistsMock = vi.fn().mockResolvedValue([DEFAULT_PLAYLIST]);
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
      probeMusixmatchLyrics: probeMusixmatchLyricsMock,
      getPlaylists: getPlaylistsMock,
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
  it('scopes the track list to the selected playlist, preserving its order', async () => {
    const lyrics = await loadLyrics({
      playlists: [
        {
          id: 'p1',
          name: 'Setlist A',
          trackIds: [trackMissingLyrics.id, trackA.id, 'ghost-id', trackB.id],
        },
      ],
    });

    // Playlist order wins, not lyrics-readiness — and the ghost id (a
    // track deleted outside the app) silently drops out.
    expect(lyrics.state.tracks.map((track) => track.id)).toEqual([
      trackMissingLyrics.id,
      trackA.id,
      trackB.id,
    ]);
  });

  it('shows no tracks when no playlist is selected', async () => {
    const lyrics = await loadLyrics({
      playlists: [DEFAULT_PLAYLIST],
      selectedId: null,
    });

    expect(lyrics.state.tracks).toEqual([]);
    expect(lyrics.state.selectedTrackId).toBe(null);
  });

  it('re-derives tracks when the selected playlist changes, without re-fetching the library', async () => {
    const lyrics = await loadLyrics({
      playlists: [
        { id: 'p1', name: 'Setlist A', trackIds: [trackA.id] },
        { id: 'p2', name: 'Setlist B', trackIds: [trackB.id] },
      ],
    });

    expect(lyrics.state.tracks.map((track) => track.id)).toEqual([trackA.id]);
    expect(listTracksMock).toHaveBeenCalledTimes(1);

    const { usePlaylists } = await import('./usePlaylists.js');
    usePlaylists().select('p2');
    await flushPromises();

    expect(lyrics.state.tracks.map((track) => track.id)).toEqual([trackB.id]);
    expect(listTracksMock).toHaveBeenCalledTimes(1);
  });

  it('does not advance lyrics for a manually selected non-playing track', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    expect(lyrics.state.selectedTrackId).toBe(trackA.id);
    expect(lyrics.activeLineIndex.value).toBe(1);

    lyrics.selectTrack(trackB.id);
    await flushPromises();

    expect(lyrics.state.selectedTrackId).toBe(trackB.id);
    expect(lyrics.activeLineIndex.value).toBe(-1);
    expect(lyrics.activeLine.value).toBe(null);
  });

  it('starts following the selected lyrics after clicking a line to play that track', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
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
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

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

  it('probes Musixmatch for the selected track and stores only the summary', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    await expect(lyrics.probeMusixmatch()).resolves.toMatchObject({
      provider: 'musixmatch',
      status: 'available',
      lineCount: 2,
    });

    expect(probeMusixmatchLyricsMock).toHaveBeenCalledWith(trackA.id);
    expect(lyrics.state.musixmatchProbe).toMatchObject({
      isLoading: false,
      trackId: trackA.id,
      result: {
        provider: 'musixmatch',
        status: 'available',
        lineCount: 2,
      },
      error: null,
    });
  });

  it('clears stale Musixmatch probe results when selecting another track', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    await lyrics.probeMusixmatch();
    lyrics.selectTrack(trackB.id);
    await flushPromises();

    expect(lyrics.state.musixmatchProbe).toMatchObject({
      isLoading: false,
      trackId: null,
      result: null,
      error: null,
    });
  });

  it('shows a restart hint when the Musixmatch preload bridge is unavailable', async () => {
    delete window.Utawakui.probeMusixmatchLyrics;
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    await expect(lyrics.probeMusixmatch()).resolves.toBe(null);

    expect(lyrics.state.musixmatchProbe).toMatchObject({
      isLoading: false,
      trackId: trackA.id,
      result: null,
      error: 'Musixmatch 探測 API 尚未載入，請重啟 Electron app',
    });
  });
});
