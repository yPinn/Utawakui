import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../utils/appErrors.js';

let fetchYoutubePlaylistMock;
let resolveImportSourceMock;
let fetchVideoMetadataMock;
let downloadAudioMock;
let getConfigMock;
let getFeatureConfirmationsMock;
let confirmFeatureGateMock;
let chooseDownloadDirMock;
let resetDownloadDirMock;
let openDownloadDirMock;
let listPlaylistsMock;
let createPlaylistMock;
let setPlaylistTracksMock;
let upsertAlbumMock;

// usePlaylists.js is a module-scope singleton that useImportSession.js now
// imports transitively — it eagerly calls listPlaylists()/onLibraryUpdated()
// at module-load time (see usePlaylists.test.js), so window.Utawakui needs
// all four of these stubbed or every test in this file fails on load, not
// just the new ones.
function nextPlaylistId(name) {
  return `playlist-${name}`;
}

// createPlaylistMock/setPlaylistTracksMock must resolve with the current
// playlists array, same as the real IPC backend — usePlaylists.js's
// mutateTracks() re-derives its local state from whatever the mock
// resolves, so an empty-array stub silently erases the just-created
// playlist and breaks any test that syncs the same playlist twice (e.g. a
// retry).
let mockPlaylist;

const confirmedProviderFlow = {
  featureId: 'provider-flow',
  noticeVersion: 'feature-notice-v3',
  confirmedAt: '2026-08-13T00:00:00.000Z',
  enabled: true,
};

beforeEach(() => {
  vi.resetModules();
  mockPlaylist = null;
  fetchYoutubePlaylistMock = vi.fn();
  resolveImportSourceMock = vi.fn();
  fetchVideoMetadataMock = vi.fn();
  downloadAudioMock = vi.fn();
  getConfigMock = vi.fn().mockResolvedValue({
    downloadDir: 'C:\\Music\\Utawakui',
    isDefault: true,
  });
  getFeatureConfirmationsMock = vi.fn().mockResolvedValue({
    'provider-flow': confirmedProviderFlow,
  });
  confirmFeatureGateMock = vi.fn().mockResolvedValue(confirmedProviderFlow);
  chooseDownloadDirMock = vi.fn();
  resetDownloadDirMock = vi.fn();
  openDownloadDirMock = vi.fn();
  listPlaylistsMock = vi.fn().mockResolvedValue([]);
  createPlaylistMock = vi.fn(async (name) => {
    mockPlaylist = {
      id: nextPlaylistId(name),
      name,
      trackIds: [],
      addedAt: {},
    };
    return [mockPlaylist];
  });
  setPlaylistTracksMock = vi.fn(async (id, trackIds) => {
    if (mockPlaylist?.id === id) mockPlaylist = { ...mockPlaylist, trackIds };
    return mockPlaylist ? [mockPlaylist] : [];
  });
  upsertAlbumMock = vi.fn(async ({ source, trackIds } = {}) => {
    mockPlaylist = {
      id: 'album-1',
      kind: 'album',
      source,
      trackIds,
      addedAt: {},
    };
    return [mockPlaylist];
  });
  vi.stubGlobal('window', {
    Utawakui: {
      fetchYoutubePlaylist: fetchYoutubePlaylistMock,
      resolveImportSource: resolveImportSourceMock,
      fetchVideoMetadata: fetchVideoMetadataMock,
      downloadAudio: downloadAudioMock,
      getConfig: getConfigMock,
      getFeatureConfirmations: getFeatureConfirmationsMock,
      confirmFeatureGate: confirmFeatureGateMock,
      chooseDownloadDir: chooseDownloadDirMock,
      resetDownloadDir: resetDownloadDirMock,
      openDownloadDir: openDownloadDirMock,
      listPlaylists: listPlaylistsMock,
      createPlaylist: createPlaylistMock,
      setPlaylistTracks: setPlaylistTracksMock,
      upsertAlbum: upsertAlbumMock,
      onLibraryUpdated: () => () => {},
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadImportSession() {
  const { useImportSession } = await import('./useImportSession.js');
  return useImportSession();
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('useImportSession', () => {
  it('preserves the exact public import-session API', async () => {
    const session = await loadImportSession();

    expect(Object.keys(session).sort()).toEqual([
      'allSelected',
      'canConfirmImport',
      'canRetryFailed',
      'canUseConfirmButton',
      'chooseDownloadDir',
      'clearPreview',
      'confirmImport',
      'confirmImportLabel',
      'dominantFailureCode',
      'filterOptions',
      'getTrackStatusClass',
      'getTrackStatusLabel',
      'openDownloadDir',
      'playlistStats',
      'refreshConfig',
      'resetDownloadDir',
      'resolveSource',
      'retryFailedTracks',
      'selectImportCandidate',
      'selectMissingTracks',
      'selectablePlaylistTracks',
      'setActiveFilter',
      'setInput',
      'setTrackSelected',
      'state',
      'toggleSelectAll',
      'visiblePlaylistTracks',
    ]);
  });

  it('keeps a resolved playlist preview in the shared session without downloading', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        {
          id: 'video-1',
          title: 'Song 1',
          artist: 'Singer',
          duration: 180,
          alreadyDownloaded: false,
        },
      ],
    });
    const first = await loadImportSession();

    first.setInput('https://youtube.com/playlist?list=abc');
    await first.resolveSource();
    const second = await loadImportSession();

    expect(downloadAudioMock).not.toHaveBeenCalled();
    expect(second.state.sourceKind).toBe('playlist');
    expect(second.state.playlistTracks).toEqual([
      {
        id: 'video-1',
        title: 'Song 1',
        artist: 'Singer',
        duration: 180,
        alreadyDownloaded: false,
        selected: true,
        status: 'pending',
        errorCode: null,
      },
    ]);
  });

  it('prevents a second source resolution while the first is pending', async () => {
    const pendingResolution = deferred();
    fetchYoutubePlaylistMock.mockReturnValueOnce(pendingResolution.promise);
    const session = await loadImportSession();
    session.setInput('playlist-id');

    const first = session.resolveSource();
    await vi.waitFor(() => {
      expect(fetchYoutubePlaylistMock).toHaveBeenCalledOnce();
    });
    await session.resolveSource();

    expect(fetchYoutubePlaylistMock).toHaveBeenCalledOnce();
    pendingResolution.resolve({ title: 'Set', entries: [] });
    await first;
  });

  it('treats non-playlist input as a confirmation-ready single source', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce(null);
    resolveImportSourceMock.mockResolvedValueOnce({
      input: 'https://youtube.com/watch?v=abc12345678',
      sourceVideoId: 'abc12345678',
      canonical: {
        title: 'Single Song',
        artist: 'Singer',
        duration: 180,
      },
      source: {
        playbackVideoId: 'abc12345678',
        title: 'Single Song',
        artist: 'Singer',
        duration: 180,
        thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
        alreadyDownloaded: false,
      },
      recommendedCandidate: {
        playbackVideoId: 'aud12345678',
        title: 'Single Song',
        artist: 'Singer',
        duration: 180,
        thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
        playbackKind: 'yt-music-song',
        alreadyDownloaded: false,
      },
      candidates: [
        {
          playbackVideoId: 'aud12345678',
          title: 'Single Song',
          artist: 'Singer',
          duration: 180,
          playbackKind: 'yt-music-song',
          alreadyDownloaded: false,
        },
      ],
      downloadInput: 'aud12345678',
    });
    downloadAudioMock.mockResolvedValueOnce({ title: 'Single Song' });
    const session = await loadImportSession();

    session.setInput('https://youtube.com/watch?v=abc12345678');
    await session.resolveSource();

    expect(downloadAudioMock).not.toHaveBeenCalled();
    expect(resolveImportSourceMock).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc12345678',
    );
    expect(fetchVideoMetadataMock).not.toHaveBeenCalled();
    expect(session.state.sourceKind).toBe('single');
    expect(session.confirmImportLabel.value).toBe('下載這首');
    expect(session.state.selectedCandidateId).toBe('aud12345678');
    expect(session.state.singleTrack).toMatchObject({
      id: 'aud12345678',
      title: 'Single Song',
      artist: 'Singer',
      duration: 180,
      thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
      alreadyDownloaded: false,
      downloadInput: 'aud12345678',
      sourceVideoId: 'abc12345678',
      playbackKind: 'yt-music-song',
      selected: true,
      status: 'pending',
      errorCode: null,
    });
    expect(session.canConfirmImport.value).toBe(true);

    await session.confirmImport();

    expect(downloadAudioMock).toHaveBeenCalledWith('aud12345678');
    expect(session.state.status).toBe('已下載：Single Song');
    expect(session.state.sourceKind).toBe('idle');
  });

  it('lets the selected single candidate decide the downloaded video id', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce(null);
    resolveImportSourceMock.mockResolvedValueOnce({
      input: 'https://youtube.com/watch?v=mv123456789',
      sourceVideoId: 'mv123456789',
      canonical: {
        title: 'Single Song',
        artist: 'Singer',
        duration: 180,
      },
      source: {
        playbackVideoId: 'mv123456789',
        title: 'Single Song Official MV',
        artist: 'Singer',
        duration: 220,
        playbackKind: 'youtube-official-mv',
        alreadyDownloaded: false,
      },
      recommendedCandidate: {
        playbackVideoId: 'aud12345678',
        title: 'Single Song',
        artist: 'Singer',
        duration: 180,
        playbackKind: 'yt-music-song',
        alreadyDownloaded: false,
      },
      candidates: [
        {
          playbackVideoId: 'aud12345678',
          title: 'Single Song',
          artist: 'Singer',
          duration: 180,
          playbackKind: 'yt-music-song',
          alreadyDownloaded: false,
        },
        {
          playbackVideoId: 'mv123456789',
          title: 'Single Song Official MV',
          artist: 'Singer',
          duration: 220,
          playbackKind: 'youtube-official-mv',
          alreadyDownloaded: false,
        },
      ],
    });
    downloadAudioMock.mockResolvedValueOnce({
      title: 'Single Song Official MV',
    });
    const session = await loadImportSession();

    session.setInput('https://youtube.com/watch?v=mv123456789');
    await session.resolveSource();
    session.selectImportCandidate('mv123456789');
    await session.confirmImport();

    expect(session.state.selectedCandidateId).toBe('mv123456789');
    expect(downloadAudioMock).toHaveBeenCalledWith('mv123456789');
  });

  it('downloads only selected playlist tracks after confirmation', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        {
          id: 'selected',
          title: 'Selected',
          alreadyDownloaded: false,
        },
        {
          id: 'unselected',
          title: 'Unselected',
          alreadyDownloaded: false,
        },
        {
          id: 'already',
          title: 'Already',
          alreadyDownloaded: true,
        },
      ],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setTrackSelected(session.state.playlistTracks[1].id, false);
    await session.confirmImport();

    expect(downloadAudioMock).toHaveBeenCalledTimes(1);
    expect(downloadAudioMock).toHaveBeenCalledWith('selected');
    expect(session.state.playlistTracks.map((track) => track.status)).toEqual([
      'done',
      'pending',
      'pending',
    ]);
  });

  it('creates a local playlist named after the source title once tracks finish downloading', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(createPlaylistMock).toHaveBeenCalledWith('My Setlist');
    expect(setPlaylistTracksMock).toHaveBeenCalledWith(
      nextPlaylistId('My Setlist'),
      ['song-1'],
    );
    expect(session.state.status).toBe('已加入播放清單「My Setlist」');
  });

  it('includes already-downloaded-but-selected tracks in the synced playlist', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        { id: 'song-1', title: 'Song 1', alreadyDownloaded: false },
        { id: 'song-2', title: 'Song 2', alreadyDownloaded: true },
      ],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setTrackSelected(session.state.playlistTracks[1].id, true);
    await session.confirmImport();

    expect(setPlaylistTracksMock).toHaveBeenCalledWith(
      nextPlaylistId('My Setlist'),
      ['song-1', 'song-2'],
    );
  });

  it('sends a structurally cloneable payload to upsertAlbum for album sources', async () => {
    // Regression test: state.collectionSource used to be assigned straight
    // onto reactive() state, so reading it back for the upsertAlbum payload
    // handed ipcRenderer.invoke a Vue reactive Proxy instead of a plain
    // object. Proxies fail structured cloning — the real IPC boundary threw
    // "An object could not be cloned." structuredClone() below exercises the
    // same clone algorithm Electron's ipcRenderer.invoke uses, so this test
    // fails the same way a mock-only assertion wouldn't.
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Album',
      kind: 'album',
      source: { platform: 'youtube', id: 'OLAK5uy_abc' },
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(upsertAlbumMock).toHaveBeenCalledTimes(1);
    const payload = upsertAlbumMock.mock.calls[0][0];
    expect(() => structuredClone(payload)).not.toThrow();
    expect(payload).toEqual({
      name: 'My Album',
      source: { platform: 'youtube', id: 'OLAK5uy_abc' },
      trackIds: ['song-1'],
      thumbnailUrl: null,
    });
    expect(session.state.status).toBe('已加入專輯「My Album」');
  });

  it('strips the "Album - " prefix yt-dlp puts on YT Music album titles', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'Album - strobo',
      kind: 'album',
      source: { platform: 'youtube', id: 'OLAK5uy_abc' },
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(session.state.playlistTitle).toBe('strobo');

    await session.confirmImport();

    expect(upsertAlbumMock.mock.calls[0][0].name).toBe('strobo');
  });

  it('keeps a backend-resolved YT Music album metadata title intact', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: '海螺記',
      kind: 'album',
      source: {
        platform: 'youtube',
        id: 'OLAK5uy_nBWL9lmnXFFbywEUiSJAHvuCyoA62FZAo',
      },
      entries: [
        { id: 'qog79Ke0IvQ', title: '門縫後的光', alreadyDownloaded: true },
      ],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(session.state.playlistTitle).toBe('海螺記');

    await session.confirmImport();

    expect(upsertAlbumMock.mock.calls[0][0].name).toBe('海螺記');
  });

  it('does not strip an "Album - " prefix on an ordinary (non-album) playlist title', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'Album - My Mix',
      kind: 'playlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(session.state.playlistTitle).toBe('Album - My Mix');
  });

  it("forwards the playlist's thumbnailUrl into the upsertAlbum payload", async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Album',
      kind: 'album',
      source: { platform: 'youtube', id: 'OLAK5uy_abc' },
      thumbnailUrl: 'https://i.ytimg.com/vi/album-art/hqdefault.jpg',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(upsertAlbumMock.mock.calls[0][0].thumbnailUrl).toBe(
      'https://i.ytimg.com/vi/album-art/hqdefault.jpg',
    );
  });

  it('still syncs an album whose tracks are all already downloaded', async () => {
    // Regression test: re-importing an album where every track already
    // exists locally used to be a dead end — createPreviewTrack defaulted
    // alreadyDownloaded tracks to unselected, the checkbox to select them
    // was disabled, and hasImportableSelection required a downloadable
    // selection to enable the confirm button at all. The album could never
    // be (re-)created even though every track was already on disk.
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'Florskyn',
      kind: 'album',
      source: { platform: 'youtube', id: 'OLAK5uy_florskyn' },
      entries: Array.from({ length: 10 }, (_, i) => ({
        id: `song-${i + 1}`,
        title: `Song ${i + 1}`,
        alreadyDownloaded: true,
      })),
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(session.state.playlistTracks.every((track) => track.selected)).toBe(
      true,
    );
    expect(session.confirmImportLabel.value).toBe('加入 10 首');
    expect(session.canUseConfirmButton.value).toBe(true);

    await session.confirmImport();

    expect(downloadAudioMock).not.toHaveBeenCalled();
    expect(upsertAlbumMock).toHaveBeenCalledTimes(1);
    expect(upsertAlbumMock.mock.calls[0][0].trackIds).toEqual(
      Array.from({ length: 10 }, (_, i) => `song-${i + 1}`),
    );
    expect(session.state.status).toBe('已加入專輯「Florskyn」');
  });

  it('re-syncs the same local playlist on retry instead of creating a duplicate', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        { id: 'ok-song', title: 'OK Song', alreadyDownloaded: false },
        { id: 'bad-song', title: 'Bad Song', alreadyDownloaded: false },
      ],
    });
    downloadAudioMock.mockImplementation(async (id) => {
      if (id === 'bad-song') throw new Error('network error');
      return { title: 'ok' };
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(createPlaylistMock).toHaveBeenCalledTimes(1);
    expect(setPlaylistTracksMock).toHaveBeenNthCalledWith(
      1,
      nextPlaylistId('My Setlist'),
      ['ok-song'],
    );

    downloadAudioMock.mockResolvedValueOnce({ title: 'ok' });
    await session.retryFailedTracks();

    expect(createPlaylistMock).toHaveBeenCalledTimes(1);
    expect(setPlaylistTracksMock).toHaveBeenNthCalledWith(
      2,
      nextPlaylistId('My Setlist'),
      ['ok-song', 'bad-song'],
    );
  });

  it('creates no playlist when nothing ends up selected and downloaded', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockRejectedValue(new Error('network error'));
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(createPlaylistMock).not.toHaveBeenCalled();
  });

  it('falls back to metadata preview when the resolver preload API is stale', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce(null);
    delete window.Utawakui.resolveImportSource;
    fetchVideoMetadataMock.mockResolvedValueOnce({
      id: 'abc12345678',
      title: 'Single Song',
      artist: 'Singer',
      duration: 180,
      alreadyDownloaded: false,
    });
    downloadAudioMock.mockResolvedValueOnce({ title: 'Single Song' });
    const session = await loadImportSession();

    session.setInput('https://youtube.com/watch?v=abc12345678');
    await session.resolveSource();
    await session.confirmImport();

    expect(fetchVideoMetadataMock).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc12345678',
    );
    expect(downloadAudioMock).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc12345678',
    );
  });

  it('keeps single import usable when the metadata preload API is stale', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce(null);
    delete window.Utawakui.resolveImportSource;
    delete window.Utawakui.fetchVideoMetadata;
    downloadAudioMock.mockResolvedValueOnce({ title: 'Fallback Song' });
    const session = await loadImportSession();

    session.setInput('https://youtube.com/watch?v=abc12345678');
    await session.resolveSource();

    expect(session.state.sourceKind).toBe('single');
    expect(session.state.singleTrack).toEqual({
      id: 'https://youtube.com/watch?v=abc12345678',
      title: 'https://youtube.com/watch?v=abc12345678',
      alreadyDownloaded: false,
      selected: true,
      status: 'pending',
      errorCode: null,
    });
    expect(session.canConfirmImport.value).toBe(true);

    await session.confirmImport();

    expect(downloadAudioMock).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc12345678',
    );
  });

  it('clears preview state without clearing the typed source', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'video-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.clearPreview();

    expect(session.state.input).toBe('playlist-id');
    expect(session.state.sourceKind).toBe('idle');
    expect(session.state.singleTrack).toBe(null);
    expect(session.state.playlistTracks).toBe(null);
    expect(session.state.playlistTitle).toBe(null);
    expect(session.state.createdPlaylistId).toBe(null);
    expect(session.state.activeFilter).toBe('all');
  });

  it('shows an error and does not query the backend when the input is blank', async () => {
    const session = await loadImportSession();

    session.setInput('   ');
    await session.resolveSource();

    expect(fetchYoutubePlaylistMock).not.toHaveBeenCalled();
    expect(session.state.status).toBe('請貼上 YouTube 或 YouTube Music 連結');
    expect(session.state.statusType).toBe('error');
  });

  it('routes provider-flow setup to Settings before resolving a source', async () => {
    getFeatureConfirmationsMock.mockResolvedValueOnce({});
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'video-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    const session = await loadImportSession();
    const { useAppView } = await import('./useAppView.js');
    const { useFeatureGateAccess } = await import('./useFeatureGateAccess.js');

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(fetchYoutubePlaylistMock).not.toHaveBeenCalled();
    expect(confirmFeatureGateMock).not.toHaveBeenCalled();
    expect(useAppView().activeView.value).toBe('settings');
    expect(useFeatureGateAccess().state.request).toMatchObject({
      featureId: 'provider-flow',
      source: 'import',
      operation: 'resolve-source',
    });
    expect(session.state.status).toBe('請先到設定啟用外部來源');
    expect(session.state.statusType).toBe('pending');
  });

  it('clears the preview and surfaces a classified error message when resolving throws', async () => {
    fetchYoutubePlaylistMock.mockRejectedValueOnce(
      new Error('utawakui-download-failed:network-error'),
    );
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(session.state.sourceKind).toBe('idle');
    expect(session.state.status).toBe('找不到來源：網路連線失敗');
    expect(session.state.statusType).toBe('error');
    expect(session.state.failureHint).toBe('請確認網路連線後再重試。');
  });

  it('routes missing provider tools back to Settings instead of download-failure copy', async () => {
    fetchYoutubePlaylistMock.mockRejectedValueOnce(
      new Error(
        `${APP_ERROR_PREFIX}${JSON.stringify({
          code: 'FEATURE_DEPENDENCY_MISSING',
          severity: 'warning',
          title: '需要先準備外部來源工具',
          message: '請先到設定頁準備「線上來源下載工具」，再使用外部來源。',
          actionLabel: '前往設定',
          context: {
            featureId: 'provider-flow',
            dependencyId: 'yt-dlp-provider-tool',
          },
        })}`,
      ),
    );
    const session = await loadImportSession();
    const { useAppView } = await import('./useAppView.js');

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(useAppView().activeView.value).toBe('settings');
    expect(session.state.status).toBe('請到設定完成外部來源準備。');
    expect(session.state.statusType).toBe('pending');
    expect(session.state.failureHint).toBe(
      '請在設定的「進階功能」中準備外部來源工具。',
    );
  });

  it('falls back to the unknown label for an unclassified resolve error', async () => {
    fetchYoutubePlaylistMock.mockRejectedValueOnce(new Error('network down'));
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(session.state.status).toBe('找不到來源：下載失敗');
    expect(session.state.statusType).toBe('error');
  });

  it('surfaces a classified download error for a single-track import without throwing', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce(null);
    resolveImportSourceMock.mockResolvedValueOnce({
      input: 'abc12345678',
      sourceVideoId: 'abc12345678',
      source: { playbackVideoId: 'abc12345678', title: 'Song' },
      recommendedCandidate: { playbackVideoId: 'abc12345678', title: 'Song' },
      candidates: [{ playbackVideoId: 'abc12345678', title: 'Song' }],
    });
    downloadAudioMock.mockRejectedValueOnce(
      new Error('utawakui-download-failed:disk-full'),
    );
    const session = await loadImportSession();

    session.setInput('abc12345678');
    await session.resolveSource();
    await session.confirmImport();

    expect(session.state.status).toBe('下載失敗：儲存空間不足');
    expect(session.state.statusType).toBe('error');
    expect(session.state.isImporting).toBe(false);
  });

  it('toggleSelectAll selects everything selectable, then deselects it all on a second call', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        { id: 'song-1', title: 'Song 1', alreadyDownloaded: false },
        { id: 'song-2', title: 'Song 2', alreadyDownloaded: false },
        { id: 'song-3', title: 'Song 3', alreadyDownloaded: true },
      ],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setTrackSelected('song-1', false);
    session.setTrackSelected('song-2', false);

    expect(session.allSelected.value).toBe(false);

    session.toggleSelectAll();
    expect(
      session.state.playlistTracks
        .filter((t) => !t.alreadyDownloaded)
        .every((t) => t.selected),
    ).toBe(true);
    expect(session.allSelected.value).toBe(true);

    session.toggleSelectAll();
    expect(
      session.state.playlistTracks
        .filter((t) => !t.alreadyDownloaded)
        .every((t) => !t.selected),
    ).toBe(true);
  });

  it('selectMissingTracks selects only downloadable tracks and switches to the missing filter', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        { id: 'song-1', title: 'Song 1', alreadyDownloaded: false },
        { id: 'song-2', title: 'Song 2', alreadyDownloaded: true },
      ],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setTrackSelected('song-1', false);
    session.setActiveFilter('all');

    session.selectMissingTracks();

    expect(session.state.activeFilter).toBe('missing');
    expect(
      session.state.playlistTracks.find((t) => t.id === 'song-1').selected,
    ).toBe(true);
  });

  it('does nothing when confirming a playlist import with no importable selection', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: true }],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setTrackSelected('song-1', false); // nothing selected at all

    await session.confirmImport();

    expect(downloadAudioMock).not.toHaveBeenCalled();
    expect(session.state.isImporting).toBe(false);
  });

  it('does not report success when playlist persistence yields no saved playlist', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    // Simulates createPlaylist resolving with an array that doesn't contain
    // the new playlist (e.g. a save race) — usePlaylists.create() then
    // returns null, so syncImportedPlaylist() can't proceed past that guard.
    createPlaylistMock.mockResolvedValueOnce([]);
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(session.state.status).toBe(
      '曲目已下載，但播放清單未儲存。請再試一次。',
    );
    expect(session.state.statusType).toBe('error');
  });

  it('waits for playlist persistence and reports a safe failure when it rejects', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    setPlaylistTracksMock.mockRejectedValueOnce(
      new Error('ENOSPC C:\\Users\\Singer\\Music\\playlists.json'),
    );
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(session.state.status).toBe(
      '曲目已下載，但播放清單未儲存。請再試一次。',
    );
    expect(session.state.statusType).toBe('error');
    expect(session.state.status).not.toContain('ENOSPC');
  });

  it('stops an in-progress playlist import via confirmImport itself, leaving unfinished tracks in preview', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        { id: 'song-1', title: 'Song 1', alreadyDownloaded: false },
        { id: 'song-2', title: 'Song 2', alreadyDownloaded: false },
      ],
    });
    let releaseFirstDownload;
    downloadAudioMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirstDownload = () => resolve({ title: 'ok' });
        }),
    );
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    const importPromise = session.confirmImport(); // starts importing song-1
    await flushPromises();

    expect(session.state.isImporting).toBe(true);
    // A second confirmImport() call while importing is the UI's "stop"
    // button — it cancels rather than starting a second import.
    await session.confirmImport();

    releaseFirstDownload();
    await importPromise;

    expect(session.state.status).toBe('已停止，未完成的曲目仍留在預覽中');
    expect(session.state.statusType).toBe('pending');
  });

  it('exposes the visible/selectable track lists and filter option counts', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        { id: 'song-1', title: 'Song 1', alreadyDownloaded: false },
        { id: 'song-2', title: 'Song 2', alreadyDownloaded: true },
      ],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setActiveFilter('all');

    expect(session.visiblePlaylistTracks.value).toHaveLength(2);
    expect(session.selectablePlaylistTracks.value.map((t) => t.id)).toEqual([
      'song-1',
    ]);
    expect(session.filterOptions.value.find((f) => f.key === 'all').count).toBe(
      2,
    );
  });

  it('canConfirmImport is false and confirmImportLabel is a stop label mid-playlist-import', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    let releaseDownload;
    downloadAudioMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseDownload = () => resolve({ title: 'ok' });
        }),
    );
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    const importPromise = session.confirmImport();
    await flushPromises();

    expect(session.confirmImportLabel.value).toBe('停止');

    releaseDownload();
    await importPromise;
  });

  it('canConfirmImport is false before any source has been resolved', async () => {
    const session = await loadImportSession();
    expect(session.canConfirmImport.value).toBe(false);
  });

  it('confirmImportLabel reflects single-track already-downloaded vs. downloadable states', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce(null);
    resolveImportSourceMock.mockResolvedValueOnce({
      input: 'abc12345678',
      sourceVideoId: 'abc12345678',
      source: {
        playbackVideoId: 'abc12345678',
        title: 'Song',
        alreadyDownloaded: true,
      },
      recommendedCandidate: {
        playbackVideoId: 'abc12345678',
        title: 'Song',
        alreadyDownloaded: true,
      },
      candidates: [
        {
          playbackVideoId: 'abc12345678',
          title: 'Song',
          alreadyDownloaded: true,
        },
      ],
    });
    const session = await loadImportSession();

    session.setInput('abc12345678');
    await session.resolveSource();

    expect(session.confirmImportLabel.value).toBe('已存在');
  });

  it('confirmImportLabel shows "nothing selected" once every playlist track is deselected', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setTrackSelected('song-1', false);

    expect(session.confirmImportLabel.value).toBe('沒有選取的曲目');
  });

  it('getTrackStatusLabel/Class reflect each track state', async () => {
    const session = await loadImportSession();

    expect(session.getTrackStatusLabel({ status: 'done' })).toBe('完成');
    expect(
      session.getTrackStatusLabel({
        status: 'pending',
        alreadyDownloaded: true,
      }),
    ).toBe('已存在');
    expect(session.getTrackStatusLabel({ status: 'downloading' })).toBe(
      '下載中',
    );
    expect(session.getTrackStatusLabel({ status: 'error' })).toBe('失敗');
    expect(session.getTrackStatusLabel({ status: 'pending' })).toBe('待下載');

    expect(session.getTrackStatusClass({ status: 'done' })).toBe('done');
    expect(
      session.getTrackStatusClass({
        status: 'pending',
        alreadyDownloaded: true,
      }),
    ).toBe('downloaded');
    expect(session.getTrackStatusClass({ status: 'error' })).toBe('error');
    expect(session.getTrackStatusClass({ status: null })).toBe('pending');
  });

  describe('download directory config', () => {
    it('refreshConfig loads the current download directory from the backend', async () => {
      getConfigMock.mockResolvedValueOnce({
        downloadDir: '/music/utawakui',
        isDefault: false,
      });
      const session = await loadImportSession();

      await session.refreshConfig();

      expect(session.state.downloadDir).toBe('/music/utawakui');
      expect(session.state.isDefaultDir).toBe(false);
    });

    it('chooseDownloadDir opens the picker and refreshes config afterward', async () => {
      getConfigMock.mockResolvedValue({
        downloadDir: '/chosen/path',
        isDefault: false,
      });
      const session = await loadImportSession();

      await session.chooseDownloadDir();

      expect(chooseDownloadDirMock).toHaveBeenCalledTimes(1);
      expect(session.state.downloadDir).toBe('/chosen/path');
    });

    it('resetDownloadDir resets and refreshes config afterward', async () => {
      getConfigMock.mockResolvedValue({
        downloadDir: null,
        isDefault: true,
      });
      const session = await loadImportSession();

      await session.resetDownloadDir();

      expect(resetDownloadDirMock).toHaveBeenCalledTimes(1);
      expect(session.state.isDefaultDir).toBe(true);
    });

    it('opens the configured download directory', async () => {
      const session = await loadImportSession();

      await expect(session.openDownloadDir()).resolves.toBe(true);

      expect(openDownloadDirMock).toHaveBeenCalledOnce();
    });

    it('contains download-directory bridge failures', async () => {
      const session = await loadImportSession();

      getConfigMock.mockRejectedValueOnce(new Error('read failed'));
      await expect(session.refreshConfig()).resolves.toBe(false);
      expect(session.state.status).toBe('目前無法讀取匯入設定，請再試一次。');

      chooseDownloadDirMock.mockRejectedValueOnce(new Error('choose failed'));
      await expect(session.chooseDownloadDir()).resolves.toBe(false);
      expect(session.state.status).toBe('下載資料夾未變更，請再試一次。');

      resetDownloadDirMock.mockRejectedValueOnce(new Error('reset failed'));
      await expect(session.resetDownloadDir()).resolves.toBe(false);
      expect(session.state.status).toBe('下載資料夾未重設，請再試一次。');

      openDownloadDirMock.mockRejectedValueOnce(new Error('open failed'));
      await expect(session.openDownloadDir()).resolves.toBe(false);
      expect(session.state.status).toBe('目前無法開啟下載資料夾，請再試一次。');
    });
  });
});
