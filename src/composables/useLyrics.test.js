import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let playerState;
let listTracksMock;
let getTrackLyricsMock;
let saveLyricsTimingMock;
let setLyricsSourceOffsetMock;
let probeMusixmatchLyricsMock;
let importLyricsTextMock;
let importLyricsFileMock;
let searchLyricsCandidatesMock;
let saveLyricsCandidateMock;
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
const lyricsSourceFingerprint = 'a'.repeat(64);

const confirmedLyricsFlow = {
  featureId: 'lyrics-flow',
  noticeVersion: 'feature-notice-v3',
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
  const lyrics = module.useLyrics();
  await lyrics.initialize();
  await flushPromises();
  return lyrics;
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
    timing: {
      status: 'missing',
      sourceFingerprint: lyricsSourceFingerprint,
      normalizerProfileId: 'lyrics-source-v1',
    },
  });
  saveLyricsTimingMock = vi.fn(
    async (_trackId, _filename, fingerprint, document) => ({
      status: 'current',
      sourceFingerprint: fingerprint,
      normalizerProfileId: document.normalizerProfileId,
      document,
    }),
  );
  setLyricsSourceOffsetMock = vi.fn().mockResolvedValue({
    source: { filename: 'en.vtt' },
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
  searchLyricsCandidatesMock = vi.fn().mockResolvedValue({
    provider: 'lrclib',
    status: 'ok',
    candidates: [],
    groups: { best: [], related: [] },
    invalidRecordCount: 0,
  });
  saveLyricsCandidateMock = vi.fn();
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
      saveLyricsTiming: saveLyricsTimingMock,
      setLyricsSourceOffset: setLyricsSourceOffsetMock,
      probeMusixmatchLyrics: probeMusixmatchLyricsMock,
      importLyricsText: importLyricsTextMock,
      importLyricsFile: importLyricsFileMock,
      searchLyricsCandidates: searchLyricsCandidatesMock,
      saveLyricsCandidate: saveLyricsCandidateMock,
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
  it('submits an explicit editable LRCLIB query and preserves grouped diagnostics', async () => {
    const candidate = {
      id: 42,
      trackName: 'Manual title',
      artistName: 'Manual artist',
      matchBand: 'strong',
      previewFingerprint: 'b'.repeat(64),
    };
    searchLyricsCandidatesMock.mockResolvedValue({
      provider: 'lrclib',
      status: 'ok',
      candidates: [candidate],
      groups: { best: [candidate], related: [] },
      invalidRecordCount: 2,
    });
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    const result = await lyrics.searchLyricsCandidates({
      query: { title: 'Manual title', artist: 'Manual artist' },
    });

    expect(searchLyricsCandidatesMock).toHaveBeenCalledWith(trackA.id, {
      query: { title: 'Manual title', artist: 'Manual artist' },
    });
    expect(result).toMatchObject({ status: 'ok' });
    expect(lyrics.state.candidateSearch).toMatchObject({
      isLoading: false,
      trackId: trackA.id,
      status: 'ok',
      reason: null,
      invalidRecordCount: 2,
      groups: { best: [candidate], related: [] },
    });
  });

  it('keeps a newer LRCLIB result when an older request resolves late', async () => {
    let resolveFirst;
    searchLyricsCandidatesMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        provider: 'lrclib',
        status: 'ok',
        candidates: [{ id: 2, matchBand: 'exact' }],
        groups: { best: [{ id: 2, matchBand: 'exact' }], related: [] },
        invalidRecordCount: 0,
      });
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    const first = lyrics.searchLyricsCandidates({
      query: { title: 'First', artist: 'Artist' },
    });
    await vi.waitFor(() => {
      expect(searchLyricsCandidatesMock).toHaveBeenCalledTimes(1);
    });
    const second = lyrics.searchLyricsCandidates({
      query: { title: 'Second', artist: 'Artist' },
    });
    await second;
    resolveFirst({
      provider: 'lrclib',
      status: 'ok',
      candidates: [{ id: 1, matchBand: 'exact' }],
      groups: { best: [{ id: 1, matchBand: 'exact' }], related: [] },
      invalidRecordCount: 0,
    });
    await first;

    expect(lyrics.state.candidateSearch.candidates).toEqual([
      { id: 2, matchBand: 'exact' },
    ]);
  });

  it('does not start a search after the pending feature gate flow is cancelled', async () => {
    let resolveGate;
    getFeatureConfirmationsMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveGate = resolve;
        }),
    );
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    const pendingSearch = lyrics.searchLyricsCandidates({
      query: { title: 'Song', artist: 'Artist' },
    });
    await vi.waitFor(() =>
      expect(getFeatureConfirmationsMock).toHaveBeenCalledOnce(),
    );
    lyrics.clearCandidateSearch();
    resolveGate({ 'lyrics-flow': confirmedLyricsFlow });
    await pendingSearch;

    expect(searchLyricsCandidatesMock).not.toHaveBeenCalled();
    expect(lyrics.state.candidateSearch.isLoading).toBe(false);
  });

  it('maps typed LRCLIB failures to bounded user copy and shared diagnostics', async () => {
    searchLyricsCandidatesMock.mockResolvedValue({
      provider: 'lrclib',
      status: 'error',
      reason: 'rate-limited',
      candidates: [],
      groups: null,
    });
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    await lyrics.searchLyricsCandidates({
      query: { title: 'Song', artist: 'Artist' },
    });

    expect(lyrics.state.candidateSearch).toMatchObject({
      status: 'error',
      reason: 'rate-limited',
      error: 'LRCLIB 暫時限制搜尋請求，請稍後再試。',
      groups: { best: [], related: [] },
    });
  });

  it('keeps a changed record pending until confirmation, then regroups it', async () => {
    const original = {
      id: 42,
      trackName: 'Song',
      matchBand: 'exact',
      previewFingerprint: 'a'.repeat(64),
    };
    const changed = {
      ...original,
      trackName: 'Song (updated)',
      matchBand: 'related',
      previewFingerprint: 'b'.repeat(64),
    };
    searchLyricsCandidatesMock.mockResolvedValue({
      provider: 'lrclib',
      status: 'ok',
      candidates: [original],
      groups: { best: [original], related: [] },
      invalidRecordCount: 0,
    });
    saveLyricsCandidateMock
      .mockResolvedValueOnce({
        provider: 'lrclib',
        status: 'record-changed',
        candidate: changed,
      })
      .mockResolvedValueOnce({
        provider: 'lrclib',
        status: 'saved',
        source: { filename: 'lrclib-42.lrc' },
        retrievedAt: '2026-08-23T12:00:00.000Z',
      });
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    await lyrics.searchLyricsCandidates();

    const result = await lyrics.saveLyricsCandidate(original);

    expect(result).toMatchObject({ status: 'record-changed' });
    expect(lyrics.state.candidateSearch.candidates[0]).toEqual(original);
    expect(lyrics.state.candidateSearch.groups.best[0]).toEqual(original);

    await lyrics.saveLyricsCandidate(changed);
    expect(lyrics.state.candidateSearch.groups).toEqual({
      best: [],
      related: [
        {
          ...changed,
          alreadySaved: true,
          saveState: 'current',
          retrievedAt: '2026-08-23T12:00:00.000Z',
        },
      ],
    });
  });

  it('pins search and save work to the track that opened the candidate view', async () => {
    let resolveSave;
    const candidate = {
      id: 42,
      trackName: 'Song',
      matchBand: 'exact',
      previewFingerprint: 'a'.repeat(64),
    };
    saveLyricsCandidateMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    lyrics.selectTrack(trackB.id);
    await lyrics.searchLyricsCandidates(
      { query: { title: 'Track A', artist: 'Artist A' } },
      trackA.id,
    );
    expect(searchLyricsCandidatesMock).toHaveBeenCalledWith(
      trackA.id,
      expect.any(Object),
    );

    lyrics.selectTrack(trackA.id);
    const pendingSave = lyrics.saveLyricsCandidate(candidate, trackA.id);
    await vi.waitFor(() =>
      expect(saveLyricsCandidateMock).toHaveBeenCalledWith(
        trackA.id,
        candidate.id,
        candidate.previewFingerprint,
        undefined,
      ),
    );
    lyrics.selectTrack(trackB.id);
    resolveSave({
      provider: 'lrclib',
      status: 'saved',
      source: { filename: 'lrclib-42.lrc' },
    });
    await pendingSave;

    expect(lyrics.state.selectedTrackId).toBe(trackB.id);
    expect(lyrics.state.selectedSourceFilename).toBe('en.vtt');
  });

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

  it('owns one canonical document and derives the active stable line id', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    expect(lyrics.lyricsDocument.value).toMatchObject({
      schemaVersion: 1,
      source: {
        filename: 'en.vtt',
        sha256: lyricsSourceFingerprint,
      },
      granularity: 'T1',
      lines: [
        { text: 'Opening', startMs: 1000, endMs: 10000 },
        { text: 'Middle', startMs: 40000, endMs: 50000 },
      ],
    });
    expect(lyrics.lyricLines.value[0].lineId).toBe(
      lyrics.lyricsDocument.value.lines[0].lineId,
    );
    expect(lyrics.activeLineId.value).toBe(
      lyrics.lyricsDocument.value.lines[1].lineId,
    );
  });

  it('derives active segment identity from the same player clock', async () => {
    playerState.currentTime = 1.25;
    const segmentedDocument = {
      schemaVersion: 1,
      documentId: 'lyr_saved',
      normalizerProfileId: 'lyrics-source-v1',
      source: { filename: 'en.vtt', sha256: lyricsSourceFingerprint },
      granularity: 'T2',
      lines: [
        {
          lineId: 'line_1',
          text: 'Opening',
          startMs: 1000,
          endMs: 2000,
          segments: [
            {
              segmentId: 'segment_1',
              text: 'Opening',
              startMs: 1000,
              endMs: 1500,
            },
          ],
        },
      ],
    };
    getTrackLyricsMock.mockResolvedValueOnce({
      source: { filename: 'en.vtt', language: 'en', kind: 'youtube-cc' },
      text: lyricsText,
      timing: {
        status: 'current',
        sourceFingerprint: lyricsSourceFingerprint,
        normalizerProfileId: 'lyrics-source-v1',
        document: segmentedDocument,
      },
    });

    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });

    expect(lyrics.activeLineId.value).toBe('line_1');
    expect(lyrics.activeSegmentId.value).toBe('segment_1');
    expect(lyrics.playbackState.value.activeSegmentProgress).toBe(0.5);
    expect(lyrics.currentLyricsPositionMs.value).toBe(1250);
  });

  it('persists a timing document only when explicitly requested', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    const document = {
      ...lyrics.lyricsDocument.value,
      granularity: 'T2',
      lines: lyrics.lyricsDocument.value.lines.map((line, index) =>
        index === 0
          ? {
              ...line,
              segments: [
                {
                  segmentId: `${line.lineId}_s_0`,
                  text: line.text,
                  startMs: line.startMs,
                  endMs: line.endMs,
                },
              ],
            }
          : line,
      ),
    };

    expect(saveLyricsTimingMock).not.toHaveBeenCalled();
    await expect(lyrics.saveTimingDocument(document)).resolves.toEqual(
      document,
    );
    expect(saveLyricsTimingMock).toHaveBeenCalledWith(
      trackA.id,
      'en.vtt',
      lyricsSourceFingerprint,
      document,
    );
    expect(lyrics.lyricsTiming.value).toMatchObject({
      status: 'current',
      document,
    });
  });

  it('keeps the current document and surfaces a timing save failure', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    const original = lyrics.lyricsDocument.value;
    saveLyricsTimingMock.mockRejectedValueOnce(new Error('source changed'));

    await expect(lyrics.saveTimingDocument({ ...original })).resolves.toBe(
      null,
    );

    expect(lyrics.lyricsDocument.value).toBe(original);
    expect(lyrics.state.timingSave).toMatchObject({
      isSaving: false,
      error: '歌詞時間未儲存，請再試一次。',
    });
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

    expect(lyrics.state.error).toBe('目前無法讀取歌詞，請再試一次。');
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

  it('restores and persists an independent offset for each lyrics source', async () => {
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
    const offsets = new Map([
      ['en.vtt', 2500],
      ['ja.vtt', -1300],
    ]);
    getTrackLyricsMock.mockImplementation(async (_trackId, filename) => ({
      source: {
        filename,
        language: filename === 'ja.vtt' ? 'ja' : 'en',
        kind: filename === 'ja.vtt' ? 'manual' : 'youtube-cc',
        ...(offsets.get(filename) ? { offsetMs: offsets.get(filename) } : {}),
      },
      text: lyricsText,
      timing: {
        status: 'missing',
        sourceFingerprint: lyricsSourceFingerprint,
        normalizerProfileId: 'lyrics-source-v1',
      },
    }));
    setLyricsSourceOffsetMock.mockImplementation(
      async (_trackId, filename, offsetMs) => {
        offsets.set(filename, offsetMs);
        return { source: { filename, ...(offsetMs ? { offsetMs } : {}) } };
      },
    );
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    const initialFilename = lyrics.state.selectedSourceFilename;
    const otherFilename = initialFilename === 'en.vtt' ? 'ja.vtt' : 'en.vtt';

    expect(lyrics.state.offsetSeconds).toBe(2.5);
    lyrics.adjustOffset(0.1);
    await flushPromises();
    expect(lyrics.state.offsetSeconds).toBe(2.6);
    expect(setLyricsSourceOffsetMock).toHaveBeenLastCalledWith(
      trackA.id,
      initialFilename,
      2600,
    );

    lyrics.selectSource(initialFilename); // same filename: no-op
    expect(lyrics.state.offsetSeconds).toBe(2.6);
    expect(lyrics.state.selectedSourceFilename).toBe(initialFilename);

    lyrics.selectSource(otherFilename);
    await flushPromises();
    expect(lyrics.state.selectedSourceFilename).toBe(otherFilename);
    expect(lyrics.state.offsetSeconds).toBe(-1.3);

    lyrics.resetOffset();
    await flushPromises();
    expect(lyrics.state.offsetSeconds).toBe(0);
    expect(setLyricsSourceOffsetMock).toHaveBeenLastCalledWith(
      trackA.id,
      otherFilename,
      0,
    );

    lyrics.selectSource(initialFilename);
    await flushPromises();
    expect(lyrics.state.offsetSeconds).toBe(2.6);
  });

  it('keeps the live adjustment and reports a bounded offset persistence failure', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    setLyricsSourceOffsetMock.mockRejectedValueOnce(
      new Error('disk path leaked'),
    );

    lyrics.adjustOffset(0.1);
    await flushPromises();

    expect(lyrics.state.offsetSeconds).toBe(0.1);
    expect(lyrics.state.offsetSave).toMatchObject({
      isSaving: false,
      error: '同步調整未儲存，請再試一次。',
    });
  });

  it('ignores an offset save failure after the user switches tracks', async () => {
    const lyrics = await loadLyrics({ playlists: [DEFAULT_PLAYLIST] });
    let rejectStaleSave;
    setLyricsSourceOffsetMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectStaleSave = reject;
        }),
    );

    lyrics.adjustOffset(0.1);
    lyrics.selectTrack(trackB.id);
    await flushPromises();
    rejectStaleSave(new Error('stale disk failure'));
    await flushPromises();

    expect(lyrics.state.selectedTrackId).toBe(trackB.id);
    expect(lyrics.state.offsetSave).toMatchObject({
      isSaving: false,
      error: null,
    });
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
    expect(lyrics.state.backfillStatus.error).toBe('部分曲目資訊未更新。');
    expect(lyrics.state.backfillStatus.total).toBe(5);

    // Error stage with no explicit error message falls back to a default.
    libraryBackfillStatusHandler({ stage: 'error', isRunning: false });
    expect(lyrics.state.backfillStatus.error).toBe('部分曲目資訊未更新。');
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

    expect(lyrics.state.musixmatchProbe.error).toBe(
      '目前無法檢查歌詞來源，請再試一次。',
    );
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
      error: '請重新啟動應用程式後再檢查歌詞來源。',
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
      error: '請重新啟動應用程式後再匯入歌詞。',
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

    expect(lyrics.state.error).toBe('目前無法讀取曲庫，請再試一次。');

    listTracksMock.mockResolvedValue([trackA, trackB, trackMissingLyrics]);
    libraryUpdatedHandler();
    await flushPromises();

    expect(lyrics.state.error).toBe(null);
  });
});
