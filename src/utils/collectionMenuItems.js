import {
  Disc3,
  ListMusic,
  ListPlus,
  Pencil,
  Plus,
  Tickets,
  Trash2,
} from '../icons/index.js';
import {
  PLAYLIST_MENU_ACTIONS,
  addToPlaylistTargets,
  playlistDisplayName,
} from './playlistMenu.js';

// Presentational menu items shared by the Library collection header and the
// Sidebar row menu, so labels, icons and action payloads cannot drift.

export function addToPerformanceQueueMenuItem(
  playlist,
  { disabled = false } = {},
) {
  return {
    id: 'add-to-performance-queue',
    kind: 'action',
    label: '加入演出待唱',
    icon: Tickets,
    disabled,
    value: {
      action: PLAYLIST_MENU_ACTIONS.addToPerformanceQueue,
      playlistId: playlist.id,
    },
  };
}

export function addToPlaylistContent(playlists, sourcePlaylistId) {
  const targets = addToPlaylistTargets(playlists, {
    excludeId: sourcePlaylistId,
  });
  return {
    kind: 'filterable-actions',
    search: {
      label: '搜尋播放清單',
      placeholder: '搜尋播放清單',
    },
    pinnedItems: [
      {
        id: 'create-playlist',
        kind: 'action',
        label: '建立新播放清單',
        icon: Plus,
        value: {
          action: PLAYLIST_MENU_ACTIONS.createPlaylist,
          sourcePlaylistId,
        },
      },
    ],
    groups: [
      {
        id: 'destinations',
        items: targets.map((target) => ({
          id: `playlist:${target.id}`,
          kind: 'action',
          label: playlistDisplayName(target),
          keywords: [target.name],
          value: {
            action: PLAYLIST_MENU_ACTIONS.addToPlaylist,
            playlistId: sourcePlaylistId,
            targetPlaylistId: target.id,
          },
        })),
      },
    ],
    emptyText: '沒有可加入的播放清單',
    noResultsText: '找不到播放清單',
  };
}

export function addToPlaylistMenuItem(playlists, playlist, label) {
  return {
    id: 'add-to-playlist',
    kind: 'submenu',
    label,
    icon: ListPlus,
    size: 'lg',
    content: addToPlaylistContent(playlists, playlist.id),
  };
}

export function collectionManageMenuItems(playlist) {
  const isAlbum = playlist.kind === 'album';
  return [
    {
      id: 'edit-details',
      kind: 'action',
      label: '編輯詳細資料',
      icon: Pencil,
      value: {
        action: PLAYLIST_MENU_ACTIONS.editDetails,
        playlistId: playlist.id,
      },
    },
    {
      id: 'convert-kind',
      kind: 'action',
      label: isAlbum ? '轉為播放清單' : '轉為專輯',
      icon: isAlbum ? ListMusic : Disc3,
      value: {
        action: PLAYLIST_MENU_ACTIONS.convertKind,
        playlistId: playlist.id,
      },
    },
    {
      id: 'delete',
      kind: 'action',
      // An album isn't something the user authored: "移除" (remove from the
      // library) rather than "刪除" (delete).
      label: isAlbum ? '移除' : '刪除',
      icon: Trash2,
      intent: 'danger',
      value: {
        action: PLAYLIST_MENU_ACTIONS.delete,
        playlistId: playlist.id,
      },
    },
  ];
}
