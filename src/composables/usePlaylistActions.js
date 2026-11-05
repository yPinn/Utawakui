import { computed, ref } from 'vue';
import { useLibrary } from './useLibrary.js';
import { useAppConfirmation } from './useAppConfirmation.js';
import { useAppNotifications } from './useAppNotifications.js';
import { notificationKey } from '../constants/notificationKeys.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlaylists } from './usePlaylists.js';
import { usePerformanceQueueActions } from './usePerformanceQueueActions.js';
import { useReleaseMembers } from './useReleaseMembers.js';
import { useReleaseOrganization } from './useReleaseOrganization.js';
import { collectionDisplayTrackIds } from '../utils/albumMembership.js';
import {
  PLAYLIST_MENU_ACTIONS,
  playlistDisplayName,
} from '../utils/playlistMenu.js';
import { t } from '../utils/i18n.js';

// Module-scope singleton, same pattern as usePlaylists.js — the edit-details
// modal and its target must be shared state, not per-caller, since both the
// persistent AppPlaylistSidebar and LibraryBrowseContent's hero can trigger it,
// and only one <PlaylistDetailsModal> should ever be mounted.
const {
  state: playlistState,
  selectedPlaylist,
  create: createPlaylistAction,
  rename: renamePlaylistAction,
  remove: removePlaylistAction,
  setKind: setPlaylistKindAction,
  setDescription: setPlaylistDescriptionAction,
  setCover: setPlaylistCoverAction,
  clearCover: clearPlaylistCoverAction,
  addTracks: addTracksToPlaylist,
  createPlaylistAt,
} = usePlaylists();
const { tracksById } = useLibrary();
const { enqueueTrack } = usePlaybackQueue();
const performanceQueue = usePerformanceQueueActions();
const { confirm: confirmAction } = useAppConfirmation();
const notifications = useAppNotifications();

// Drops and menu picks both land here; say what changed, since a drop can
// miss its row and duplicates are skipped silently.
async function addTracksWithFeedback(targetId, trackIds) {
  const target = playlistState.playlists.find((item) => item.id === targetId);
  const added = [...new Set(trackIds)].filter(
    (id) => !target?.trackIds.includes(id),
  ).length;
  if (!(await addTracksToPlaylist(targetId, trackIds)) || !target) return;
  const name = playlistDisplayName(target);
  notifications.notify({
    key: notificationKey.playlists('add-tracks'),
    title: added
      ? t('playlist.notify.tracksAdded', { count: added, name }, added)
      : t('playlist.notify.tracksAlreadyIn', { name }),
    tone: 'success',
  });
}

// Independent of selectedPlaylist — editing must not require first
// navigating into that playlist/album's own page (right-clicking any
// sidebar row opens the modal for that row without changing what the main
// content area is currently showing).
const editDetailsPlaylistId = ref(null);
const editDetailsIsSaving = ref(false);
const editDetailsError = ref('');
const editorFeedback = {
  onError: (message) => {
    if (!editDetailsPlaylist.value) return false;
    editDetailsError.value = message;
  },
};

// The join itself is the "ghost trackId" filter — a track deleted outside
// the app just silently drops out, per tracks.js's orphan doctrine. Shared
// by LibraryBrowseContent's own playlistTracks and editDetailsCoverTracks below
// (whichever playlist the modal targets, which may not be the selected
// one) so both stay in sync with one join.
function resolvePlaylistTracks(playlist) {
  if (!playlist) return [];
  return collectionDisplayTrackIds(playlist)
    .map((id) => tracksById.value.get(id))
    .filter(Boolean);
}

async function resolvePlaylistTracksForAction(playlist) {
  if (!playlist) return [];
  if (
    playlist.kind !== 'album' ||
    !playlist.resolvedRelease ||
    playlist.releaseLibraryEpoch === undefined
  )
    return resolvePlaylistTracks(playlist);
  return useReleaseMembers().resolve(playlist, { fresh: true });
}
async function resolvePlaylistTrackIdsForCopy(playlist) {
  if (
    playlist?.kind === 'album' &&
    playlist.resolvedRelease &&
    playlist.releaseLibraryEpoch !== undefined
  )
    return (await resolvePlaylistTracksForAction(playlist)).map(
      (track) => track.id,
    );
  return playlist?.trackIds ?? [];
}

// Deriving `open` from this existing (rather than a separate boolean) also
// means the modal self-closes if its target playlist is deleted elsewhere
// while open.
const editDetailsPlaylist = computed(() =>
  editDetailsPlaylistId.value
    ? (playlistState.playlists.find(
        (item) => item.id === editDetailsPlaylistId.value,
      ) ?? null)
    : null,
);
const editDetailsIsAlbum = computed(
  () => editDetailsPlaylist.value?.kind === 'album',
);
const editDetailsCoverTracks = computed(() =>
  resolvePlaylistTracks(editDetailsPlaylist.value),
);
const editDetailsCoverUrl = computed(
  () => editDetailsPlaylist.value?.coverUrl ?? '',
);
const editDetailsDescription = computed(
  () => editDetailsPlaylist.value?.description ?? '',
);

// Name/description are edited together in PlaylistDetailsModal.vue — an
// explicit Save button, not Enter/blur, is what confirms them. Cover
// changes (choose/clear) still commit immediately on click since that's
// already an async IPC round-trip independent of the form's Save button.
function openEditDetails() {
  if (editDetailsIsSaving.value) return;
  if (!selectedPlaylist.value) return;
  editDetailsPlaylistId.value = selectedPlaylist.value.id;
  editDetailsError.value = '';
}

// Context-menu entry point — the target row may not be the one currently
// selected/viewed. Editing must not force navigation to it, so this only
// sets the independent edit-details target, never select().
function startPlaylistEditDetails(playlistId) {
  if (editDetailsIsSaving.value) return;
  const playlist = playlistState.playlists.find(
    (item) => item.id === playlistId,
  );
  if (!playlist) return;
  editDetailsPlaylistId.value = playlist.id;
  editDetailsError.value = '';
}

function closeEditDetailsModal() {
  if (editDetailsIsSaving.value) return;
  editDetailsPlaylistId.value = null;
}

async function saveEditDetails({ name, description }) {
  if (editDetailsIsSaving.value) return;
  const playlist = editDetailsPlaylist.value;
  if (!playlist) return;
  editDetailsIsSaving.value = true;
  editDetailsError.value = '';
  try {
    if (name && name !== playlist.name) {
      if (!(await renamePlaylistAction(playlist.id, name, editorFeedback)))
        return;
    }
    if (description !== playlist.description) {
      if (
        !(await setPlaylistDescriptionAction(
          playlist.id,
          description,
          editorFeedback,
        ))
      )
        return;
    }
    editDetailsPlaylistId.value = null;
  } finally {
    editDetailsIsSaving.value = false;
  }
}

async function chooseCover() {
  if (editDetailsIsSaving.value) return;
  const playlist = editDetailsPlaylist.value;
  if (!playlist) return;
  editDetailsIsSaving.value = true;
  editDetailsError.value = '';
  try {
    await setPlaylistCoverAction(playlist.id, editorFeedback);
  } finally {
    editDetailsIsSaving.value = false;
  }
}

async function clearCover() {
  if (editDetailsIsSaving.value) return;
  const playlist = editDetailsPlaylist.value;
  if (!playlist?.coverUrl || playlist.kind === 'album') return;
  const coverUrl = playlist.coverUrl;
  editDetailsIsSaving.value = true;
  editDetailsError.value = '';
  try {
    const confirmed = await confirmAction({
      title: t('playlist.actions.removeCoverTitle'),
      subject: playlistDisplayName(playlist),
      message: t('playlist.actions.removeCoverMessage'),
      detail: t('playlist.actions.removeCoverDetail'),
      confirmLabel: t('playlist.actions.removeCover'),
      intent: 'danger',
    });
    if (
      !confirmed ||
      editDetailsPlaylist.value?.id !== playlist.id ||
      editDetailsPlaylist.value.coverUrl !== coverUrl
    )
      return;
    await clearPlaylistCoverAction(playlist.id, editorFeedback);
  } finally {
    editDetailsIsSaving.value = false;
  }
}

// State explicitly that this doesn't touch audio files, since that's the first
// fear an operator will have about a delete action on a track-list page.
async function confirmDeletePlaylist(playlist = selectedPlaylist.value) {
  if (!playlist) return;
  const isAlbum = playlist.kind === 'album';
  const name = playlistDisplayName(playlist);
  const count = playlist.trackIds.length;
  const confirmed = await confirmAction({
    title: isAlbum
      ? t('playlist.actions.removeAlbumTitle')
      : t('playlist.actions.deletePlaylistTitle'),
    subject: name,
    meta: t('playlist.actions.trackCount', { count }, count),
    message: isAlbum
      ? t('playlist.actions.albumKeepsAudio')
      : t('playlist.actions.playlistKeepsAudio'),
    detail: t('playlist.actions.irreversible'),
    confirmLabel: isAlbum
      ? t('playlist.actions.removeAlbum')
      : t('playlist.actions.deletePlaylist'),
    intent: 'danger',
  });
  if (!confirmed) return;
  removePlaylistAction(playlist.id);
}

async function addPlaylistToQueue(playlistId) {
  const playlist = playlistState.playlists.find(
    (item) => item.id === playlistId,
  );
  for (const track of await resolvePlaylistTracksForAction(playlist))
    enqueueTrack(track);
}

async function handlePlaylistMenuAction(value) {
  if (value.action === PLAYLIST_MENU_ACTIONS.createPlaylist) {
    const created = await createPlaylistAction();
    // sourcePlaylistId is only set when this came from the "新增至別的播放
    // 清單" submenu's "建立新播放清單" entry — look the source's trackIds
    // up fresh here rather than trusting anything serialized into the menu
    // item's value, since the collection could have changed between the
    // menu opening and this click.
    if (created && value.sourcePlaylistId) {
      const source = playlistState.playlists.find(
        (item) => item.id === value.sourcePlaylistId,
      );
      if (source)
        addTracksToPlaylist(
          created.id,
          await resolvePlaylistTrackIdsForCopy(source),
        );
    }
    return;
  }

  const playlist = playlistState.playlists.find(
    (item) => item.id === value.playlistId,
  );
  if (!playlist) return;

  if (value.action === PLAYLIST_MENU_ACTIONS.addToPerformanceQueue) {
    await performanceQueue.addCollection(playlist.id);
  } else if (value.action === PLAYLIST_MENU_ACTIONS.addToQueue) {
    await addPlaylistToQueue(playlist.id);
  } else if (value.action === PLAYLIST_MENU_ACTIONS.editReleaseInfo) {
    await useReleaseOrganization().open(playlist.id);
  } else if (value.action === PLAYLIST_MENU_ACTIONS.addToPlaylist) {
    await addTracksWithFeedback(
      value.targetPlaylistId,
      await resolvePlaylistTrackIdsForCopy(playlist),
    );
  } else if (value.action === PLAYLIST_MENU_ACTIONS.copyToFolder) {
    const created = await createPlaylistAt({
      name: playlist.name,
      trackIds: await resolvePlaylistTrackIdsForCopy(playlist),
      target: value.target,
      position: value.position,
      coverFrom: playlist.id,
    });
    if (created) {
      notifications.notify({
        key: notificationKey.playlists('copy-to-folder'),
        title: t('playlist.notify.copiedToFolder', { name: value.folderName }),
        tone: 'success',
      });
    }
  } else if (value.action === PLAYLIST_MENU_ACTIONS.editDetails) {
    startPlaylistEditDetails(playlist.id);
  } else if (value.action === PLAYLIST_MENU_ACTIONS.delete) {
    await confirmDeletePlaylist(playlist);
  } else if (value.action === PLAYLIST_MENU_ACTIONS.convertKind) {
    setPlaylistKindAction(
      playlist.id,
      playlist.kind === 'album' ? 'playlist' : 'album',
    );
  }
}

export function usePlaylistActions() {
  return {
    editDetailsPlaylist,
    editDetailsIsAlbum,
    editDetailsCoverTracks,
    editDetailsCoverUrl,
    editDetailsDescription,
    editDetailsIsSaving,
    editDetailsError,
    resolvePlaylistTracks,
    resolvePlaylistTracksForAction,
    openEditDetails,
    closeEditDetailsModal,
    saveEditDetails,
    chooseCover,
    clearCover,
    confirmDeletePlaylist,
    addPlaylistToQueue,
    handlePlaylistMenuAction,
  };
}
