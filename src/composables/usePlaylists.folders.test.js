import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const playlist = { id: 'p1', name: 'One', kind: 'playlist', trackIds: [] };
const live = { id: 'f1', name: 'Live', collapsed: false };
let bridge;

function result(folders, playlists = [playlist]) {
  return {
    playlists,
    layout: { folders, order: folders.map((folder) => folder.id) },
  };
}

beforeEach(() => {
  vi.resetModules();
  bridge = {
    listPlaylists: vi.fn(async () => [playlist]),
    listPlaylistFolders: vi.fn(async () => result([live]).layout),
    createPlaylistFolder: vi.fn(async () =>
      result([live, { id: 'f2', name: '新資料夾', collapsed: false }]),
    ),
    renamePlaylistFolder: vi.fn(async () => result([live])),
    deletePlaylistFolder: vi.fn(async () => result([])),
    setPlaylistFolderCollapsed: vi.fn(async () =>
      result([{ ...live, collapsed: true }]),
    ),
    movePlaylistItem: vi.fn(async () =>
      result([live], [{ ...playlist, folderId: 'f1' }]),
    ),
    onLibraryUpdated: () => {},
  };
  vi.stubGlobal('window', { Utawakui: bridge });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  const { usePlaylists } = await import('./usePlaylists.js');
  const playlists = usePlaylists();
  await playlists.initialize();
  return playlists;
}

describe('usePlaylists folders', () => {
  it('reads the folder layout with the playlists', async () => {
    const playlists = await load();
    expect(playlists.state.folderLayout.folders).toEqual([live]);
    expect(playlists.state.playlists).toEqual([playlist]);
  });

  it('falls back to loose playlists without a folder bridge', async () => {
    delete bridge.listPlaylistFolders;
    const playlists = await load();
    expect(playlists.state.folderLayout).toEqual({ folders: [], order: [] });
    expect(playlists.state.hasLoaded).toBe(true);
  });

  it('returns the folder that creation added', async () => {
    const playlists = await load();
    await expect(playlists.createFolder()).resolves.toEqual({
      id: 'f2',
      name: '新資料夾',
      collapsed: false,
    });
  });

  it('collapses a folder before the save finishes', async () => {
    const playlists = await load();
    const saved = playlists.setFolderCollapsed('f1', true);
    expect(playlists.state.folderLayout.folders[0].collapsed).toBe(true);
    await expect(saved).resolves.toBe(true);
    expect(bridge.setPlaylistFolderCollapsed).toHaveBeenCalledWith('f1', true);
  });

  it('applies membership returned by a move', async () => {
    const playlists = await load();
    await expect(playlists.moveItem('p1', 'f1', 'inside')).resolves.toBe(true);
    expect(bridge.movePlaylistItem).toHaveBeenCalledWith('p1', 'f1', 'inside');
    expect(playlists.state.playlists[0].folderId).toBe('f1');
    await expect(playlists.moveItem('p1', 'p1')).resolves.toBe(false);
  });

  it('reports a failed delete without dropping the folder', async () => {
    bridge.deletePlaylistFolder.mockRejectedValueOnce(new Error('disk'));
    const playlists = await load();
    await expect(playlists.deleteFolder('f1')).resolves.toBe(false);
    expect(playlists.state.folderLayout.folders).toEqual([live]);
    expect(playlists.state.actionError).toBeTruthy();
  });
});
