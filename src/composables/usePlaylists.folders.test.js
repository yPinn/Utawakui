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
    createPlaylistAt: vi.fn(async () => ({
      ...result(
        [{ ...live, items: ['copy'] }],
        [
          playlist,
          { id: 'copy', name: 'Album', kind: 'playlist', trackIds: ['t1'] },
        ],
      ),
      createdId: 'copy',
    })),
    expandPlaylistFolder: vi.fn(async () =>
      result([
        { ...live, collapsed: true },
        { id: 'f2', name: 'Solo', collapsed: false },
      ]),
    ),
    setPlaylistFolderCollapsed: vi.fn(async () =>
      result([{ ...live, collapsed: true }]),
    ),
    movePlaylistItem: vi.fn(async () => result([{ ...live, items: ['p1'] }])),
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

  it('opens one folder and closes the rest before the save finishes', async () => {
    bridge.listPlaylistFolders.mockResolvedValueOnce({
      folders: [live, { id: 'f2', name: 'Solo', collapsed: true }],
      order: ['f1', 'f2'],
    });
    const playlists = await load();
    const saved = playlists.expandFolder('f2');
    expect(
      playlists.state.folderLayout.folders.map((folder) => folder.collapsed),
    ).toEqual([true, false]);
    await expect(saved).resolves.toBe(true);
    expect(bridge.expandPlaylistFolder).toHaveBeenCalledWith('f2');
    await expect(playlists.expandFolder('missing')).resolves.toBe(false);
  });

  it('returns the playlist created beside a row', async () => {
    const playlists = await load();
    const request = {
      name: 'Album',
      trackIds: ['t1'],
      target: { id: 'f1' },
      position: 'inside',
    };
    const created = await playlists.createPlaylistAt(request);
    expect(bridge.createPlaylistAt).toHaveBeenCalledWith(request);
    expect(created).toMatchObject({ id: 'copy', name: 'Album' });
    expect(playlists.state.folderLayout.folders[0].items).toEqual(['copy']);
  });

  it('applies membership returned by a move', async () => {
    const playlists = await load();
    const dragged = { id: 'p1', folderId: null };
    await expect(
      playlists.moveItem(dragged, { id: 'f1' }, 'inside'),
    ).resolves.toBe(true);
    expect(bridge.movePlaylistItem).toHaveBeenCalledWith(
      dragged,
      { id: 'f1' },
      'inside',
    );
    expect(playlists.state.folderLayout.folders[0].items).toEqual(['p1']);
    await expect(playlists.moveItem(null, { id: 'f1' })).resolves.toBe(false);
  });

  it('reports a failed delete without dropping the folder', async () => {
    bridge.deletePlaylistFolder.mockRejectedValueOnce(new Error('disk'));
    const playlists = await load();
    await expect(playlists.deleteFolder('f1')).resolves.toBe(false);
    expect(playlists.state.folderLayout.folders).toEqual([live]);
    expect(playlists.state.actionError).toBeTruthy();
  });
});
