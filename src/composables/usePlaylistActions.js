import { computed, ref } from 'vue';
import { useLibrary } from './useLibrary.js';
import { useAppConfirmation } from './useAppConfirmation.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlaylists } from './usePlaylists.js';
import {
  PLAYLIST_MENU_ACTIONS,
  playlistDisplayName,
} from '../utils/playlistMenu.js';

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
} = usePlaylists();
const { tracksById } = useLibrary();
const { enqueueTrack } = usePlaybackQueue();
const { confirm: confirmAction } = useAppConfirmation();

// Independent of selectedPlaylist — editing must not require first
// navigating into that playlist/album's own page (right-clicking any
// sidebar row opens the modal for that row without changing what the main
// content area is currently showing).
const editDetailsPlaylistId = ref(null);
const editDetailsIsSaving = ref(false);

// The join itself is the "ghost trackId" filter — a track deleted outside
// the app just silently drops out, per tracks.js's orphan doctrine. Shared
// by LibraryBrowseContent's own playlistTracks and editDetailsCoverTracks below
// (whichever playlist the modal targets, which may not be the selected
// one) so both stay in sync with one join.
function resolvePlaylistTracks(playlist) {
  if (!playlist) return [];
  return playlist.trackIds
    .map((id) => tracksById.value.get(id))
    .filter(Boolean);
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
  try {
    if (name && name !== playlist.name) {
      await renamePlaylistAction(playlist.id, name);
    }
    if (description !== playlist.description) {
      await setPlaylistDescriptionAction(playlist.id, description);
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
  try {
    await setPlaylistCoverAction(playlist.id);
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
  try {
    const confirmed = await confirmAction({
      title: '移除播放清單封面？',
      subject: playlistDisplayName(playlist),
      message: '目前的自訂封面會被移除，歌曲與其他資訊會保留。',
      detail: '移除後需重新選擇封面才能恢復。',
      confirmLabel: '移除封面',
      intent: 'danger',
    });
    if (
      !confirmed ||
      editDetailsPlaylist.value?.id !== playlist.id ||
      editDetailsPlaylist.value.coverUrl !== coverUrl
    )
      return;
    await clearPlaylistCoverAction(playlist.id);
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
  const collectionType = isAlbum ? '專輯' : '播放清單';
  const action = isAlbum ? '移除專輯' : '刪除播放清單';
  const confirmed = await confirmAction({
    title: `${action}？`,
    subject: name,
    meta: `${playlist.trackIds.length} 首曲目`,
    message: `只會移除${collectionType}，音檔會保留。`,
    detail: '此動作無法復原。',
    confirmLabel: action,
    intent: 'danger',
  });
  if (!confirmed) return;
  removePlaylistAction(playlist.id);
}

function addPlaylistToQueue(playlistId) {
  const playlist = playlistState.playlists.find(
    (item) => item.id === playlistId,
  );
  for (const track of resolvePlaylistTracks(playlist)) enqueueTrack(track);
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
      if (source) addTracksToPlaylist(created.id, source.trackIds);
    }
    return;
  }

  const playlist = playlistState.playlists.find(
    (item) => item.id === value.playlistId,
  );
  if (!playlist) return;

  if (value.action === PLAYLIST_MENU_ACTIONS.addToQueue) {
    addPlaylistToQueue(playlist.id);
  } else if (value.action === PLAYLIST_MENU_ACTIONS.addToPlaylist) {
    addTracksToPlaylist(value.targetPlaylistId, playlist.trackIds);
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
    resolvePlaylistTracks,
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
