import { describe, expect, it } from 'vitest';
import {
  buildPlaylistTree,
  filterPlaylistTree,
  playlistDropPosition,
  playlistTreeRows,
} from './playlistFolders.js';

const a = { id: 'a', name: 'Alpha' };
const b = { id: 'b', name: 'Beta', folderId: 'f1' };
const c = { id: 'c', name: 'Gamma', folderId: 'f1' };
const d = { id: 'd', name: 'Delta', folderId: 'gone' };
const live = { id: 'f1', name: 'Live', collapsed: false };
const empty = { id: 'f2', name: 'Empty', collapsed: true };

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
    // A member of a missing folder stays visible as a loose playlist.
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
      folders: [live, empty],
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
    const open = playlistTreeRows(tree, () => true);
    expect(open.map((row) => `${row.kind}:${row.id}`)).toContain('empty:f2');
  });

  it('chooses drop positions without nesting folders', () => {
    const folder = { kind: 'folder', expanded: false };
    const opened = { kind: 'folder', expanded: true };
    const member = { kind: 'playlist', folderId: 'f1' };
    const loose = { kind: 'playlist', folderId: null };
    const playlist = { draggingFolder: false };
    const dragFolder = { draggingFolder: true };
    expect(playlistDropPosition(folder, 0.1, playlist)).toBe('before');
    expect(playlistDropPosition(folder, 0.5, playlist)).toBe('inside');
    expect(playlistDropPosition(folder, 0.9, playlist)).toBe('after');
    expect(playlistDropPosition(opened, 0.9, playlist)).toBe('inside');
    expect(playlistDropPosition(folder, 0.5, dragFolder)).toBe('after');
    expect(playlistDropPosition(member, 0.2, playlist)).toBe('before');
    expect(playlistDropPosition(member, 0.2, dragFolder)).toBe(null);
    expect(playlistDropPosition(loose, 0.8, dragFolder)).toBe('after');
    expect(playlistDropPosition({ kind: 'empty' }, 0.5, playlist)).toBe(
      'inside',
    );
    expect(playlistDropPosition({ kind: 'empty' }, 0.5, dragFolder)).toBe(null);
  });
});
