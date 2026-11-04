import {
  Disc3,
  ListMusic,
  ListEnd,
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
import { t } from './i18n.js';
import { releaseEntityKey } from './releasePresentation.js';

// Presentational menu items shared by the Library collection header and the
// Sidebar row menu, so labels, icons and action payloads cannot drift.

export function addToPerformanceQueueMenuItem(
  playlist,
  { disabled = false } = {},
) {
  return {
    id: 'add-to-performance-queue',
    kind: 'action',
    label: t('playlist.menu.addToSession'),
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
      label: t('playlist.menu.search'),
      placeholder: t('playlist.menu.search'),
    },
    pinnedItems: [
      {
        id: 'create-playlist',
        kind: 'action',
        label: t('playlist.menu.create'),
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
    emptyText: t('playlist.menu.empty'),
    noResultsText: t('playlist.menu.noResults'),
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
    ...(isAlbum
      ? [
          {
            id: 'edit-release-info',
            kind: 'action',
            label: t('playlist.menu.editRelease'),
            icon: Disc3,
            value: {
              action: PLAYLIST_MENU_ACTIONS.editReleaseInfo,
              playlistId: playlist.id,
            },
          },
        ]
      : []),
    {
      id: 'edit-details',
      kind: 'action',
      label: t('playlist.menu.editDetails'),
      icon: Pencil,
      value: {
        action: PLAYLIST_MENU_ACTIONS.editDetails,
        playlistId: playlist.id,
      },
    },
    {
      id: 'convert-kind',
      kind: 'action',
      label: isAlbum
        ? t('playlist.menu.toPlaylist')
        : t('playlist.menu.toAlbum'),
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
      label: isAlbum ? t('playlist.menu.remove') : t('playlist.menu.delete'),
      icon: Trash2,
      intent: 'danger',
      value: {
        action: PLAYLIST_MENU_ACTIONS.delete,
        playlistId: playlist.id,
      },
    },
  ];
}

export function collectionActionMenu(
  playlists,
  playlist,
  { performanceQueueBusy = false } = {},
) {
  const isEmpty = playlist.trackIds.length === 0;
  const primary = [
    {
      id: 'add-to-queue',
      kind: 'action',
      label: t('playlist.sidebar.addToQueue'),
      icon: ListEnd,
      disabled: isEmpty,
      value: {
        action: PLAYLIST_MENU_ACTIONS.addToQueue,
        playlistId: playlist.id,
      },
    },
    addToPerformanceQueueMenuItem(playlist, {
      disabled: isEmpty || performanceQueueBusy,
    }),
  ];
  if (!isEmpty) {
    const label =
      playlist.kind === 'album'
        ? t(
            `library.addReleaseToPlaylist.${releaseEntityKey(playlist.resolvedRelease?.type)}`,
          )
        : t('library.addToOtherPlaylist');
    primary.push(addToPlaylistMenuItem(playlists, playlist, label));
  }
  const manage = collectionManageMenuItems(playlist);
  const remove = manage.pop();
  return {
    kind: 'actions',
    groups: [
      { id: 'primary', items: primary },
      { id: 'manage', items: manage },
      { id: 'destructive', items: [remove] },
    ],
  };
}
