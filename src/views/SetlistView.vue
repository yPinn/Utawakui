<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ListEnd, ListMinus, ListPlus, Plus, Trash2 } from '@lucide/vue';
import { useDragReorder } from '../composables/useDragReorder.js';
import { usePlayer } from '../composables/usePlayer.js';
import { usePlaylists } from '../composables/usePlaylists.js';
import { usePlaybackQueue } from '../composables/usePlaybackQueue.js';
import PlaylistSidebar from '../components/playlists/PlaylistSidebar.vue';
import SetlistPlaylistHeader from '../components/playlists/SetlistPlaylistHeader.vue';
import SetlistPlaylistTable from '../components/playlists/SetlistPlaylistTable.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiContextMenu from '../components/ui/UiContextMenu.vue';
import UiHint from '../components/ui/UiHint.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import UiSearchBox from '../components/ui/UiSearchBox.vue';
import UiTrackRow from '../components/ui/UiTrackRow.vue';
import { formatLongDuration } from '../utils/format.js';
import {
  sortPlaylistEntries,
  nextPlaylistSort,
} from '../utils/playlistSort.js';
import { toPlayableTrack } from '../utils/playableTrack.js';
import { deriveAlbumSummary } from '../utils/albumSummary.js';

const { state, playTrack, clearTrack } = usePlayer();
const {
  state: queueState,
  setQueue,
  enqueueTrack,
  removeTrack: removeTrackFromQueue,
} = usePlaybackQueue();
// Rename playlist actions to avoid colliding with file deletion helpers.
const {
  state: playlistState,
  selectedPlaylist,
  select: selectPlaylistAction,
  create: createPlaylistAction,
  rename: renamePlaylistAction,
  remove: removePlaylistAction,
  setKind: setPlaylistKindAction,
  addTrack: addTrackToPlaylist,
  addTracks: addTracksToPlaylist,
  removeTrack: removeTrackFromPlaylist,
  setTracks: setPlaylistTracksAction,
} = usePlaylists();

const tracks = ref([]);
const isLoading = ref(true);
// Transient UI mode stays local; mutations persist immediately.
const isRenaming = ref(false);
const renameValue = ref('');
const deleteError = ref(null);
const searchQuery = ref('');
const addMenu = ref(null);
const playlistSort = ref({ key: null, direction: 'asc' });

const TRACK_MENU_ACTIONS = {
  addToQueue: 'add-to-queue',
  addToPlaylist: 'add-to-playlist',
  createPlaylist: 'create-playlist',
  removeFromPlaylist: 'remove-from-playlist',
};

const PLAYLIST_MENU_ACTIONS = {
  addToQueue: 'add-to-queue',
  addToPlaylist: 'add-to-playlist',
  editDetails: 'edit-details',
  delete: 'delete',
  createPlaylist: 'create-playlist',
  convertKind: 'convert-kind',
};

const tracksById = computed(() => new Map(tracks.value.map((t) => [t.id, t])));

const mode = computed(() => {
  if (!selectedPlaylist.value) return 'all';
  return selectedPlaylist.value.kind === 'album' ? 'album' : 'playlist';
});

// Album track membership/order is read-only — see playlists.js's
// PLAYLIST_KINDS comment. Rename/delete/play/sort still apply to both.
const isAlbumSelected = computed(() => mode.value === 'album');

// The join itself is the "ghost trackId" filter — a track deleted outside
// the app just silently drops out, per library.js's orphan doctrine (see
// electron/lib/playlists.js's own comment for why this isn't cleaned up
// main-process-side instead).
const playlistTracks = computed(() => {
  if (!selectedPlaylist.value) return [];
  return selectedPlaylist.value.trackIds
    .map((id) => tracksById.value.get(id))
    .filter(Boolean);
});

const normalizedSearchQuery = computed(() =>
  searchQuery.value.trim().toLocaleLowerCase(),
);

function matchesSearch(track) {
  const query = normalizedSearchQuery.value;
  if (!query) return true;
  return [track.title, track.artist, track.id, track.filename].some((value) =>
    String(value ?? '')
      .toLocaleLowerCase()
      .includes(query),
  );
}

const visibleTracks = computed(() => tracks.value.filter(matchesSearch));
const visiblePlaylistEntries = computed(() => {
  const entries = playlistTracks.value
    .map((track, playlistIndex) => ({
      track,
      playlistIndex,
      addedAt: selectedPlaylist.value?.addedAt?.[track.id],
    }))
    .filter(({ track }) => matchesSearch(track));

  const sorted = sortPlaylistEntries(entries, playlistSort.value);
  return sorted.map((entry, visibleIndex) => ({ ...entry, visibleIndex }));
});

const playlistCoverTracks = computed(() => playlistTracks.value.slice(0, 4));
const playlistCoverEmptySlots = computed(
  () => 4 - playlistCoverTracks.value.length,
);
const playlistTotalDuration = computed(() =>
  playlistTracks.value.reduce(
    (total, track) =>
      Number.isFinite(track.duration) ? total + track.duration : total,
    0,
  ),
);
// Not persisted — derived fresh from the album's own member tracks each
// time, so it self-corrects as backfill fills in more album/artist data.
// See src/utils/albumSummary.js for why this isn't stored a second time.
const albumSummary = computed(() =>
  isAlbumSelected.value
    ? deriveAlbumSummary(playlistTracks.value)
    : { artist: undefined, releaseYear: undefined },
);

const playlistMeta = computed(() => {
  const count = playlistTracks.value.length;
  const duration = formatLongDuration(playlistTotalDuration.value);
  const countLine = duration
    ? `${count} 首曲目，${duration}`
    : `${count} 首曲目`;
  if (!isAlbumSelected.value) return countLine;

  const { artist, releaseYear } = albumSummary.value;
  const byline = [artist, releaseYear].filter(Boolean).join(' · ');
  return byline ? `${byline} · ${countLine}` : countLine;
});

const isAddMenuOpen = computed(() => Boolean(addMenu.value));
const addMenuX = computed(() => addMenu.value?.x ?? 0);
const addMenuY = computed(() => addMenu.value?.y ?? 0);
const canDragPlaylistRows = computed(
  () => playlistSort.value.key === null && !isAlbumSelected.value,
);
const addMenuItems = computed(() => {
  const track = addMenu.value?.track;
  const isAlreadyQueued = track
    ? state.track?.id === track.id ||
      queueState.queuedTracks.some((queuedTrack) => queuedTrack.id === track.id)
    : false;
  const playlistChildren = [
    {
      key: 'create-playlist',
      label: '建立新歌單',
      icon: Plus,
      value: { action: TRACK_MENU_ACTIONS.createPlaylist },
    },
  ];

  // Album collections are read-only — never a valid "add to" target.
  const availablePlaylists = playlistState.playlists.filter(
    (playlist) =>
      playlist.kind !== 'album' &&
      (track?.id ? !playlist.trackIds.includes(track.id) : true),
  );

  if (availablePlaylists.length > 0) {
    playlistChildren.push({ key: 'playlist-divider', separator: true });
  }

  playlistChildren.push(
    ...availablePlaylists.map((playlist) => ({
      key: playlist.id,
      label: playlist.name || '(未命名歌單)',
      value: {
        action: TRACK_MENU_ACTIONS.addToPlaylist,
        playlistId: playlist.id,
      },
    })),
  );

  const items = [
    {
      key: 'add-to-queue',
      label: '新增至佇列',
      icon: ListEnd,
      status: isAlreadyQueued ? '已在佇列' : '',
      disabled: isAlreadyQueued,
      value: { action: TRACK_MENU_ACTIONS.addToQueue },
    },
    { key: 'queue-divider', separator: true },
    {
      key: 'add-to-playlist',
      label: '新增至播放清單',
      icon: ListPlus,
      children: playlistChildren,
      submenuWidth: 240,
    },
  ];

  if (
    track &&
    !isAlbumSelected.value &&
    selectedPlaylist.value?.trackIds.includes(track.id)
  ) {
    items.push({
      key: 'remove-from-playlist',
      label: '從此播放清單中移除',
      icon: ListMinus,
      value: {
        action: TRACK_MENU_ACTIONS.removeFromPlaylist,
        playlistId: selectedPlaylist.value.id,
      },
    });
  }

  return items;
});

const pageTitle = computed(
  () =>
    selectedPlaylist.value?.name ||
    (selectedPlaylist.value ? '(未命名歌單)' : 'Setlist'),
);

const pageError = computed(() => playlistState.error || deleteError.value);

// Selecting a different playlist (or none) always drops back to view mode
// — there's no staged state in either edit or rename mode to preserve.
watch(
  () => selectedPlaylist.value?.id,
  () => {
    isRenaming.value = false;
    closeAddMenu();
    clearDragState();
  },
);

function currentPlaybackQueueTracks() {
  if (!selectedPlaylist.value) return null;
  return visiblePlaylistEntries.value.map(({ track }) => track);
}

function playRow(track) {
  const queueTracks = currentPlaybackQueueTracks() ?? [track];
  setQueue(queueTracks, track.id, {
    sourceName: selectedPlaylist.value ? pageTitle.value : '',
    sourceId: selectedPlaylist.value?.id ?? null,
  });
  playTrack(toPlayableTrack(track));
}

function playPlaylist() {
  const queueTracks = currentPlaybackQueueTracks() ?? [];
  const track = queueTracks[0];
  if (track) playRow(track);
}

function togglePlaylistSort(key) {
  playlistSort.value = nextPlaylistSort(playlistSort.value, key);
  clearDragState();
}

async function loadTracks() {
  tracks.value = await window.Utawakui.listTracks();
}

async function refresh() {
  closeAddMenu();
  isLoading.value = true;
  await loadTracks();
  isLoading.value = false;
}

// Deletes both the original file and its separation output (see
// electron/lib/library.js's deleteTrack), and cascades into every
// playlist that referenced it (main.js composes that cascade) — the
// confirm dialog says so explicitly since there's no undo. The list
// refreshes itself via the existing library:updated subscription, not a
// manual reload here.
async function removeTrack(track) {
  const confirmed = window.confirm(
    `確定要刪除「${track.title}」嗎?此動作會一併刪除原始檔案、去人聲版本,並將此曲目從所有歌單中移除,且無法復原。`,
  );
  if (!confirmed) return;
  clearTrack(track.id);
  deleteError.value = null;
  try {
    const deleted = await window.Utawakui.deleteTrack(track.id);
    if (!deleted) {
      deleteError.value = `刪除曲目失敗:找不到「${track.title}」`;
      return;
    }
    removeTrackFromQueue(track.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deleteError.value = `刪除曲目失敗:${message}`;
  }
}

function startRename() {
  if (!selectedPlaylist.value) return;
  renameValue.value = selectedPlaylist.value.name;
  isRenaming.value = true;
}

function startPlaylistRename(playlistId) {
  const playlist = playlistState.playlists.find(
    (item) => item.id === playlistId,
  );
  if (!playlist) return;
  selectPlaylistAction(playlist.id);
  renameValue.value = playlist.name;
  isRenaming.value = true;
}

// Enter commits, Escape/blur cancels — same pattern as PlaylistSidebar's
// create input. A blank name is a no-op rather than clearing the name.
function commitRename() {
  const name = renameValue.value.trim();
  isRenaming.value = false;
  if (name && selectedPlaylist.value) {
    renamePlaylistAction(selectedPlaylist.value.id, name);
  }
}

function cancelRename() {
  isRenaming.value = false;
}

// window.confirm (not prompt — Electron doesn't support prompt) states
// explicitly that this doesn't touch the audio files, since that's the
// first fear an operator will have about a "delete" on a track list page.
function confirmDeletePlaylist(playlist = selectedPlaylist.value) {
  if (!playlist) return;
  const isAlbum = playlist.kind === 'album';
  const name = playlist.name || '(未命名歌單)';
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
    startPlaylistRename(playlist.id);
  } else if (value.action === PLAYLIST_MENU_ACTIONS.delete) {
    confirmDeletePlaylist(playlist);
  } else if (value.action === PLAYLIST_MENU_ACTIONS.convertKind) {
    setPlaylistKindAction(
      playlist.id,
      playlist.kind === 'album' ? 'playlist' : 'album',
    );
  }
}

function openAddMenu(track, event) {
  event.preventDefault();
  event.stopPropagation();
  addMenu.value = { track, x: event.clientX, y: event.clientY };
}

function closeAddMenu() {
  addMenu.value = null;
}

async function handleTrackMenuSelect(value) {
  const track = addMenu.value?.track;
  if (!track) {
    closeAddMenu();
    return;
  }

  if (value.action === TRACK_MENU_ACTIONS.createPlaylist) {
    const playlist = await createPlaylistAction();
    if (playlist) addTrackToPlaylist(playlist.id, track.id);
  } else if (value.action === TRACK_MENU_ACTIONS.addToQueue) {
    enqueueTrack(track);
  } else if (value.action === TRACK_MENU_ACTIONS.addToPlaylist) {
    addTrackToPlaylist(value.playlistId, track.id);
  } else if (value.action === TRACK_MENU_ACTIONS.removeFromPlaylist) {
    removeTrackFromPlaylist(value.playlistId, track.id);
  }

  closeAddMenu();
}

function reorderTrack(draggedId, targetId, position) {
  const playlist = selectedPlaylist.value;
  if (!playlist || !draggedId || draggedId === targetId) return;

  const withoutDragged = playlist.trackIds.filter((id) => id !== draggedId);
  if (withoutDragged.length === playlist.trackIds.length) return;

  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex === -1) return;

  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
  const next = [...withoutDragged];
  next.splice(insertIndex, 0, draggedId);
  if (next.join('\0') === playlist.trackIds.join('\0')) return;

  setPlaylistTracksAction(playlist.id, next);
}

function canDragThisPlaylistRow() {
  return Boolean(selectedPlaylist.value) && canDragPlaylistRows.value;
}

const {
  draggingId: draggingTrackId,
  dropTargetId: dropTargetTrackId,
  dropPosition,
  startDrag: startDragReorder,
  updateDropTarget,
  leaveDropTarget,
  drop: dropTrack,
  clearDragState,
} = useDragReorder({
  onReorder: reorderTrack,
  canDrag: canDragThisPlaylistRow,
});

// closeAddMenu() is a caller-side side effect (dismiss any open context
// menu before a drag starts) — not part of the drag gesture itself, so it
// stays here rather than inside the shared composable. Only fires when the
// drag will actually proceed, matching the original guard-then-side-effect
// order (closing the menu on a rejected drag start would be an observable
// behavior change, not a pure refactor).
function startDrag(track, event) {
  if (!canDragThisPlaylistRow()) {
    event.preventDefault();
    return;
  }
  closeAddMenu();
  startDragReorder(track, event);
}

let unsubscribe;

onMounted(() => {
  refresh();
  // Background metadata backfill (electron/lib/library.js's runBackfillPass)
  // pushes this after it changes something — silently re-fetch without
  // toggling isLoading, so the list updates in place instead of flashing
  // "載入中". usePlaylists.js has its own independent subscription to the
  // same event for the playlist array.
  unsubscribe = window.Utawakui.onLibraryUpdated(loadTracks);
});

onUnmounted(() => {
  // This view gets unmounted on every tab switch (App.vue swaps views via
  // <component :is>), so skipping this would stack a duplicate listener
  // each time the user revisits Setlist.
  unsubscribe?.();
});
</script>

<template>
  <div class="setlist">
    <PlaylistSidebar
      class="setlist__sidebar"
      :tracks-by-id="tracksById"
      @playlist-action="handlePlaylistMenuAction"
    />

    <div class="setlist__main">
      <SetlistPlaylistHeader
        v-if="selectedPlaylist"
        v-model:rename-value="renameValue"
        v-model:search-query="searchQuery"
        :is-album="isAlbumSelected"
        :title="pageTitle"
        :meta="playlistMeta"
        :cover-tracks="playlistCoverTracks"
        :cover-empty-slots="playlistCoverEmptySlots"
        :is-renaming="isRenaming"
        :can-play="playlistTracks.length > 0"
        @play="playPlaylist"
        @start-rename="startRename"
        @commit-rename="commitRename"
        @cancel-rename="cancelRename"
        @delete="confirmDeletePlaylist()"
      />

      <UiPageHeader v-else :title="pageTitle">
        <template #actions>
          <UiSearchBox v-model="searchQuery" />
        </template>
      </UiPageHeader>

      <UiHint v-if="isLoading" role="status">載入中…</UiHint>

      <UiHint v-else-if="tracks.length === 0">
        還沒有任何曲目——前往「Import」下載歌曲。
      </UiHint>

      <template v-else>
        <UiHint v-if="pageError" tone="danger" role="alert">
          {{ pageError }}
        </UiHint>

        <template v-if="mode === 'all'">
          <UiHint v-if="visibleTracks.length === 0">
            找不到符合搜尋的曲目。
          </UiHint>
          <ul v-else class="tracks">
            <UiTrackRow
              v-for="track in visibleTracks"
              :key="track.id"
              :track="track"
              :active="state.track?.id === track.id"
              interactive
              @click="playRow(track)"
              @contextmenu="openAddMenu(track, $event)"
            >
              <template #trail>
                <div class="row-actions" @click.stop>
                  <UiButton
                    :icon="Trash2"
                    aria-label="刪除曲目"
                    title="刪除曲目(同時刪除原始檔案與去人聲版本)"
                    @click="removeTrack(track)"
                  />
                </div>
              </template>
            </UiTrackRow>
          </ul>
        </template>

        <template v-else>
          <UiHint v-if="playlistTracks.length === 0">
            這個歌單還沒有曲目。從任一曲目列右鍵加入。
          </UiHint>
          <UiHint v-else-if="visiblePlaylistEntries.length === 0">
            找不到符合搜尋的曲目。
          </UiHint>
          <SetlistPlaylistTable
            v-else
            :entries="visiblePlaylistEntries"
            :sort="playlistSort"
            :can-drag="canDragPlaylistRows"
            :active-track-id="state.track?.id"
            :dragging-track-id="draggingTrackId"
            :drop-target-track-id="dropTargetTrackId"
            :drop-position="dropPosition"
            @toggle-sort="togglePlaylistSort"
            @select-track="playRow"
            @open-menu="openAddMenu"
            @track-drag-start="startDrag"
            @track-drag-over="updateDropTarget"
            @track-drag-leave="leaveDropTarget"
            @track-drop="dropTrack"
            @track-drag-end="clearDragState"
          />
        </template>
      </template>

      <UiContextMenu
        :open="isAddMenuOpen"
        :x="addMenuX"
        :y="addMenuY"
        empty-text="先新增歌單"
        :items="addMenuItems"
        @select="handleTrackMenuSelect"
        @close="closeAddMenu"
      />
    </div>
  </div>
</template>

<style scoped>
.setlist {
  display: grid;
  /* minmax(0, 1fr), not 1fr — a grid item's default min-width:auto would
     let a long untruncated title blow this column out and push the
     sidebar off-screen, defeating UiTrackRow's own ellipsis. Widened from
     160px to 220px so a title + kind subtitle two-line row
     (PlaylistSidebar.vue) has room without wrapping, then to 16rem (was a
     hardcoded 220px) once real playlist/album names showed how little
     horizontal room the marquee text actually had to work with after
     accounting for the thumb + padding + gaps eating into it — rem so it
     scales with the user's OS/browser text-size setting rather than
     staying pinned at a literal pixel count. */
  grid-template-columns: 16rem minmax(0, 1fr);
  gap: var(--ui-space-3);
  align-items: start;
}

.setlist__sidebar {
  /* .shell__main (App.vue) owns the page scroll — without sticky, the
     sidebar would scroll away with a long track list instead of staying
     put like a real nav column. */
  position: sticky;
  top: 0;
  align-self: start;
}

.setlist__main {
  min-width: 0;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  /* Never claims space from .ui-track__info's flex:1 — the title is what
     should shrink/truncate first, not the action buttons. */
  flex: 0 0 auto;
}

.tracks {
  list-style: none;
  margin: var(--ui-space-4) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
</style>
