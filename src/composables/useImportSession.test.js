import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let fetchYoutubePlaylistMock;
let resolveImportSourceMock;
let fetchVideoMetadataMock;
let downloadAudioMock;
let getConfigMock;
let chooseDownloadDirMock;
let resetDownloadDirMock;
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
  chooseDownloadDirMock = vi.fn();
  resetDownloadDirMock = vi.fn();
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
      chooseDownloadDir: chooseDownloadDirMock,
      resetDownloadDir: resetDownloadDirMock,
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

describe('useImportSession', () => {
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
        error: null,
      },
    ]);
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
      error: null,
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
    });
    expect(session.state.status).toBe('已加入專輯「My Album」');
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
      error: null,
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
});
