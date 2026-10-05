import { describe, expect, it } from 'vitest';
import {
  addToPlaylistMenuItem,
  collectionManageMenuItems,
} from './collectionMenuItems.js';

const playlists = [
  { id: 'source', kind: 'playlist', name: 'Source', trackIds: ['t1'] },
  { id: 'target', kind: 'playlist', name: 'Target', trackIds: [] },
  { id: 'album', kind: 'album', name: 'Album', trackIds: ['t1'] },
];

describe('collection menu items', () => {
  it('builds the add-to-playlist submenu with a create entry and targets', () => {
    const item = addToPlaylistMenuItem(playlists, playlists[0], '新增');
    expect(item).toMatchObject({ key: 'add-to-playlist', label: '新增' });
    expect(item.children.map((child) => child.key)).toEqual([
      'create-playlist',
      'targets-divider',
      'target',
    ]);
    expect(item.children[0].icon).toBeDefined();
  });

  it('labels album removal differently from playlist deletion', () => {
    const playlistItems = collectionManageMenuItems(playlists[0]);
    const albumItems = collectionManageMenuItems(playlists[2]);
    expect(playlistItems.map((item) => item.key)).toEqual([
      'edit-details',
      'convert-kind',
      'delete',
    ]);
    expect(playlistItems.at(-1)).toMatchObject({ label: '刪除', danger: true });
    expect(albumItems.at(-1).label).toBe('移除');
    expect(albumItems[1].label).toBe('轉為播放清單');
    expect(albumItems[1].value).toEqual({
      action: 'convert-kind',
      playlistId: 'album',
    });
  });
});
