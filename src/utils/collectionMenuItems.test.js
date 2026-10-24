import { describe, expect, it } from 'vitest';
import {
  addToPlaylistContent,
  addToPerformanceQueueMenuItem,
  addToPlaylistMenuItem,
  collectionManageMenuItems,
} from './collectionMenuItems.js';

const playlists = [
  { id: 'source', kind: 'playlist', name: 'Source', trackIds: ['t1'] },
  { id: 'target', kind: 'playlist', name: 'Target', trackIds: [] },
  { id: 'album', kind: 'album', name: 'Album', trackIds: ['t1'] },
];

describe('collection menu items', () => {
  it('shares the explicit performance destination between sidebar and the main collection menu', () => {
    expect(addToPerformanceQueueMenuItem(playlists[0])).toMatchObject({
      label: '加入演出待唱',
      disabled: false,
      value: { action: 'add-to-performance-queue', playlistId: 'source' },
    });
    expect(
      addToPerformanceQueueMenuItem(playlists[0], { disabled: true }).disabled,
    ).toBe(true);
  });
  it('builds the add-to-playlist submenu with a create entry and targets', () => {
    const item = addToPlaylistMenuItem(playlists, playlists[0], '新增');
    expect(item).toMatchObject({
      id: 'add-to-playlist',
      kind: 'submenu',
      label: '新增',
      size: 'lg',
      content: { kind: 'filterable-actions' },
    });
    expect(item.content.pinnedItems[0]).toMatchObject({
      id: 'create-playlist',
      kind: 'action',
    });
    expect(item.content.groups[0].items.map(({ id }) => id)).toEqual([
      'playlist:target',
    ]);
    expect(item.content.pinnedItems[0].icon).toBeDefined();
  });

  it('builds the same filterable destination recipe for a direct opener', () => {
    expect(addToPlaylistContent(playlists, 'source')).toMatchObject({
      kind: 'filterable-actions',
      search: { label: '搜尋播放清單' },
      emptyText: '沒有可加入的播放清單',
      noResultsText: '找不到播放清單',
    });
  });

  it('labels album removal differently from playlist deletion', () => {
    const playlistItems = collectionManageMenuItems(playlists[0]);
    const albumItems = collectionManageMenuItems(playlists[2]);
    expect(playlistItems.map((item) => item.id)).toEqual([
      'edit-details',
      'convert-kind',
      'delete',
    ]);
    expect(playlistItems.at(-1)).toMatchObject({
      label: '刪除',
      intent: 'danger',
    });
    expect(albumItems.at(-1).label).toBe('移除');
    expect(
      albumItems.find((item) => item.id === 'edit-release-info').label,
    ).toBe('編輯發行資訊');
    expect(albumItems.find((item) => item.id === 'convert-kind').label).toBe(
      '轉為播放清單',
    );
    expect(albumItems.find((item) => item.id === 'convert-kind').value).toEqual(
      {
        action: 'convert-kind',
        playlistId: 'album',
      },
    );
  });
});
