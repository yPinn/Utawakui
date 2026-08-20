import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let playerState;
let listTracksMock;
let getTrackLyricsMock;
let probeMusixmatchLyricsMock;
let importLyricsTextMock;
let importLyricsFileMock;
let getFeatureConfirmationsMock;
let confirmFeatureGateMock;
let listPlaylistsMock;
let libraryBackfillStatusHandler;
let libraryUpdatedHandler;
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

const confirmedLyricsFlow = {
  featureId: 'lyrics-flow',
  noticeVersion: 'feature-notice-v2',
  confirmedAt: '2026-08-20T00:00:00.000Z',
  enabled: true,
};

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

async function loadLyrics({ playlists } = {}) {
  if (playlists) {
    listPlaylistsMock.mockResolvedValue(playlists);
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
  libraryUpdatedHandler = null;
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
  importLyricsTextMock = vi.fn().mockResolvedValue({
    source: {
      filename: 'manual.lrc',
      language: 'und',
      kind: 'manual',
      label: 'Pasted',
    },
    sources: [
      {
        filename: 'manual.lrc',
        language: 'und',
        kind: 'manual',
        label: 'Pasted',
      },
    ],
  });
  importLyricsFileMock = vi.fn().mockResolvedValue({
    source: {
      filename: 'manual-2.lrc',
      language: 'und',
      kind: 'manual',
      label: 'picked',
    },
    sources: [
      {
        filename: 'manual-2.lrc',
        language: 'und',
        kind: 'manual',
        label: 'picked',
      },
    ],
  });
  getFeatureConfirmationsMock = vi.fn().mockResolvedValue({
    'lyrics-flow': confirmedLyricsFlow,
  });
  confirmFeatureGateMock = vi.fn();
  listPlaylistsMock = vi.fn().mockResolvedValue([DEFAULT_PLAYLIST]);
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
      importLyricsText: importLyricsTextMock,
      importLyricsFile: importLyricsFileMock,
      getFeatureConfirmations: getFeatureConfirmationsMock,
      confirmFeatureGate: confirmFeatureGateMock,
      listPlaylists: listPlaylistsMock,
      onLibraryUpdated: vi.fn((handler) => {
        libraryUpdatedHandler = handler;
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
  it('uses the full library list instead of the selected playlist order', async () => {
    const lyrics = await loadLyrics({
      playlists: [
        {
          id: 'p1',
          name: 'Setlist A',
          trackIds: [trackMissingLyrics.id, trackA.id, 'ghost-id', trackB.id],
        },
      ],
    });

    // Lyrics is its own workspace now: Setlist's collection rail does not
    // reorder or hide the lyrics track list.
    expect(lyrics.state.tracks.map((track) => track.id)).toEqual([
      trackA.id,
      trackB.id,
      trackMissingLyrics.id,
    ]);
  });

  it('re-fetches the shared library pool on refresh()', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    expect(listTracksMock).toHaveBeenCalledTimes(1);

    await lyrics.refresh();

    expect(listTracksMock).toHaveBeenCalledTimes(2);
  });

  it('still shows library tracks when no playlist is selected', async () => {
    const lyrics = await loadLyrics({
      playlists: [DEFAULT_PLAYLIST],
    });

    expect(lyrics.state.tracks.map((track) => track.id)).toEqual([
      trackA.id,
      trackB.id,
      trackMissingLyrics.id,
    ]);
    expect(lyrics.state.selectedTrackId).toBe(trackA.id);
  });

  it('ignores Setlist playlist changes without re-fetching or re-scoping lyrics tracks', async () => {
    const lyrics = await loadLyrics({
      playlists: [
        { id: 'p1', name: 'Setlist A', trackIds: [trackA.id] },
        { id: 'p2', name: 'Setlist B', trackIds: [trackB.id] },
      ],
    });

    expect(lyrics.state.tracks.map((track) => track.id)).toEqual([
      trackA.id,
      trackB.id,
      trackMissingLyrics.id,
    ]);
    expect(listTracksMock).toHaveBeenCalledTimes(1);

    const { usePlaylists } = await import('./usePlaylists.js');
    usePlaylists().select('p2');
    await flushPromises();

    expect(lyrics.state.tracks.map((track) => track.id)).toEqual([
      trackA.id,
      trackB.id,
      trackMissingLyrics.id,
    ]);
    expect(listTracksMock).toHaveBeenCalledTimes(1);
  });

  it('scopes to the selected Setlist playlist only after choosing the current-playlist scope', async () => {
    const lyrics = await loadLyrics({
      playlists: [
        {
          id: 'p1',
          name: 'Setlist A',
          trackIds: [trackMissingLyrics.id, trackA.id, 'ghost-id'],
        },
        { id: 'p2', name: 'Setlist B', trackIds: [trackB.id] },
      ],
    });
    const { usePlaylists } = await import('./usePlaylists.js');

    usePlaylists().select('p1');
    await flushPromises();
    lyrics.setTrackScope('current-playlist');
    await flushPromises();

    expect(lyrics.state.trackScope).toBe('current-playlist');
    expect(lyrics.state.tracks.map((track) => track.id)).toEqual([
      trackMissingLyrics.id,
      trackA.id,
    ]);

    usePlaylists().select('p2');
    await flushPromises();

    expect(lyrics.state.tracks.map((track) => track.id)).toEqual([trackB.id]);
  });

  it('supports Lyrics-owned local and missing-lyrics scopes', async () => {
    listTracksMock.mockResolvedValue([
      trackA,
      { ...trackB, sourceType: 'local-file' },
      trackMissingLyrics,
    ]);
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    lyrics.setTrackScope('local');
    await flushPromises();
    expect(lyrics.state.tracks.map((track) => track.id)).toEqual([trackB.id]);
    expect(lyrics.state.selectedTrackId).toBe(trackB.id);

    lyrics.setTrackScope('missing-lyrics');
    await flushPromises();
    expect(lyrics.state.tracks.map((track) => track.id)).toEqual([
      trackMissingLyrics.id,
    ]);
    expect(lyrics.state.selectedTrackId).toBe(trackMissingLyrics.id);
  });

  it('keeps the manually selected track when Setlist playlist selection changes', async () => {
    const lyrics = await loadLyrics({
      playlists: [
        { id: 'p1', name: 'Setlist A', trackIds: [trackA.id, trackB.id] },
        { id: 'p2', name: 'Setlist B', trackIds: [trackB.id] },
      ],
    });

    lyrics.selectTrack(trackB.id); // trackA is still the "playing" track
    await flushPromises();
    expect(lyrics.state.selectedTrackId).toBe(trackB.id);

    const { usePlaylists } = await import('./usePlaylists.js');
    usePlaylists().select('p2');
    await flushPromises();

    expect(lyrics.state.selectedTrackId).toBe(trackB.id);
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
    // currentTrackId tracks playback, not selection — trackA stays "playing"
    // even once trackB becomes the manually selected (lyrics-open) track.
    expect(lyrics.currentTrackId.value).toBe(trackA.id);
  });

  it('does not attempt a lyrics fetch when the preload bridge is unavailable', async () => {
    delete window.Utawakui.getTrackLyrics;
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    // The library-error watch (immediate, registered after this one) mirrors
    // libraryState.error over state.error right after module init, so the
    // bridge-missing message itself doesn't survive to be asserted on here
    // — what's observable is that no fetch was attempted.
    expect(lyrics.state.isLoadingLyrics).toBe(false);
    expect(lyrics.state.lyricsText).toBe('');
  });

  it('surfaces a lyrics-fetch error for a fresh (non-superseded) request', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    getTrackLyricsMock.mockRejectedValueOnce(new Error('lyrics fetch failed'));

    lyrics.selectTrack(trackB.id);
    await flushPromises();

    expect(lyrics.state.error).toBe('lyrics fetch failed');
  });

  it('ignores a stale successful lyrics response superseded by a newer selection', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    let resolveStale;
    getTrackLyricsMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStale = resolve;
        }),
    );

    lyrics.selectTrack(trackB.id); // stale-to-be request
    await flushPromises();
    lyrics.selectTrack(trackA.id); // newer request, resolves via the default mock
    await flushPromises();
    expect(lyrics.state.lyricSource).toMatchObject({ filename: 'en.vtt' });

    resolveStale({ text: 'STALE TEXT', source: { filename: 'stale.vtt' } });
    await flushPromises();

    expect(lyrics.state.lyricsText).not.toBe('STALE TEXT');
    expect(lyrics.state.lyricSource).toMatchObject({ filename: 'en.vtt' });
  });

  it('ignores a stale lyrics rejection superseded by a newer selection', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    let rejectStale;
    getTrackLyricsMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectStale = reject;
        }),
    );

    lyrics.selectTrack(trackB.id);
    await flushPromises();
    lyrics.selectTrack(trackA.id);
    await flushPromises();
    expect(lyrics.state.error).toBe(null);
    expect(lyrics.state.isLoadingLyrics).toBe(false);

    rejectStale(new Error('stale failure'));
    await flushPromises();

    expect(lyrics.state.error).toBe(null);
  });

  it('switches lyrics source, resetting offset, and no-ops when reselecting the same source', async () => {
    const trackWithTwoSources = {
      ...trackA,
      lyrics: {
        status: 'available',
        sources: [
          { filename: 'en.vtt', language: 'en', kind: 'youtube-cc' },
          { filename: 'ja.vtt', language: 'ja', kind: 'manual' },
        ],
      },
    };
    listTracksMock.mockResolvedValue([
      trackWithTwoSources,
      trackB,
      trackMissingLyrics,
    ]);
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    const initialFilename = lyrics.state.selectedSourceFilename;
    const otherFilename = initialFilename === 'en.vtt' ? 'ja.vtt' : 'en.vtt';

    lyrics.adjustOffset(2.5);
    expect(lyrics.state.offsetSeconds).toBe(2.5);

    lyrics.selectSource(initialFilename); // same filename: no-op
    expect(lyrics.state.offsetSeconds).toBe(2.5);
    expect(lyrics.state.selectedSourceFilename).toBe(initialFilename);

    lyrics.selectSource(otherFilename);
    await flushPromises();
    expect(lyrics.state.selectedSourceFilename).toBe(otherFilename);
    expect(lyrics.state.offsetSeconds).toBe(0);

    lyrics.adjustOffset(-1.25);
    lyrics.resetOffset();
    expect(lyrics.state.offsetSeconds).toBe(0);
  });

  it('starts following the selected lyrics after clicking a line to play that track', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    lyrics.selectTrack(trackB.id);
    await flushPromises();

    await lyrics.playFromLine(lyrics.lyricLines.value[1]);

    expect(playTrackMock).toHaveBeenCalledWith(trackB);
    expect(seekMock).toHaveBeenCalledWith(40);
    expect(lyrics.activeLineIndex.value).toBe(1);
  });

  it('queues the Lyrics workspace track pool when playback starts from a lyric line', async () => {
    const threeTrackPlaylist = {
      id: 'p1',
      name: 'Setlist A',
      trackIds: [trackA.id, trackB.id, trackMissingLyrics.id],
    };
    const lyrics = await loadLyrics({ playlists: [threeTrackPlaylist] });
    const { usePlaybackQueue } = await import('./usePlaybackQueue.js');
    const queue = usePlaybackQueue();

    lyrics.selectTrack(trackB.id);
    await flushPromises();

    await lyrics.playFromLine(lyrics.lyricLines.value[1]);

    expect(queue.state.tracks.map((track) => track.id)).toEqual([
      trackA.id,
      trackB.id,
      trackMissingLyrics.id,
    ]);
    expect(queue.state.currentTrackId).toBe(trackB.id);
    expect(queue.currentTrack.value).toEqual(trackB);
    expect(queue.state.sourceId).toBe('lyrics-workspace');
    expect(queue.state.sourceName).toBe('歌詞');
    expect(queue.sourceUpcomingTracks.value.map((track) => track.id)).toEqual([
      trackMissingLyrics.id,
    ]);
    expect(queue.canGoNext.value).toBe(true);
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

  it('marks a backfill error and resets counters when the stage goes idle, preserving totals when a partial payload omits them', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    libraryBackfillStatusHandler({
      stage: 'error',
      isRunning: false,
      total: 5,
      completed: 2,
      error: 'disk read failed',
    });
    expect(lyrics.state.backfillStatus.error).toBe('disk read failed');
    expect(lyrics.state.backfillStatus.total).toBe(5);

    // Error stage with no explicit error message falls back to a default.
    libraryBackfillStatusHandler({ stage: 'error', isRunning: false });
    expect(lyrics.state.backfillStatus.error).toBe('Reload failed');
    // total/completed omitted from this payload — previous values persist.
    expect(lyrics.state.backfillStatus.total).toBe(5);
    expect(lyrics.state.backfillStatus.completed).toBe(2);

    libraryBackfillStatusHandler({ stage: 'idle', isRunning: false });
    expect(lyrics.state.backfillStatus).toMatchObject({
      isRunning: false,
      total: 0,
      completed: 0,
      currentTrackId: null,
      currentTitle: null,
      error: null,
    });
  });

  it('does not requeue when clicking a lyric line for the already-playing track', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    // trackA is both selected and already playerState.track by default.
    await lyrics.playFromLine(lyrics.lyricLines.value[0]);

    expect(playTrackMock).not.toHaveBeenCalled();
    expect(seekMock).toHaveBeenCalledWith(1);
  });

  it('ignores playFromLine when there is no usable line or no selected track', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    await lyrics.playFromLine(null);
    await lyrics.playFromLine({ start: Number.NaN });

    expect(seekMock).not.toHaveBeenCalled();
    expect(playTrackMock).not.toHaveBeenCalled();
  });

  it('leaves the selected track alone when the playing track stops matching any lyrics track', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    const selectedBefore = lyrics.state.selectedTrackId;

    playerState.track = null;
    await flushPromises();

    expect(lyrics.state.selectedTrackId).toBe(selectedBefore);
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

  it('routes lyrics-flow setup to Settings before probing online lyrics', async () => {
    getFeatureConfirmationsMock.mockResolvedValueOnce({});
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    const { useAppView } = await import('./useAppView.js');
    const { useFeatureGateAccess } = await import('./useFeatureGateAccess.js');

    await expect(lyrics.probeMusixmatch()).resolves.toBe(null);

    expect(probeMusixmatchLyricsMock).not.toHaveBeenCalled();
    expect(confirmFeatureGateMock).not.toHaveBeenCalled();
    expect(useAppView().activeView.value).toBe('settings');
    expect(useFeatureGateAccess().state.request).toMatchObject({
      featureId: 'lyrics-flow',
      source: 'lyrics',
      operation: 'external-source',
    });
    expect(lyrics.state.musixmatchProbe.error).toBe('請先到設定啟用歌詞來源');
  });

  it('surfaces a Musixmatch probe error', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    probeMusixmatchLyricsMock.mockRejectedValueOnce(
      new Error('musixmatch down'),
    );

    await lyrics.probeMusixmatch();

    expect(lyrics.state.musixmatchProbe.error).toBe('musixmatch down');
    expect(lyrics.state.musixmatchProbe.isLoading).toBe(false);
  });

  it('ignores a stale successful Musixmatch probe superseded by a newer probe', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    let resolveStale;
    probeMusixmatchLyricsMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStale = resolve;
        }),
    );

    const stale = lyrics.probeMusixmatch();
    await lyrics.probeMusixmatch();
    expect(lyrics.state.musixmatchProbe.result).toMatchObject({
      provider: 'musixmatch',
      lineCount: 2,
    });

    resolveStale({
      provider: 'musixmatch',
      status: 'available',
      lineCount: 999,
    });
    await stale;
    await flushPromises();

    expect(lyrics.state.musixmatchProbe.result.lineCount).not.toBe(999);
  });

  it('ignores a stale Musixmatch probe rejection superseded by a newer probe', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    let rejectStale;
    probeMusixmatchLyricsMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectStale = reject;
        }),
    );

    const stale = lyrics.probeMusixmatch();
    await lyrics.probeMusixmatch();
    expect(lyrics.state.musixmatchProbe.error).toBe(null);

    rejectStale(new Error('stale musixmatch failure'));
    await stale;
    await flushPromises();

    expect(lyrics.state.musixmatchProbe.error).toBe(null);
  });

  it('does not throw when the backfill-status bridge API is unavailable', async () => {
    delete window.Utawakui.onLibraryBackfillStatus;
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    expect(lyrics.state.tracks.length).toBeGreaterThan(0);
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

  it('imports pasted manual lyrics without requesting the lyrics feature gate', async () => {
    const trackWithManualLyrics = {
      ...trackA,
      lyrics: {
        status: 'available',
        sources: [
          ...trackA.lyrics.sources,
          {
            filename: 'manual.lrc',
            language: 'und',
            kind: 'manual',
            label: 'Pasted',
          },
        ],
      },
    };
    listTracksMock
      .mockResolvedValueOnce([trackA, trackB, trackMissingLyrics])
      .mockResolvedValueOnce([
        trackWithManualLyrics,
        trackB,
        trackMissingLyrics,
      ]);
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    const result = await lyrics.importManualLyricsText({
      text: 'First line\nSecond line',
      label: 'Pasted',
    });
    await flushPromises();

    expect(result.source.filename).toBe('manual.lrc');
    expect(importLyricsTextMock).toHaveBeenCalledWith(trackA.id, {
      text: 'First line\nSecond line',
      label: 'Pasted',
    });
    expect(confirmFeatureGateMock).not.toHaveBeenCalled();
    expect(lyrics.state.selectedSourceFilename).toBe('manual.lrc');
  });

  it('imports a manually picked lyrics file without requesting the lyrics feature gate', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    await lyrics.importManualLyricsFile();

    expect(importLyricsFileMock).toHaveBeenCalledWith(trackA.id);
    expect(confirmFeatureGateMock).not.toHaveBeenCalled();
  });

  it('surfaces a restart hint when the manual lyrics import bridge is unavailable', async () => {
    delete window.Utawakui.importLyricsText;
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    await expect(
      lyrics.importManualLyricsText({ text: 'First line' }),
    ).resolves.toBe(null);

    expect(lyrics.state.manualSave).toMatchObject({
      isSaving: false,
      error: '手動匯入歌詞需要重新啟動應用程式才能載入新版橋接 API。',
    });
  });

  // Regression test: the shared useLibrary.js singleton's own
  // onLibraryUpdated subscription is what re-fetches here, not a
  // useLyrics.js-owned one — a fetch error triggered that way (not through
  // the manual refresh() button) must still surface in state.error.
  it('surfaces a library fetch error triggered via onLibraryUpdated, not just via refresh()', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    expect(lyrics.state.error).toBe(null);

    listTracksMock.mockRejectedValueOnce(new Error('disk read failed'));
    libraryUpdatedHandler();
    await flushPromises();

    expect(lyrics.state.error).toBe('disk read failed');

    listTracksMock.mockResolvedValue([trackA, trackB, trackMissingLyrics]);
    libraryUpdatedHandler();
    await flushPromises();

    expect(lyrics.state.error).toBe(null);
  });
});
