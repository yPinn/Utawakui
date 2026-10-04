<script setup>
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import {
  Disc3,
  ListMusic,
  ListPlus,
  Pencil,
  Plus,
  Trash2,
} from '../icons/index.js';
import { useAlbumNavigation } from '../composables/useAlbumNavigation.js';
import { useAppDiagnostics } from '../composables/useAppDiagnostics.js';
import { useCollectionPlayback } from '../composables/useCollectionPlayback.js';
import { useDragReorder } from '../composables/useDragReorder.js';
import { useLibrary } from '../composables/useLibrary.js';
import { usePlayer } from '../composables/usePlayer.js';
import { usePlaylistActions } from '../composables/usePlaylistActions.js';
import { usePlaylists } from '../composables/usePlaylists.js';
import { usePlaybackQueue } from '../composables/usePlaybackQueue.js';
import { usePerformanceSessionWorkspace } from '../composables/usePerformanceSessionWorkspace.js';
import { useTrackMetadataEditor } from '../composables/useTrackMetadataEditor.js';
import TrackMetadataModal from '../components/library/TrackMetadataModal.vue';
import AppFolderContentField from '../components/layout/AppFolderContentField.vue';
import AppSurfaceBoundary from '../components/layout/AppSurfaceBoundary.vue';
import SetlistAlbumSupportingContent from '../components/playlists/SetlistAlbumSupportingContent.vue';
import SetlistCollectionHeader from '../components/playlists/SetlistCollectionHeader.vue';
import SetlistPlaylistTable from '../components/playlists/SetlistPlaylistTable.vue';
import PerformanceSessionWorkspace from '../components/performance-session/PerformanceSessionWorkspace.vue';
import TrackActionMenu from '../components/track/TrackActionMenu.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiHint from '../components/ui/UiHint.vue';
import UiNotice from '../components/ui/UiNotice.vue';
import UiTrackRow from '../components/ui/UiTrackRow.vue';
import { formatLongDuration } from '../utils/format.js';
import {
  PLAYLIST_MENU_ACTIONS,
  TRACK_MENU_ACTIONS,
  collectionAddToPlaylistItems,
  playlistDisplayName,
} from '../utils/playlistMenu.js';
import {
  sortPlaylistEntries,
  nextPlaylistSort,
} from '../utils/playlistSort.js';
import { toPlayableTrack } from '../utils/playableTrack.js';
import { deriveAlbumSummary } from '../utils/albumSummary.js';
import { deriveAlbumSupportingContent } from '../utils/albumSupportingContent.js';
import {
  sortSetlistLibraryTracks,
  sortSetlistLocalTracks,
} from '../utils/trackSourceDisplay.js';

const { state, playTrack, clearTrack } = usePlayer();
const { recordError } = useAppDiagnostics();
const {
  state: libraryState,
  initialize: initializeLibrary,
  refresh: refreshLibrary,
} = useLibrary();
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
  select: selectPlaylistAction,
  addTrack: addTrackToPlaylist,
  removeTrack: removeTrackFromPlaylist,
  setTracks: setPlaylistTracksAction,
} = usePlaylists();
const { resolvePlaylistTracks, openEditDetails, handlePlaylistMenuAction } =
  usePlaylistActions();
const collectionPlayback = useCollectionPlayback();
const { albumForTrack, jumpToAlbum } = useAlbumNavigation();
const performanceSessionWorkspace = usePerformanceSessionWorkspace();

// Transient UI mode stays local; mutations persist immediately.
const deleteError = ref(null);
const selectedTrackId = shallowRef(null);
const searchQuery = defineModel('searchQuery', {
  type: String,
  default: '',
});
const addMenu = ref(null);
const playlistSort = ref({ key: null, direction: 'asc' });

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
const orderedPlaylistEntries = computed(() => {
  const entries = playlistTracks.value.map((track, playlistIndex) => ({
    track,
    playlistIndex,
    addedAt: selectedPlaylist.value?.addedAt?.[track.id],
  }));

  return sortPlaylistEntries(entries, playlistSort.value);
});

const visiblePlaylistEntries = computed(() =>
  orderedPlaylistEntries.value
    .filter(({ track }) => matchesSearch(track))
    .map((entry, visibleIndex) => ({ ...entry, visibleIndex })),
);
const collectionPlaybackTracks = computed(() =>
  orderedPlaylistEntries.value.map(({ track }) => track),
);

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
const albumEntries = computed(() =>
  playlistState.playlists
    .filter((playlist) => playlist.kind === 'album')
    .map((collection) => ({
      collection,
      tracks: resolvePlaylistTracks(collection),
    })),
);
const albumSupportingContent = computed(() => {
  if (!isAlbumSelected.value || !selectedPlaylist.value) return null;
  return deriveAlbumSupportingContent({
    selectedAlbumId: selectedPlaylist.value.id,
    selectedTracks: playlistTracks.value,
    albumEntries: albumEntries.value,
    libraryTracks: libraryState.tracks,
  });
});

const playlistMeta = computed(() => {
  const count = playlistTracks.value.length;
  const duration = formatLongDuration(playlistTotalDuration.value);
  const countLine = duration
    ? `${count} 首曲目，${duration}`
    : `${count} 首曲目`;
  if (!isAlbumSelected.value) return countLine;

  const { releaseYear } = albumSummary.value;
  return releaseYear ? `${releaseYear} · ${countLine}` : countLine;
});
const playlistArtist = computed(() => albumSummary.value.artist ?? '');

const pageTitle = computed(() =>
  selectedPlaylist.value
    ? playlistDisplayName(selectedPlaylist.value)
    : isLocalLibraryView.value
      ? '本機曲目'
      : '全部曲目',
);

const selectedCollectionPlaybackContext = computed(() => ({
  sourceId: selectedPlaylist.value?.id ?? '',
  sourceName: pageTitle.value,
  tracks: collectionPlaybackTracks.value,
}));
const selectedCollectionIsPlaying = computed(() =>
  collectionPlayback.isPlaying(selectedPlaylist.value?.id),
);
const selectedCollectionShuffleActive = computed(() =>
  collectionPlayback.isShuffleActive(selectedPlaylist.value?.id),
);

const addToPlaylistItems = computed(() => {
  const playlist = selectedPlaylist.value;
  if (!playlist) return [];
  return collectionAddToPlaylistItems(playlistState.playlists, playlist.id).map(
    (item) => (item.key === 'create-playlist' ? { ...item, icon: Plus } : item),
  );
});

const collectionMoreItems = computed(() => {
  const playlist = selectedPlaylist.value;
  if (!playlist) return [];
  const isAlbum = playlist.kind === 'album';
  const items = [];

  if (playlistTracks.value.length > 0) {
    items.push({
      key: 'add-to-playlist',
      label: isAlbum ? '新增專輯至播放清單' : '新增至別的播放清單',
      icon: ListPlus,
      children: addToPlaylistItems.value,
      submenuWidth: 240,
    });
  }

  items.push(
    ...(items.length > 0 ? [{ key: 'manage-divider', separator: true }] : []),
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
      label: isAlbum ? '移除' : '刪除',
      icon: Trash2,
      danger: true,
      value: {
        action: PLAYLIST_MENU_ACTIONS.delete,
        playlistId: playlist.id,
      },
    },
  );
  return items;
});

const canDragPlaylistRows = computed(
  () => playlistSort.value.key === null && !isAlbumSelected.value,
);
const queuedTrackIds = computed(() =>
  queueState.queuedTracks.map((track) => track.id),
);
const addMenuRemoveFromPlaylistId = computed(() => {
  const track = addMenu.value?.track;
  if (
    track &&
    !isAlbumSelected.value &&
    selectedPlaylist.value?.trackIds.includes(track.id)
  ) {
    return selectedPlaylist.value.id;
  }
  return '';
});
const addMenuCanGoToAlbum = computed(() => {
  const track = addMenu.value?.track;
  return Boolean(track && !isAlbumSelected.value && albumForTrack(track));
});

const pageError = computed(() => playlistState.error || deleteError.value);
const visibleTracksEmptyText = computed(() =>
  normalizedSearchQuery.value ? '找不到符合搜尋的曲目。' : '沒有曲目。',
);
const contentFieldVariant = computed(() => {
  if (
    libraryState.isLoading ||
    libraryState.error ||
    libraryState.tracks.length === 0
  ) {
    return 'state';
  }
  if (mode.value === 'all') {
    return visibleTracks.value.length === 0 ? 'state' : 'content';
  }
  if (
    playlistTracks.value.length === 0 ||
    visiblePlaylistEntries.value.length === 0
  ) {
    return 'state';
  }
  return 'content';
});

// Selecting a different playlist/library-view (both now live in the shared
// usePlaylists() state, driven by the persistent AppPlaylistSidebar) only
// affects the search/add-menu/drag state scoped to this view's main content
// area — it must not touch the edit-details modal, which AppPlaylistSidebar
// owns independently.
watch(
  [() => selectedPlaylist.value?.id, () => playlistState.libraryView],
  () => {
    selectedTrackId.value = null;
    closeAddMenu();
    clearDragState();
  },
);

function currentVisibleQueueTracks() {
  if (!selectedPlaylist.value) return visibleTracks.value;
  return visiblePlaylistEntries.value.map(({ track }) => track);
}

function selectTrack(track) {
  selectedTrackId.value = track?.id ?? null;
}

function activateTrack(track) {
  const queueTracks = currentVisibleQueueTracks();
  if (!queueTracks.some(({ id }) => id === track?.id)) return;
  selectTrack(track);
  setQueue(queueTracks, track.id, {
    sourceName: pageTitle.value,
    sourceId: selectedPlaylist.value?.id ?? null,
  });
  playTrack(toPlayableTrack(track));
}

function toggleSelectedCollectionPlayback() {
  collectionPlayback.togglePlayback(selectedCollectionPlaybackContext.value);
}

function toggleSelectedCollectionShuffle() {
  collectionPlayback.toggleCollectionShuffle(
    selectedCollectionPlaybackContext.value,
  );
}

function enqueueSelectedCollection() {
  collectionPlayback.enqueueCollection(selectedCollectionPlaybackContext.value);
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
      deleteError.value = '找不到這首曲目，曲庫可能已更新。';
      return;
    }
    removeTrackFromQueue(track.id);
    if (selectedTrackId.value === track.id) selectedTrackId.value = null;
  } catch (err) {
    deleteError.value = recordError(err, {
      code: 'LIBRARY_DELETE_FAILED',
      title: '無法刪除曲目',
      message: '目前無法刪除曲目，請再試一次。',
      source: 'library',
      operation: 'delete',
      context: { retryable: true },
    }).message;
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
    if (selectedTrackId.value === track.id) selectedTrackId.value = null;
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

// Fetching and the onLibraryUpdated subscription live in useLibrary.js (shared
// with useLyrics.js). The re-fetch on every mount is still needed: listTracks()
// enumerates the filesystem and so picks up files the user dropped into the
// library folder by hand, for which no library:updated event fires. refresh()
// does not reset isLoading, so tab switches do not flash "載入中".
onMounted(async () => {
  const wasInitialized = libraryState.isInitialized;
  await initializeLibrary();
  if (wasInitialized) await refreshLibrary();
});
</script>

<template>
  <div
    class="setlist-view"
    :class="{
      'setlist-view--session': performanceSessionWorkspace.isOpen.value,
    }"
  >
    <TrackMetadataModal
      :open="trackMetadataEditor.isOpen.value"
      :title="trackMetadataEditor.state.titleDraft"
      :artist="trackMetadataEditor.state.artistDraft"
      :thumbnail-url="trackMetadataEditor.state.track?.thumbnailUrl ?? ''"
      :saving="trackMetadataEditor.state.isSaving"
      :artwork-saving="trackMetadataEditor.state.isArtworkSaving"
      :artwork-searching="trackMetadataEditor.state.isArtworkSearching"
      :artwork-search-open="trackMetadataEditor.state.artworkSearchOpen"
      :artwork-search-completed="
        trackMetadataEditor.state.artworkSearchCompleted
      "
      :artwork-query="trackMetadataEditor.state.artworkQuery"
      :artwork-candidates="trackMetadataEditor.state.artworkCandidates"
      :selected-artwork-candidate-id="
        trackMetadataEditor.state.selectedArtworkCandidateId
      "
      :error="trackMetadataEditor.state.error ?? ''"
      @close="trackMetadataEditor.close"
      @save="trackMetadataEditor.save"
      @choose-thumbnail="trackMetadataEditor.chooseThumbnail"
      @clear-thumbnail="trackMetadataEditor.clearThumbnail"
      @open-artwork-search="trackMetadataEditor.openArtworkSearch"
      @close-artwork-search="trackMetadataEditor.closeArtworkSearch"
      @update-artwork-query="trackMetadataEditor.setArtworkQueryField"
      @search-artwork="trackMetadataEditor.searchArtwork"
      @select-artwork-candidate="trackMetadataEditor.selectArtworkCandidate"
      @apply-artwork="trackMetadataEditor.applySelectedArtwork"
      @update-title="trackMetadataEditor.setTitleDraft"
      @update-artist="trackMetadataEditor.setArtistDraft"
    />

    <div class="setlist-view__main">
      <AppSurfaceBoundary
        v-if="performanceSessionWorkspace.isOpen.value"
        surface-id="performance-session-workspace"
        class="setlist-view__session-boundary"
        tag="div"
      >
        <PerformanceSessionWorkspace
          :tracks="libraryState.tracks"
          @close="performanceSessionWorkspace.close"
        />
      </AppSurfaceBoundary>

      <template v-else>
        <div v-if="selectedPlaylist" class="setlist-view__collection-header">
          <SetlistCollectionHeader
            v-model:search-query="searchQuery"
            :entity-kind="mode"
            :title="pageTitle"
            :artist="playlistArtist"
            :meta="playlistMeta"
            :cover-tracks="playlistCoverTracks"
            :cover-url="playlistCoverUrl"
            :description="playlistDescription"
            :playing="selectedCollectionIsPlaying"
            :shuffle-active="selectedCollectionShuffleActive"
            :can-play="playlistTracks.length > 0"
            :can-shuffle="playlistTracks.length > 1"
            :can-add-to-queue="playlistTracks.length > 0"
            :can-add-to-playlist="playlistTracks.length > 0"
            :add-to-playlist-items="addToPlaylistItems"
            :more-items="collectionMoreItems"
            @toggle-playback="toggleSelectedCollectionPlayback"
            @toggle-shuffle="toggleSelectedCollectionShuffle"
            @add-to-queue="enqueueSelectedCollection"
            @open-edit-details="openEditDetails"
            @menu-action="handlePlaylistMenuAction"
          />
        </div>

        <AppFolderContentField
          :variant="contentFieldVariant"
          aria-label="曲目清單與狀態"
        >
          <UiHint v-if="libraryState.isLoading" role="status">載入中…</UiHint>

          <UiNotice
            v-else-if="libraryState.error"
            :notice="libraryState.error"
            compact
            @action="refreshLibrary"
          />

          <UiHint v-else-if="libraryState.tracks.length === 0">
            還沒有任何曲目——前往「Import」匯入曲目。
          </UiHint>

          <template v-else>
            <UiNotice
              v-if="pageError"
              tone="danger"
              title="播放清單操作未完成"
              :message="pageError"
              compact
            />

            <template v-if="mode === 'all'">
              <UiHint v-if="visibleTracks.length === 0">
                {{ visibleTracksEmptyText }}
              </UiHint>
              <ul v-else class="tracks">
                <UiTrackRow
                  v-for="track in visibleTracks"
                  :key="track.id"
                  :track="track"
                  :active="selectedTrackId === track.id"
                  :current="state.track?.id === track.id"
                  interactive
                  selection-action
                  activate-on-enter
                  :action-label="`選取：${track.title}`"
                  action-description="單擊或空白鍵選取；雙擊或 Enter 播放"
                  :title-clickable="Boolean(albumForTrack(track))"
                  :title-aria-label="`前往專輯：${track.title}`"
                  @row-click="selectTrack(track)"
                  @row-dblclick="activateTrack(track)"
                  @activate="activateTrack(track)"
                  @title-click="jumpToAlbum(track)"
                  @contextmenu="openAddMenu(track, $event)"
                >
                  <template #trail>
                    <div class="row-actions" @click.stop @dblclick.stop>
                      <UiButton
                        :icon="Trash2"
                        intent="danger"
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
                :selected-track-id="selectedTrackId"
                :current-track-id="state.track?.id"
                :dragging-track-id="draggingTrackId"
                :drop-target-track-id="dropTargetTrackId"
                :drop-position="dropPosition"
                :jumpable-track-ids="jumpableTrackIds"
                @toggle-sort="togglePlaylistSort"
                @select-track="selectTrack"
                @activate-track="activateTrack"
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
        </AppFolderContentField>

        <SetlistAlbumSupportingContent
          v-if="albumSupportingContent"
          :artist="albumSupportingContent.artist"
          :related-albums="albumSupportingContent.relatedAlbums"
          :summary="albumSupportingContent.summary"
          @select-album="selectPlaylistAction"
        />

        <TrackActionMenu
          :open="Boolean(addMenu)"
          :x="addMenu?.x ?? 0"
          :y="addMenu?.y ?? 0"
          :track="addMenu?.track ?? null"
          :playlists="playlistState.playlists"
          :current-track-id="state.track?.id ?? ''"
          :queued-track-ids="queuedTrackIds"
          :remove-from-playlist-id="addMenuRemoveFromPlaylistId"
          :can-go-to-album="addMenuCanGoToAlbum"
          @select="handleTrackMenuSelect"
          @close="closeAddMenu"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.setlist-view {
  display: grid;
  min-block-size: 100%;
}

.setlist-view--session,
.setlist-view--session .setlist-view__main {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.setlist-view--session .setlist-view__main {
  display: flex;
  flex-direction: column;
}

.setlist-view__main {
  min-width: 0;
  min-block-size: 100%;
  display: flex;
  flex-direction: column;
}

.setlist-view__collection-header {
  min-width: 0;
  flex: 0 0 auto;
}

.setlist-view__session-boundary {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
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
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
</style>
