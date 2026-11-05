import { describe, expect, it } from 'vitest';
import {
  buildPlaylistTree,
  filterPlaylistTree,
  playlistDropPosition,
  playlistTreeRows,
} from './playlistFolders.js';

const a = { id: 'a', name: 'Alpha', kind: 'playlist' };
const b = { id: 'b', name: 'Beta', kind: 'playlist' };
const c = { id: 'c', name: 'Gamma', kind: 'playlist' };
const d = { id: 'd', name: 'Delta', kind: 'playlist' };
const live = { id: 'f1', name: 'Live', collapsed: false, items: ['b', 'c'] };
const empty = { id: 'f2', name: 'Empty', collapsed: true, items: [] };

function shape(nodes) {
  return nodes.map((node) =>
    node.kind === 'folder'
      ? [node.folder.id, node.children.map((child) => child.id)]
      : node.playlist.id,
  );
}

describe('playlist folder tree', () => {
  it('places folders by layout order and appends anything unplaced', () => {
    const tree = buildPlaylistTree([a, b, c, d], {
      folders: [live, empty],
      order: ['f1', 'a', 'missing'],
    });
    expect(shape(tree)).toEqual([['f1', ['b', 'c']], 'a', 'd', ['f2', []]]);
  });

  it('treats every playlist as loose without a layout', () => {
    expect(shape(buildPlaylistTree([a, b], undefined))).toEqual(['a', 'b']);
  });

  it('keeps folders with matching members or a matching name', () => {
    const tree = buildPlaylistTree([a, b, c], {
      folders: [live, empty],
      order: ['a', 'f1', 'f2'],
    });
    const byName = (query) => (item) => item.name.includes(query);
    expect(
      shape(filterPlaylistTree(tree, byName('Gam'), byName('Gam'))),
    ).toEqual([['f1', ['c']]]);
    expect(
      shape(filterPlaylistTree(tree, byName('Emp'), byName('Emp'))),
    ).toEqual([['f2', []]]);
  });

  it('flattens rows with members only while expanded', () => {
    const tree = buildPlaylistTree([a, b], {
      folders: [{ ...live, items: ['b'] }, empty],
      order: ['f1', 'f2', 'a'],
    });
    const rows = playlistTreeRows(tree, (folder) => !folder.collapsed);
    expect(rows.map((row) => `${row.kind}:${row.id}`)).toEqual([
      'folder:f1',
      'playlist:b',
      'folder:f2',
      'playlist:a',
    ]);
    expect(rows[1].folderId).toBe('f1');
    expect(rows.map((row) => row.key)).toEqual([
      'folder:f1',
      'f1:b',
      'folder:f2',
      'top:a',
    ]);
    // An empty folder shows no placeholder row, even when open.
    const open = playlistTreeRows(tree, () => true);
    expect(open.map((row) => row.key)).toEqual([
      'folder:f1',
      'f1:b',
      'folder:f2',
      'top:a',
    ]);
  });

  it('never lists library albums in the index', () => {
    const album = { id: 'al', name: 'Album', kind: 'album' };
    const tree = buildPlaylistTree([a, album], {
      folders: [{ ...live, items: [] }],
      order: ['a', 'f1', 'al'],
    });
    expect(shape(tree)).toEqual(['a', ['f1', []]]);
  });

  it('chooses drop positions without nesting folders', () => {
    const folder = { kind: 'folder', expanded: false };
    const opened = { kind: 'folder', expanded: true };
    const playlistRow = { kind: 'playlist' };
    const member = { kind: 'playlist', folderId: 'f1', playlist: playlistRow };
    const loose = { kind: 'playlist', folderId: null, playlist: playlistRow };
    const playlist = { draggingFolder: false };
    const dragFolder = { draggingFolder: true };
    const dragAlbum = { draggingAlbum: true };
    expect(playlistDropPosition(folder, 0.1, playlist)).toBe('before');
    expect(playlistDropPosition(folder, 0.5, playlist)).toBe('inside');
    expect(playlistDropPosition(folder, 0.9, playlist)).toBe('after');
    expect(playlistDropPosition(opened, 0.9, playlist)).toBe('inside');
    expect(playlistDropPosition(folder, 0.5, dragFolder)).toBe('after');
    expect(playlistDropPosition(folder, 0.1, dragAlbum)).toBe('inside');
    expect(playlistDropPosition(member, 0.2, playlist)).toBe('before');
    expect(playlistDropPosition(member, 0.5, playlist)).toBe('add');
    expect(playlistDropPosition(loose, 0.9, playlist)).toBe('after');
    expect(playlistDropPosition(member, 0.2, dragFolder)).toBe(null);
    expect(playlistDropPosition(loose, 0.8, dragFolder)).toBe('after');
    expect(playlistDropPosition(loose, 0.1, dragAlbum)).toBe(null);
    expect(playlistDropPosition(loose, 0.5, dragAlbum)).toBe('add');
    expect(playlistDropPosition(member, 0.1, dragAlbum)).toBe('before');
  });
});
