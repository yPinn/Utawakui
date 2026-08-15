import { computed, ref } from 'vue';
import { useLibrary } from './useLibrary.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlaylists } from './usePlaylists.js';
import {
  PLAYLIST_MENU_ACTIONS,
  playlistDisplayName,
} from '../utils/playlistMenu.js';

// Module-scope singleton, same pattern as usePlaylists.js — the edit-details
// modal and its target must be shared state, not per-caller, since both the
// persistent AppPlaylistSidebar and SetlistView's own hero can trigger it,
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

// Independent of selectedPlaylist — editing must not require first
// navigating into that playlist/album's own page (right-clicking any
// sidebar row opens the modal for that row without changing what the main
// content area is currently showing).
const editDetailsPlaylistId = ref(null);

// The join itself is the "ghost trackId" filter — a track deleted outside
// the app just silently drops out, per library.js's orphan doctrine. Shared
// by SetlistView's own playlistTracks and editDetailsCoverTracks below
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
  if (!selectedPlaylist.value) return;
  editDetailsPlaylistId.value = selectedPlaylist.value.id;
}

// Context-menu entry point — the target row may not be the one currently
// selected/viewed. Editing must not force navigation to it, so this only
// sets the independent edit-details target, never select().
function startPlaylistEditDetails(playlistId) {
  const playlist = playlistState.playlists.find(
    (item) => item.id === playlistId,
  );
  if (!playlist) return;
  editDetailsPlaylistId.value = playlist.id;
}

function closeEditDetailsModal() {
  editDetailsPlaylistId.value = null;
}

function saveEditDetails({ name, description }) {
  const playlist = editDetailsPlaylist.value;
  if (!playlist) return;
  if (name && name !== playlist.name) {
    renamePlaylistAction(playlist.id, name);
  }
  if (description !== playlist.description) {
    setPlaylistDescriptionAction(playlist.id, description);
  }
  editDetailsPlaylistId.value = null;
}

function chooseCover() {
  const playlist = editDetailsPlaylist.value;
  if (!playlist) return;
  setPlaylistCoverAction(playlist.id);
}

function clearCover() {
  const playlist = editDetailsPlaylist.value;
  if (!playlist) return;
  clearPlaylistCoverAction(playlist.id);
}

// window.confirm (not prompt — Electron doesn't support prompt) states
// explicitly that this doesn't touch the audio files, since that's the
// first fear an operator will have about a "delete" on a track list page.
function confirmDeletePlaylist(playlist = selectedPlaylist.value) {
  if (!playlist) return;
  const isAlbum = playlist.kind === 'album';
  const name = playlistDisplayName(playlist);
  const confirmed = window.confirm(
    isAlbum
      ? `確定要移除專輯「${name}」嗎?(共 ${playlist.trackIds.length} 首曲目)這不會刪除音檔本身,只會移除這個專輯,且無法復原。`
      : `確定要刪除歌單「${name}」嗎?(共 ${playlist.trackIds.length} 首曲目)這不會刪除音檔本身,只會刪除這個歌單,且無法復原。`,
  );
  if (!confirmed) return;
  removePlaylistAction(playlist.id);
}

function addPlaylistToQueue(playlistId) {
  const playlist = playlistState.playlists.find(
    (item) => item.id === playlistId,
  );
  if (!playlist) return;

  for (const trackId of playlist.trackIds) {
    const track = tracksById.value.get(trackId);
    if (track) enqueueTrack(track);
  }
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
    confirmDeletePlaylist(playlist);
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
