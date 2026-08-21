<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  Disc3,
  ListEnd,
  ListMinus,
  ListPlus,
  Pencil,
  Plus,
  Trash2,
} from '../icons/index.js';
import { useAlbumNavigation } from '../composables/useAlbumNavigation.js';
import { useDragReorder } from '../composables/useDragReorder.js';
import { useLibrary } from '../composables/useLibrary.js';
import { usePlayer } from '../composables/usePlayer.js';
import { usePlaylistActions } from '../composables/usePlaylistActions.js';
import { usePlaylists } from '../composables/usePlaylists.js';
import { usePlaybackQueue } from '../composables/usePlaybackQueue.js';
import { useTrackMetadataEditor } from '../composables/useTrackMetadataEditor.js';
import TrackMetadataModal from '../components/library/TrackMetadataModal.vue';
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
  playlistDisplayName,
  addToPlaylistTargets,
} from '../utils/playlistMenu.js';
import {
  sortPlaylistEntries,
  nextPlaylistSort,
} from '../utils/playlistSort.js';
import { toPlayableTrack } from '../utils/playableTrack.js';
import { deriveAlbumSummary } from '../utils/albumSummary.js';
import {
  sortSetlistLibraryTracks,
  sortSetlistLocalTracks,
} from '../utils/trackSourceDisplay.js';

const { state, playTrack, clearTrack } = usePlayer();
const { state: libraryState, refresh: refreshLibrary } = useLibrary();
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
  create: createPlaylistAction,
  addTrack: addTrackToPlaylist,
  removeTrack: removeTrackFromPlaylist,
  setTracks: setPlaylistTracksAction,
} = usePlaylists();
const { resolvePlaylistTracks, confirmDeletePlaylist, openEditDetails } =
  usePlaylistActions();
const { albumForTrack, jumpToAlbum } = useAlbumNavigation();

// Transient UI mode stays local; mutations persist immediately.
const deleteError = ref(null);
const searchQuery = ref('');
const addMenu = ref(null);
const playlistSort = ref({ key: null, direction: 'asc' });

const TRACK_MENU_ACTIONS = {
  addToQueue: 'add-to-queue',
  addToPlaylist: 'add-to-playlist',
  createPlaylist: 'create-playlist',
  editMetadata: 'edit-metadata',
  removeFromPlaylist: 'remove-from-playlist',
  goToAlbum: 'go-to-album',
};
const trackMetadataEditor = useTrackMetadataEditor({ refresh: refreshLibrary });

const mode = computed(() => {
  if (!selectedPlaylist.value) return 'all';
  return selectedPlaylist.value.kind === 'album' ? 'album' : 'playlist';
});
const isLocalLibraryView = computed(
  () => !selectedPlaylist.value && playlistState.libraryView === 'local',
);

// Album track membership/order is read-only — see playlists.js's
// PLAYLIST_KINDS comment. Rename/delete/play/sort still apply to both.
const isAlbumSelected = computed(() => mode.value === 'album');

const playlistTracks = computed(() =>
  resolvePlaylistTracks(selectedPlaylist.value),
);

// Empty inside an album's own page — jumping to itself would be a no-op.
const jumpableTrackIds = computed(() => {
  if (isAlbumSelected.value) return new Set();
  const ids = new Set();
  for (const track of playlistTracks.value) {
    if (albumForTrack(track)) ids.add(track.id);
  }
  return ids;
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

const libraryViewTracks = computed(() =>
  isLocalLibraryView.value
    ? sortSetlistLocalTracks(libraryState.tracks)
    : sortSetlistLibraryTracks(libraryState.tracks),
);
const visibleTracks = computed(() =>
  libraryViewTracks.value.filter(matchesSearch),
);
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

// UiCollageThumb.vue does its own first-4 slicing — passed the full list so
// it stays the single place deciding how many tracks a collage shows.
const playlistCoverTracks = computed(() => playlistTracks.value);
const playlistCoverUrl = computed(() => selectedPlaylist.value?.coverUrl ?? '');
const playlistDescription = computed(
  () => selectedPlaylist.value?.description ?? '',
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

  const availablePlaylists = addToPlaylistTargets(playlistState.playlists, {
    excludeTrackId: track?.id,
  });

  if (availablePlaylists.length > 0) {
    playlistChildren.push({ key: 'playlist-divider', separator: true });
  }

  playlistChildren.push(
    ...availablePlaylists.map((playlist) => ({
      key: playlist.id,
      label: playlistDisplayName(playlist),
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

  if (track?.sourceType === 'local-file') {
    items.push(
      { key: 'edit-divider', separator: true },
      {
        key: 'edit-metadata',
        label: '編輯資訊',
        icon: Pencil,
        value: { action: TRACK_MENU_ACTIONS.editMetadata },
      },
    );
  }

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

  // Same guard as jumpableTrackIds above.
  if (track && !isAlbumSelected.value && albumForTrack(track)) {
    items.push(
      { key: 'album-divider', separator: true },
      {
        key: 'go-to-album',
        label: '前往專輯',
        icon: Disc3,
        value: { action: TRACK_MENU_ACTIONS.goToAlbum },
      },
    );
  }

  return items;
});

const pageTitle = computed(() =>
  selectedPlaylist.value
    ? playlistDisplayName(selectedPlaylist.value)
    : isLocalLibraryView.value
      ? '本機曲目'
      : '全部曲目',
);

const pageError = computed(() => playlistState.error || deleteError.value);
const visibleTracksEmptyText = computed(() =>
  normalizedSearchQuery.value ? '找不到符合搜尋的曲目。' : '沒有曲目。',
);

// Selecting a different playlist/library-view (both now live in the shared
// usePlaylists() state, driven by the persistent AppPlaylistSidebar) only
// affects the search/add-menu/drag state scoped to this view's main content
// area — it must not touch the edit-details modal, which AppPlaylistSidebar
// owns independently.
watch(
  [() => selectedPlaylist.value?.id, () => playlistState.libraryView],
  () => {
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

// Deletes both the original file and its separation output (see
// electron/lib/library/tracks.js's deleteTrack), and cascades into every
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
  } else if (value.action === TRACK_MENU_ACTIONS.editMetadata) {
    trackMetadataEditor.open(track);
  } else if (value.action === TRACK_MENU_ACTIONS.removeFromPlaylist) {
    removeTrackFromPlaylist(value.playlistId, track.id);
  } else if (value.action === TRACK_MENU_ACTIONS.goToAlbum) {
    jumpToAlbum(track);
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

// Fetching + the onLibraryUpdated subscription now live in useLibrary.js
// (shared with useLyrics.js, not duplicated per view — see that module).
// This re-fetch on every mount is still needed on top of that: listTracks()
// enumerates the filesystem, which is how it picks up files the user
// dropped into the library folder by hand — no library:updated event fires
// for those, so without this, manually-added files wouldn't appear until
// something else happened to trigger a refresh. refresh() doesn't reset
// isLoading, so this doesn't flash "載入中" on every tab switch back here.
onMounted(() => {
  refreshLibrary();
});
</script>

<template>
  <div class="setlist-view">
    <TrackMetadataModal
      :open="trackMetadataEditor.isOpen.value"
      :title="trackMetadataEditor.state.titleDraft"
      :artist="trackMetadataEditor.state.artistDraft"
      :thumbnail-url="trackMetadataEditor.state.track?.thumbnailUrl ?? ''"
      :saving="trackMetadataEditor.state.isSaving"
      :artwork-saving="trackMetadataEditor.state.isArtworkSaving"
      :error="trackMetadataEditor.state.error ?? ''"
      @close="trackMetadataEditor.close"
      @save="trackMetadataEditor.save"
      @choose-thumbnail="trackMetadataEditor.chooseThumbnail"
      @clear-thumbnail="trackMetadataEditor.clearThumbnail"
      @update-title="trackMetadataEditor.setTitleDraft"
      @update-artist="trackMetadataEditor.setArtistDraft"
    />

    <div class="setlist-view__main">
      <SetlistPlaylistHeader
        v-if="selectedPlaylist"
        v-model:search-query="searchQuery"
        :is-album="isAlbumSelected"
        :title="pageTitle"
        :meta="playlistMeta"
        :cover-tracks="playlistCoverTracks"
        :cover-url="playlistCoverUrl"
        :description="playlistDescription"
        :can-play="playlistTracks.length > 0"
        @play="playPlaylist"
        @open-edit-details="openEditDetails"
        @delete="confirmDeletePlaylist()"
      />

      <UiPageHeader v-else :title="pageTitle">
        <template #actions>
          <UiSearchBox v-model="searchQuery" />
        </template>
      </UiPageHeader>

      <UiHint v-if="libraryState.isLoading" role="status">載入中…</UiHint>

      <UiHint v-else-if="libraryState.tracks.length === 0">
        還沒有任何曲目——前往「Import」匯入曲目。
      </UiHint>

      <template v-else>
        <UiHint v-if="pageError" tone="danger" role="alert">
          {{ pageError }}
        </UiHint>

        <template v-if="mode === 'all'">
          <UiHint v-if="visibleTracks.length === 0">
            {{ visibleTracksEmptyText }}
          </UiHint>
          <ul v-else class="tracks">
            <UiTrackRow
              v-for="track in visibleTracks"
              :key="track.id"
              :track="track"
              :current="state.track?.id === track.id"
              interactive
              :title-clickable="Boolean(albumForTrack(track))"
              :title-aria-label="`前往專輯：${track.title}`"
              @click="playRow(track)"
              @title-click="jumpToAlbum(track)"
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
            :is-album="isAlbumSelected"
            :can-drag="canDragPlaylistRows"
            :current-track-id="state.track?.id"
            :dragging-track-id="draggingTrackId"
            :drop-target-track-id="dropTargetTrackId"
            :drop-position="dropPosition"
            :jumpable-track-ids="jumpableTrackIds"
            @toggle-sort="togglePlaylistSort"
            @select-track="playRow"
            @title-click="jumpToAlbum"
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
.setlist-view {
  display: grid;
}

.setlist-view__main {
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
