import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createPlaylist,
  createPlaylistAt,
  createPlaylistFolder,
  deletePlaylist,
  deletePlaylistFolder,
  expandPlaylistFolder,
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
    return [folder.name, folder.items.map(label)];
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

  it('creates numbered default folders at the end, collapsed', () => {
    createPlaylistFolder(dir);
    const { layout } = createPlaylistFolder(dir, '  ');
    expect(
      layout.folders.map(({ name, collapsed }) => [name, collapsed]),
    ).toEqual([
      ['新資料夾', true],
      ['新資料夾 2', true],
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
      { id: folderId, name: 'Encore', collapsed: true, color: 0, items: [] },
    ]);
  });

  it('rotates folder colours and keeps each one through later changes', () => {
    for (const name of ['A', 'B', 'C', 'D']) createPlaylistFolder(dir, name);
    const colors = () =>
      loadPlaylistLayout(dir).folders.map((folder) => folder.color);
    expect(colors()).toEqual([0, 1, 2, 0]);
    // Deleting one shifts nobody; the next folder follows the newest.
    deletePlaylistFolder(dir, loadPlaylistLayout(dir).folders[1].id);
    createPlaylistFolder(dir, 'E');
    expect(colors()).toEqual([0, 2, 0, 1]);

    // Folders saved before colours existed take them in order.
    const document = readFile(dir);
    for (const folder of document.layout.folders) delete folder.color;
    fs.writeFileSync(
      path.join(dir, PLAYLISTS_FILENAME),
      JSON.stringify(document),
    );
    expect(colors()).toEqual([0, 1, 2, 0]);
  });

  it('keeps at most one folder open and can close them all', () => {
    const live = createPlaylistFolder(dir, 'Live').layout.folders[0].id;
    const solo = createPlaylistFolder(dir, 'Solo').layout.folders[1].id;
    setPlaylistFolderCollapsed(dir, live, false);
    setPlaylistFolderCollapsed(dir, solo, false);
    const open = (layout) =>
      layout.folders.filter((folder) => !folder.collapsed).map((f) => f.name);
    expect(open(expandPlaylistFolder(dir, solo).layout)).toEqual(['Solo']);
    expect(open(expandPlaylistFolder(dir, live).layout)).toEqual(['Live']);
    expect(open(expandPlaylistFolder(dir, null).layout)).toEqual([]);
    const before = readFile(dir);
    expandPlaylistFolder(dir, 'missing');
    expandPlaylistFolder(dir, null);
    expect(readFile(dir)).toEqual(before);
  });

  it('deletes a folder together with its playlists', () => {
    const folderId = createPlaylistFolder(dir, 'Live').layout.folders[0].id;
    movePlaylistItem(dir, folderId, second.id, 'before');
    movePlaylistItem(dir, third.id, folderId, 'inside');
    movePlaylistItem(dir, first.id, folderId, 'inside');
    expect(names(dir)).toEqual([['Live', ['Third', 'First']], 'Second']);

    const { playlists, layout, deletedIds } = deletePlaylistFolder(
      dir,
      folderId,
    );
    expect(deletedIds).toEqual([third.id, first.id]);
    expect(playlists.map((entry) => entry.name)).toEqual(['Second']);
    expect(names(dir)).toEqual(['Second']);
    expect(layout.folders).toEqual([]);
    expect(readFile(dir).layout).toBeUndefined();
    expect(deletePlaylistFolder(dir, folderId).deletedIds).toEqual([]);
  });

  it('drops stale ids from the saved order', () => {
    const folderId = createPlaylistFolder(dir, 'Live').layout.folders[0].id;
    movePlaylistItem(dir, second.id, folderId, 'inside');
    deletePlaylist(dir, first.id);
    expect(names(dir)).toEqual(['Third', ['Live', ['Second']]]);
  });

  describe('albums', () => {
    let album;
    let folderId;

    beforeEach(() => {
      upsertAlbum(dir, {
        name: 'Album',
        source: { platform: 'youtube', id: 'OLAK5uy_album' },
        trackIds: [],
      });
      album = loadPlaylists(dir).find((entry) => entry.kind === 'album');
      folderId = createPlaylistFolder(dir, 'Live').layout.folders[0].id;
    });

    it('never places an album in a folder or at the top level', () => {
      const before = readFile(dir);
      movePlaylistItem(dir, album.id, folderId, 'inside');
      movePlaylistItem(dir, album.id, first.id, 'before');
      expect(readFile(dir)).toEqual(before);
      expect(loadPlaylistLayout(dir).order).not.toContain(album.id);
    });

    it('copies an album into a folder as a new playlist', () => {
      movePlaylistItem(dir, second.id, folderId, 'inside');
      const { createdId, layout } = createPlaylistAt(dir, {
        name: 'Album',
        trackIds: ['t1', 't2', 't1', ''],
        target: second.id,
        position: 'before',
      });
      const copy = loadPlaylists(dir).find((entry) => entry.id === createdId);
      expect(copy).toMatchObject({
        name: 'Album',
        kind: 'playlist',
        trackIds: ['t1', 't2'],
      });
      expect(Object.keys(copy.addedAt)).toEqual(['t1', 't2']);
      expect(layout.folders[0].items).toEqual([createdId, second.id]);
      // The album itself stays where it was, and copies can repeat.
      createPlaylistAt(dir, { name: 'Album', target: folderId });
      expect(names(dir)).toEqual([
        'First',
        'Third',
        ['Live', ['Album', 'Second', 'Album']],
      ]);
      expect(
        loadPlaylists(dir).filter((entry) => entry.kind === 'album'),
      ).toHaveLength(1);
    });

    it('leaves a new playlist loose when its target is gone', () => {
      const { createdId } = createPlaylistAt(dir, { target: 'missing' });
      expect(names(dir)).toEqual([
        'First',
        'Second',
        'Third',
        ['Live', []],
        loadPlaylists(dir).find((entry) => entry.id === createdId).name,
      ]);
    });

    it('drops album ids left in a member list and playlists turned albums', () => {
      const document = readFile(dir);
      document.layout.folders[0].items = [album.id, second.id];
      fs.writeFileSync(
        path.join(dir, PLAYLISTS_FILENAME),
        JSON.stringify(document),
      );
      expect(names(dir)).toEqual(['First', 'Third', ['Live', ['Second']]]);
      setPlaylistKind(dir, second.id, 'album');
      expect(names(dir)).toEqual(['First', 'Third', ['Live', []]]);
    });
  });

  it('reads the first format, where playlists named their folder', () => {
    const document = readFile(dir);
    document.layout = {
      folders: [{ id: 'legacy', name: 'Old', collapsed: false }],
      order: ['legacy'],
    };
    document.playlists.find((entry) => entry.id === second.id).folderId =
      'legacy';
    fs.writeFileSync(
      path.join(dir, PLAYLISTS_FILENAME),
      JSON.stringify(document),
    );
    expect(names(dir)).toEqual([['Old', ['Second']], 'First', 'Third']);
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
