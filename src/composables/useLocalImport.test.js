import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let importLocalAudioFilesMock;
let listTracksMock;
let listPlaylistsMock;
let refreshLibraryMetadataMock;

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  importLocalAudioFilesMock = vi.fn().mockResolvedValue({
    imported: [],
    skipped: [],
  });
  listTracksMock = vi.fn().mockResolvedValue([]);
  listPlaylistsMock = vi.fn().mockResolvedValue([]);
  refreshLibraryMetadataMock = vi.fn().mockResolvedValue({ updated: 0 });
  vi.stubGlobal('window', {
    Utawakui: {
      importLocalAudioFiles: importLocalAudioFilesMock,
      listTracks: listTracksMock,
      listPlaylists: listPlaylistsMock,
      refreshLibraryMetadata: refreshLibraryMetadataMock,
      onLibraryUpdated: () => () => {},
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadLocalImport() {
  const { useLocalImport } = await import('./useLocalImport.js');
  await flushMicrotasks();
  return useLocalImport();
}

describe('useLocalImport', () => {
  it('imports local audio files through the bridge and refreshes the library', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [
        { id: 'song-a', title: 'Song A' },
        { id: 'song-b', title: 'Song B' },
      ],
      skipped: [{ path: 'notes.txt', reason: 'unsupported-extension' }],
    });
    const localImport = await loadLocalImport();

    await localImport.importFiles();

    expect(importLocalAudioFilesMock).toHaveBeenCalledTimes(1);
    expect(listTracksMock).toHaveBeenCalledTimes(2);
    expect(localImport.state.statusType).toBe('success');
    expect(localImport.state.imported).toEqual([
      { id: 'song-a', title: 'Song A' },
      { id: 'song-b', title: 'Song B' },
    ]);
    expect(localImport.state.skipped).toEqual([
      { path: 'notes.txt', reason: 'unsupported-extension' },
    ]);
    expect(localImport.state.message).toBe('已複製 2 首，略過 1 個檔案');
  });

  it('uses a concise duplicate message for content-hash skips', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [{ id: 'song-a', title: 'Song A' }],
      skipped: [
        {
          path: 'Song A Copy.mp3',
          reason: 'duplicate-content',
          existingTrackId: 'song-a',
        },
      ],
    });
    const localImport = await loadLocalImport();

    await localImport.importFiles();

    expect(localImport.state.statusType).toBe('success');
    expect(localImport.state.message).toBe('已複製 1 首，略過 1 個重複檔案');
  });

  it('reports duplicate-only imports without treating them as hard failures', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [],
      skipped: [
        {
          path: 'Song A Copy.mp3',
          reason: 'duplicate-content',
          existingTrackId: 'song-a',
        },
      ],
    });
    const localImport = await loadLocalImport();

    await localImport.importFiles();

    expect(localImport.state.statusType).toBe('idle');
    expect(localImport.state.message).toBe('沒有新增曲目，略過 1 個重複檔案');
  });

  it('reports cancel/empty selection as a neutral status', async () => {
    importLocalAudioFilesMock.mockResolvedValueOnce({
      imported: [],
      skipped: [],
    });
    const localImport = await loadLocalImport();

    await localImport.importFiles();

    expect(localImport.state.statusType).toBe('idle');
    expect(localImport.state.message).toBe('沒有選取音訊檔');
  });

  it('surfaces bridge errors without throwing', async () => {
    importLocalAudioFilesMock.mockRejectedValueOnce(new Error('disk full'));
    const localImport = await loadLocalImport();

    await localImport.importFiles();

    expect(localImport.state.statusType).toBe('error');
    expect(localImport.state.message).toBe('本機匯入失敗：disk full');
    expect(localImport.state.isImporting).toBe(false);
  });

  it('shows a restart hint when the preload bridge is stale', async () => {
    delete window.Utawakui.importLocalAudioFiles;
    const localImport = await loadLocalImport();

    await localImport.importFiles();

    expect(localImport.state.statusType).toBe('error');
    expect(localImport.state.message).toBe(
      '需要重新啟動應用程式才能使用本機音訊匯入。',
    );
    expect(importLocalAudioFilesMock).not.toHaveBeenCalled();
  });
});
