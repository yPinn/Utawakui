import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let listPlaylistMock;
let resolveImportSourceMock;
let fetchVideoMetadataMock;
let downloadAudioMock;
let getConfigMock;
let chooseDownloadDirMock;
let resetDownloadDirMock;
let getPlaylistsMock;
let createPlaylistMock;
let setPlaylistTracksMock;

// usePlaylists.js is a module-scope singleton that useImportSession.js now
// imports transitively — it eagerly calls getPlaylists()/onLibraryUpdated()
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
  listPlaylistMock = vi.fn();
  resolveImportSourceMock = vi.fn();
  fetchVideoMetadataMock = vi.fn();
  downloadAudioMock = vi.fn();
  getConfigMock = vi.fn().mockResolvedValue({
    downloadDir: 'C:\\Music\\Utawakui',
    isDefault: true,
  });
  chooseDownloadDirMock = vi.fn();
  resetDownloadDirMock = vi.fn();
  getPlaylistsMock = vi.fn().mockResolvedValue([]);
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
  vi.stubGlobal('window', {
    Utawakui: {
      listPlaylist: listPlaylistMock,
      resolveImportSource: resolveImportSourceMock,
      fetchVideoMetadata: fetchVideoMetadataMock,
      downloadAudio: downloadAudioMock,
      getConfig: getConfigMock,
      chooseDownloadDir: chooseDownloadDirMock,
      resetDownloadDir: resetDownloadDirMock,
      getPlaylists: getPlaylistsMock,
      createPlaylist: createPlaylistMock,
      setPlaylistTracks: setPlaylistTracksMock,
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
    listPlaylistMock.mockResolvedValueOnce({
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

    first.state.input = 'https://youtube.com/playlist?list=abc';
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
    listPlaylistMock.mockResolvedValueOnce(null);
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

    session.state.input = 'https://youtube.com/watch?v=abc12345678';
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
    listPlaylistMock.mockResolvedValueOnce(null);
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

    session.state.input = 'https://youtube.com/watch?v=mv123456789';
    await session.resolveSource();
    session.selectImportCandidate('mv123456789');
    await session.confirmImport();

    expect(session.state.selectedCandidateId).toBe('mv123456789');
    expect(downloadAudioMock).toHaveBeenCalledWith('mv123456789');
  });

  it('downloads only selected playlist tracks after confirmation', async () => {
    listPlaylistMock.mockResolvedValueOnce({
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

    session.state.input = 'playlist-id';
    await session.resolveSource();
    session.state.playlistTracks[1].selected = false;
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
    listPlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.state.input = 'playlist-id';
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
    listPlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        { id: 'song-1', title: 'Song 1', alreadyDownloaded: false },
        { id: 'song-2', title: 'Song 2', alreadyDownloaded: true },
      ],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.state.input = 'playlist-id';
    await session.resolveSource();
    session.state.playlistTracks[1].selected = true;
    await session.confirmImport();

    expect(setPlaylistTracksMock).toHaveBeenCalledWith(
      nextPlaylistId('My Setlist'),
      ['song-1', 'song-2'],
    );
  });

  it('re-syncs the same local playlist on retry instead of creating a duplicate', async () => {
    listPlaylistMock.mockResolvedValueOnce({
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

    session.state.input = 'playlist-id';
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
    listPlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockRejectedValue(new Error('network error'));
    const session = await loadImportSession();

    session.state.input = 'playlist-id';
    await session.resolveSource();
    await session.confirmImport();

    expect(createPlaylistMock).not.toHaveBeenCalled();
  });

  it('falls back to metadata preview when the resolver preload API is stale', async () => {
    listPlaylistMock.mockResolvedValueOnce(null);
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

    session.state.input = 'https://youtube.com/watch?v=abc12345678';
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
    listPlaylistMock.mockResolvedValueOnce(null);
    delete window.Utawakui.resolveImportSource;
    delete window.Utawakui.fetchVideoMetadata;
    downloadAudioMock.mockResolvedValueOnce({ title: 'Fallback Song' });
    const session = await loadImportSession();

    session.state.input = 'https://youtube.com/watch?v=abc12345678';
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
    listPlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'video-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    const session = await loadImportSession();

    session.state.input = 'playlist-id';
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
