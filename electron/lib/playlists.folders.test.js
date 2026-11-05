import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createPlaylist,
  createPlaylistFolder,
  deletePlaylist,
  deletePlaylistFolder,
  loadPlaylistLayout,
  loadPlaylists,
  movePlaylistItem,
  renamePlaylistFolder,
  reorderPlaylists,
  setPlaylistFolderCollapsed,
  setPlaylistKind,
  upsertAlbum,
  PLAYLISTS_FILENAME,
} from './playlists.js';

function readFile(dir) {
  return JSON.parse(
    fs.readFileSync(path.join(dir, PLAYLISTS_FILENAME), 'utf8'),
  );
}

function names(dir) {
  const playlists = loadPlaylists(dir);
  const { folders, order } = loadPlaylistLayout(dir);
  const label = (id) =>
    playlists.find((playlist) => playlist.id === id)?.name ??
    folders.find((folder) => folder.id === id)?.name;
  return order.map((id) => {
    const folder = folders.find((entry) => entry.id === id);
    if (!folder) return label(id);
    const members = playlists
      .filter((playlist) => playlist.folderId === id)
      .map((playlist) => playlist.name);
    return [folder.name, members];
  });
}

describe('playlist folders', () => {
  let dir;
  let first;
  let second;
  let third;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-folders-test-'));
    createPlaylist(dir, 'First');
    createPlaylist(dir, 'Second');
    [first, second, third] = createPlaylist(dir, 'Third');
  });

  it('reads a file without folders as loose playlists in saved order', () => {
    expect(loadPlaylistLayout(dir)).toEqual({
      folders: [],
      order: [first.id, second.id, third.id],
    });
    expect(readFile(dir).layout).toBeUndefined();
  });

  it('creates numbered default folders at the end, expanded', () => {
    createPlaylistFolder(dir);
    const { layout } = createPlaylistFolder(dir, '  ');
    expect(
      layout.folders.map(({ name, collapsed }) => [name, collapsed]),
    ).toEqual([
      ['新資料夾', false],
      ['新資料夾 2', false],
    ]);
    expect(names(dir)).toEqual([
      'First',
      'Second',
      'Third',
      ['新資料夾', []],
      ['新資料夾 2', []],
    ]);
  });

  it('moves playlists into, within and out of a folder', () => {
    const folderId = createPlaylistFolder(dir, 'Live').layout.folders[0].id;
    movePlaylistItem(dir, first.id, folderId, 'inside');
    movePlaylistItem(dir, third.id, folderId, 'inside');
    expect(names(dir)).toEqual(['Second', ['Live', ['First', 'Third']]]);

    movePlaylistItem(dir, third.id, first.id, 'before');
    expect(names(dir)).toEqual(['Second', ['Live', ['Third', 'First']]]);

    // Dropping beside a member joins the folder.
    movePlaylistItem(dir, second.id, first.id, 'after');
    expect(names(dir)).toEqual([['Live', ['Third', 'First', 'Second']]]);

    // "Move out" lands right after the folder.
    const { playlists } = movePlaylistItem(dir, third.id, folderId, 'after');
    expect(names(dir)).toEqual([['Live', ['First', 'Second']], 'Third']);
    expect(playlists.find((entry) => entry.id === third.id).folderId).toBe(
      undefined,
    );
    // Array order follows the sidebar so older readers see the same order.
    expect(readFile(dir).playlists.map((entry) => entry.name)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });

  it('keeps folders at the top level when they are dragged', () => {
    const live = createPlaylistFolder(dir, 'Live').layout.folders[0].id;
    const solo = createPlaylistFolder(dir, 'Solo').layout.folders[1].id;
    movePlaylistItem(dir, first.id, live, 'inside');
    movePlaylistItem(dir, solo, first.id, 'before');
    expect(names(dir)).toEqual([
      'Second',
      'Third',
      ['Solo', []],
      ['Live', ['First']],
    ]);

    const before = readFile(dir);
    expect(movePlaylistItem(dir, solo, live, 'inside').layout.order).toEqual(
      loadPlaylistLayout(dir).order,
    );
    movePlaylistItem(dir, first.id, second.id, 'inside');
    expect(
      movePlaylistItem(dir, live, first.id, 'before').layout.order,
    ).toEqual(loadPlaylistLayout(dir).order);
    expect(readFile(dir)).toEqual(before);
  });

  it('keeps the existing reorder contract for loose playlists', () => {
    const result = reorderPlaylists(dir, third.id, first.id, 'before');
    expect(result.map((entry) => entry.name)).toEqual([
      'Third',
      'First',
      'Second',
    ]);
    expect(names(dir)).toEqual(['Third', 'First', 'Second']);
  });

  it('renames and collapses a folder; a blank name keeps the old one', () => {
    const folderId = createPlaylistFolder(dir, 'Live').layout.folders[0].id;
    renamePlaylistFolder(dir, folderId, '  Encore ');
    renamePlaylistFolder(dir, folderId, '   ');
    const { layout } = setPlaylistFolderCollapsed(dir, folderId, true);
    expect(layout.folders).toEqual([
      { id: folderId, name: 'Encore', collapsed: true },
    ]);
  });

  it('deleting a folder keeps its playlists in its place', () => {
    const folderId = createPlaylistFolder(dir, 'Live').layout.folders[0].id;
    movePlaylistItem(dir, folderId, second.id, 'before');
    movePlaylistItem(dir, third.id, folderId, 'inside');
    movePlaylistItem(dir, first.id, folderId, 'inside');
    expect(names(dir)).toEqual([['Live', ['Third', 'First']], 'Second']);

    const { playlists, layout } = deletePlaylistFolder(dir, folderId);
    expect(names(dir)).toEqual(['Third', 'First', 'Second']);
    expect(playlists).toHaveLength(3);
    expect(playlists.every((entry) => entry.folderId === undefined)).toBe(true);
    expect(layout.folders).toEqual([]);
    expect(readFile(dir).layout).toBeUndefined();
  });

  it('drops stale ids and leaves albums out of folders', () => {
    const folderId = createPlaylistFolder(dir, 'Live').layout.folders[0].id;
    movePlaylistItem(dir, second.id, folderId, 'inside');
    deletePlaylist(dir, first.id);
    upsertAlbum(dir, {
      name: 'Album',
      source: { platform: 'youtube', id: 'OLAK5uy_album' },
      trackIds: [],
    });
    const album = loadPlaylists(dir).find((entry) => entry.kind === 'album');
    expect(movePlaylistItem(dir, album.id, folderId, 'inside').layout).toEqual(
      loadPlaylistLayout(dir),
    );
    expect(names(dir)).toEqual(['Third', ['Live', ['Second']]]);

    // A playlist turned into an album leaves the folder view.
    setPlaylistKind(dir, second.id, 'album');
    expect(names(dir)).toEqual(['Third', ['Live', []]]);
  });

  it('keeps folder data when other writers save the file', () => {
    const folderId = createPlaylistFolder(dir, 'Live').layout.folders[0].id;
    movePlaylistItem(dir, first.id, folderId, 'inside');
    createPlaylist(dir, 'Fourth');
    expect(names(dir)).toEqual([
      'Second',
      'Third',
      ['Live', ['First']],
      'Fourth',
    ]);
  });
});
