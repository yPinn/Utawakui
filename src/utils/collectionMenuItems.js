import {
  Disc3,
  ListMusic,
  ListPlus,
  Pencil,
  Plus,
  Trash2,
} from '../icons/index.js';
import {
  PLAYLIST_MENU_ACTIONS,
  collectionAddToPlaylistItems,
} from './playlistMenu.js';

// Presentational menu items shared by the Setlist collection header and the
// Sidebar row menu, so labels, icons and action payloads cannot drift.

export function addToPlaylistChildren(playlists, sourcePlaylistId) {
  return collectionAddToPlaylistItems(playlists, sourcePlaylistId).map(
    (item) => (item.key === 'create-playlist' ? { ...item, icon: Plus } : item),
  );
}

export function addToPlaylistMenuItem(playlists, playlist, label) {
  return {
    key: 'add-to-playlist',
    label,
    icon: ListPlus,
    children: addToPlaylistChildren(playlists, playlist.id),
    submenuWidth: 240,
  };
}

export function collectionManageMenuItems(playlist) {
  const isAlbum = playlist.kind === 'album';
  return [
    {
      key: 'edit-details',
      label: '編輯詳細資料',
      icon: Pencil,
      value: {
        action: PLAYLIST_MENU_ACTIONS.editDetails,
        playlistId: playlist.id,
      },
    },
    {
      key: 'convert-kind',
      label: isAlbum ? '轉為播放清單' : '轉為專輯',
      icon: isAlbum ? ListMusic : Disc3,
      value: {
        action: PLAYLIST_MENU_ACTIONS.convertKind,
        playlistId: playlist.id,
      },
    },
    {
      key: 'delete',
      // An album isn't something the user authored: "移除" (remove from the
      // library) rather than "刪除" (delete).
      label: isAlbum ? '移除' : '刪除',
      icon: Trash2,
      danger: true,
      value: {
        action: PLAYLIST_MENU_ACTIONS.delete,
        playlistId: playlist.id,
      },
    },
  ];
}
