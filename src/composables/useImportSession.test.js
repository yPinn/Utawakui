import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let listPlaylistMock;
let fetchVideoMetadataMock;
let downloadAudioMock;
let getConfigMock;
let chooseDownloadDirMock;
let resetDownloadDirMock;

beforeEach(() => {
  vi.resetModules();
  listPlaylistMock = vi.fn();
  fetchVideoMetadataMock = vi.fn();
  downloadAudioMock = vi.fn();
  getConfigMock = vi.fn().mockResolvedValue({
    downloadDir: 'C:\\Music\\Utawakui',
    isDefault: true,
  });
  chooseDownloadDirMock = vi.fn();
  resetDownloadDirMock = vi.fn();
  vi.stubGlobal('window', {
    Utawakui: {
      listPlaylist: listPlaylistMock,
      fetchVideoMetadata: fetchVideoMetadataMock,
      downloadAudio: downloadAudioMock,
      getConfig: getConfigMock,
      chooseDownloadDir: chooseDownloadDirMock,
      resetDownloadDir: resetDownloadDirMock,
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
    listPlaylistMock.mockResolvedValueOnce([
      {
        id: 'video-1',
        title: 'Song 1',
        artist: 'Singer',
        duration: 180,
        alreadyDownloaded: false,
      },
    ]);
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
    fetchVideoMetadataMock.mockResolvedValueOnce({
      id: 'abc12345678',
      title: 'Single Song',
      artist: 'Singer',
      duration: 180,
      thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
      alreadyDownloaded: false,
    });
    downloadAudioMock.mockResolvedValueOnce({ title: 'Single Song' });
    const session = await loadImportSession();

    session.state.input = 'https://youtube.com/watch?v=abc12345678';
    await session.resolveSource();

    expect(downloadAudioMock).not.toHaveBeenCalled();
    expect(fetchVideoMetadataMock).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc12345678',
    );
    expect(session.state.sourceKind).toBe('single');
    expect(session.state.singleTrack).toEqual({
      id: 'abc12345678',
      title: 'Single Song',
      artist: 'Singer',
      duration: 180,
      thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
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
    expect(session.state.status).toBe('已匯入：Single Song');
    expect(session.state.sourceKind).toBe('idle');
  });

  it('downloads only selected playlist tracks after confirmation', async () => {
    listPlaylistMock.mockResolvedValueOnce([
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
    ]);
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

  it('keeps single import usable when the metadata preload API is stale', async () => {
    listPlaylistMock.mockResolvedValueOnce(null);
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
    listPlaylistMock.mockResolvedValueOnce([
      { id: 'video-1', title: 'Song 1', alreadyDownloaded: false },
    ]);
    const session = await loadImportSession();

    session.state.input = 'playlist-id';
    await session.resolveSource();
    session.clearPreview();

    expect(session.state.input).toBe('playlist-id');
    expect(session.state.sourceKind).toBe('idle');
    expect(session.state.singleTrack).toBe(null);
    expect(session.state.playlistTracks).toBe(null);
    expect(session.state.activeFilter).toBe('all');
  });
});
