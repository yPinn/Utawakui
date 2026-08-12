<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  GripVertical,
  ListEnd,
  ListMinus,
  ListPlus,
  Music2,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from '@lucide/vue';
import { usePlayer } from '../composables/usePlayer.js';
import { usePlaylists } from '../composables/usePlaylists.js';
import { usePlaybackQueue } from '../composables/usePlaybackQueue.js';
import PlaylistSidebar from '../components/PlaylistSidebar.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiContextMenu from '../components/ui/UiContextMenu.vue';
import UiMarqueeText from '../components/ui/UiMarqueeText.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import UiTrackRow from '../components/ui/UiTrackRow.vue';
import { formatDuration } from '../utils/format.js';
import { toPlayableTrack } from '../utils/playableTrack.js';
import { getTrackInitial } from '../utils/trackDisplay.js';
import { deriveAlbumSummary } from '../utils/albumSummary.js';

const { state, playTrack, clearTrack } = usePlayer();
const {
  state: queueState,
  setQueue,
  enqueueTrack,
  removeTrack: removeTrackFromQueue,
} = usePlaybackQueue();
// Also module scope (see usePlaylists.js) — selectedId must survive tab
// switches the same way. Renamed on destructure since this view already
// has its own removeTrack (deletes the file) and a playlist-membership
// remove would otherwise collide with it.
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
// Local, not part of the usePlaylists singleton — losing transient UI mode
// on a tab switch is correct behaviour (there's nothing staged to lose,
// every add/rename applies immediately), not a bug worth hoisting.
const isRenaming = ref(false);
const renameValue = ref('');
const deleteError = ref(null);
const searchQuery = ref('');
const addMenu = ref(null);
const draggingTrackId = ref(null);
const dropTargetTrackId = ref(null);
const dropPosition = ref(null);
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

const PLAYLIST_SORT_KEYS = {
  title: 'title',
  addedAt: 'addedAt',
  duration: 'duration',
};

// Drives the sort-header row via v-for — align: 'end' is the one column
// (duration) that needs both a right-justified header cell
// (playlist-table__sort--duration) and a right-aligned body cell
// (playlist-table__duration, shared with .playlist-track__duration); both
// classes must come from this same entry or the header and body columns
// drift out of alignment.
const SORT_COLUMNS = [
  { key: PLAYLIST_SORT_KEYS.title, label: '曲目' },
  { key: PLAYLIST_SORT_KEYS.addedAt, label: '新增日期' },
  { key: PLAYLIST_SORT_KEYS.duration, label: '時長', align: 'end' },
];

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

function compareText(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    sensitivity: 'base',
  });
}

function compareOptionalValues(a, b, compare, direction) {
  const hasA = a !== null && a !== undefined && a !== '';
  const hasB = b !== null && b !== undefined && b !== '';
  if (hasA && !hasB) return -1;
  if (!hasA && hasB) return 1;
  if (!hasA && !hasB) return 0;
  const result = compare(a, b);
  return direction === 'desc' ? -result : result;
}

function comparePlaylistEntries(a, b) {
  const { key, direction } = playlistSort.value;
  let result = 0;

  if (!key) {
    result = a.playlistIndex - b.playlistIndex;
  } else if (key === PLAYLIST_SORT_KEYS.title) {
    result =
      compareText(a.track.title, b.track.title) ||
      compareText(a.track.artist, b.track.artist);
  } else if (key === PLAYLIST_SORT_KEYS.addedAt) {
    result = compareOptionalValues(
      a.addedAt,
      b.addedAt,
      (dateA, dateB) => new Date(dateA).getTime() - new Date(dateB).getTime(),
      direction,
    );
  } else if (key === PLAYLIST_SORT_KEYS.duration) {
    result = compareOptionalValues(
      Number.isFinite(a.track.duration) ? a.track.duration : null,
      Number.isFinite(b.track.duration) ? b.track.duration : null,
      (durationA, durationB) => durationA - durationB,
      direction,
    );
  }

  if (
    result !== 0 &&
    key !== PLAYLIST_SORT_KEYS.addedAt &&
    key !== PLAYLIST_SORT_KEYS.duration
  ) {
    return direction === 'desc' ? -result : result;
  }
  if (result !== 0) return result;
  return a.playlistIndex - b.playlistIndex;
}

function sortPlaylistEntries(entries) {
  return [...entries].sort(comparePlaylistEntries);
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

  const sorted = sortPlaylistEntries(entries);
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

function formatLongDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours} 小時 ${minutes} 分`;
  if (hours) return `${hours} 小時`;
  return `${minutes} 分`;
}

function formatAddedDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function togglePlaylistSort(key) {
  const current = playlistSort.value;
  if (current.key !== key) {
    playlistSort.value = { key, direction: 'asc' };
  } else if (current.direction === 'asc') {
    playlistSort.value = { key, direction: 'desc' };
  } else {
    playlistSort.value = { key: null, direction: 'asc' };
  }
  clearDragState();
}

function isPlaylistSortActive(key) {
  return playlistSort.value.key === key;
}

function playlistSortLabel(key, label) {
  if (!isPlaylistSortActive(key)) return `${label}排序`;
  return `${label}${playlistSort.value.direction === 'asc' ? '升冪' : '降冪'}排序`;
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

function clearSearch() {
  searchQuery.value = '';
}

function startDrag(track, event) {
  if (!selectedPlaylist.value || !canDragPlaylistRows.value) {
    event.preventDefault();
    return;
  }
  closeAddMenu();
  draggingTrackId.value = track.id;
  dropTargetTrackId.value = null;
  dropPosition.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', track.id);
  }
}

function updateDropTarget(track, event) {
  if (!draggingTrackId.value || draggingTrackId.value === track.id) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

  const rect = event.currentTarget.getBoundingClientRect();
  dropTargetTrackId.value = track.id;
  dropPosition.value =
    event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function leaveDropTarget(track, event) {
  if (
    dropTargetTrackId.value === track.id &&
    !event.currentTarget.contains(event.relatedTarget)
  ) {
    dropTargetTrackId.value = null;
    dropPosition.value = null;
  }
}

function dropTrack(targetTrack, event) {
  event.preventDefault();
  event.stopPropagation();
  const draggedId =
    draggingTrackId.value || event.dataTransfer?.getData('text/plain');
  reorderTrack(draggedId, targetTrack.id, dropPosition.value || 'before');
  clearDragState();
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

function clearDragState() {
  draggingTrackId.value = null;
  dropTargetTrackId.value = null;
  dropPosition.value = null;
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
      <template v-if="selectedPlaylist">
        <section
          class="playlist-hero"
          :aria-label="`${isAlbumSelected ? '專輯' : '播放清單'} ${pageTitle}`"
        >
          <div class="playlist-cover" aria-hidden="true">
            <div
              v-for="track in playlistCoverTracks"
              :key="track.id"
              class="playlist-cover__cell"
            >
              <img
                v-if="track.thumbnailUrl"
                class="playlist-cover__image"
                :src="track.thumbnailUrl"
                alt=""
                aria-hidden="true"
                draggable="false"
              />
              <span v-else>{{ getTrackInitial(track) }}</span>
            </div>
            <div
              v-for="index in playlistCoverEmptySlots"
              :key="index"
              class="playlist-cover__cell playlist-cover__cell--empty"
            >
              <Music2 :size="24" aria-hidden="true" />
            </div>
          </div>

          <div class="playlist-hero__content">
            <p class="playlist-hero__eyebrow">
              {{ isAlbumSelected ? '專輯' : '播放清單' }}
            </p>
            <input
              v-if="isRenaming"
              v-model="renameValue"
              class="rename-input rename-input--hero"
              autofocus
              @keydown.enter="commitRename"
              @keydown.esc="cancelRename"
              @blur="cancelRename"
            />
            <h1 v-else id="playlist-title" class="playlist-hero__title">
              {{ pageTitle }}
            </h1>
            <p class="playlist-hero__meta">{{ playlistMeta }}</p>
          </div>
        </section>

        <section class="playlist-toolbar" aria-label="播放清單操作">
          <div class="playlist-toolbar__actions">
            <button
              type="button"
              class="playlist-play"
              :disabled="playlistTracks.length === 0"
              aria-label="播放此歌單"
              title="播放此歌單"
              @click="playPlaylist"
            >
              <Play :size="18" fill="currentColor" aria-hidden="true" />
            </button>
            <UiButton
              v-if="!isRenaming"
              :icon="Pencil"
              aria-label="重新命名歌單"
              title="重新命名歌單"
              @click="startRename"
            />
            <UiButton
              v-if="!isRenaming"
              :icon="Trash2"
              aria-label="刪除歌單"
              title="刪除歌單(不會刪除音檔)"
              @click="confirmDeletePlaylist()"
            />
          </div>

          <div class="playlist-toolbar__tools">
            <label class="search-box" title="搜尋曲目">
              <Search class="search-box__icon" :size="16" aria-hidden="true" />
              <input
                v-model="searchQuery"
                class="search-box__input"
                type="search"
                placeholder="Search"
                aria-label="搜尋曲目"
              />
              <button
                v-if="searchQuery"
                type="button"
                class="search-box__clear"
                aria-label="清除搜尋"
                title="清除搜尋"
                @click="clearSearch"
              >
                <X :size="16" aria-hidden="true" />
              </button>
            </label>
          </div>
        </section>
      </template>

      <UiPageHeader v-else :title="pageTitle">
        <template #actions>
          <label class="search-box" title="搜尋曲目">
            <Search class="search-box__icon" :size="16" aria-hidden="true" />
            <input
              v-model="searchQuery"
              class="search-box__input"
              type="search"
              placeholder="Search"
              aria-label="搜尋曲目"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="search-box__clear"
              aria-label="清除搜尋"
              title="清除搜尋"
              @click="clearSearch"
            >
              <X :size="16" aria-hidden="true" />
            </button>
          </label>
        </template>
      </UiPageHeader>

      <p v-if="isLoading" class="hint" role="status">載入中…</p>

      <p v-else-if="tracks.length === 0" class="hint">
        還沒有任何曲目——前往「Import」下載歌曲。
      </p>

      <template v-else>
        <p v-if="pageError" class="hint hint--error" role="alert">
          {{ pageError }}
        </p>

        <template v-if="mode === 'all'">
          <p v-if="visibleTracks.length === 0" class="hint">
            找不到符合搜尋的曲目。
          </p>
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
          <p v-if="playlistTracks.length === 0" class="hint">
            這個歌單還沒有曲目。從任一曲目列右鍵加入。
          </p>
          <p v-else-if="visiblePlaylistEntries.length === 0" class="hint">
            找不到符合搜尋的曲目。
          </p>
          <div v-else class="playlist-table" aria-label="播放清單曲目">
            <div class="playlist-table__head">
              <span class="playlist-table__drag"></span>
              <span class="playlist-table__index">#</span>
              <button
                v-for="column in SORT_COLUMNS"
                :key="column.key"
                type="button"
                class="playlist-table__sort"
                :class="{
                  'playlist-table__sort--duration': column.align === 'end',
                  'playlist-table__duration': column.align === 'end',
                  'playlist-table__sort--active': isPlaylistSortActive(
                    column.key,
                  ),
                }"
                :aria-label="playlistSortLabel(column.key, column.label)"
                @click="togglePlaylistSort(column.key)"
              >
                <span>{{ column.label }}</span>
                <span
                  v-if="isPlaylistSortActive(column.key)"
                  class="playlist-table__sort-indicator"
                  :class="{
                    'playlist-table__sort-indicator--desc':
                      playlistSort.direction === 'desc',
                  }"
                ></span>
              </button>
            </div>
            <ul class="playlist-table__body">
              <li
                v-for="{
                  track,
                  visibleIndex,
                  addedAt,
                } in visiblePlaylistEntries"
                :key="track.id"
                class="playlist-track"
                :class="{
                  'playlist-track--active': state.track?.id === track.id,
                  'playlist-track--dragging': draggingTrackId === track.id,
                  'playlist-track--drop-before':
                    dropTargetTrackId === track.id && dropPosition === 'before',
                  'playlist-track--drop-after':
                    dropTargetTrackId === track.id && dropPosition === 'after',
                  'playlist-track--drag-disabled': !canDragPlaylistRows,
                }"
                :draggable="canDragPlaylistRows"
                @click="playRow(track)"
                @contextmenu="openAddMenu(track, $event)"
                @dragstart="startDrag(track, $event)"
                @dragover="updateDropTarget(track, $event)"
                @dragleave="leaveDropTarget(track, $event)"
                @drop="dropTrack(track, $event)"
                @dragend="clearDragState"
              >
                <span
                  class="playlist-track__drag"
                  title="拖曳排序"
                  aria-hidden="true"
                >
                  <GripVertical :size="16" aria-hidden="true" />
                </span>
                <span class="playlist-track__index">{{
                  visibleIndex + 1
                }}</span>
                <span class="playlist-track__main">
                  <span class="playlist-track__thumb" aria-hidden="true">
                    <img
                      v-if="track.thumbnailUrl"
                      class="playlist-track__thumb-image"
                      :src="track.thumbnailUrl"
                      alt=""
                      draggable="false"
                    />
                    <span v-else>{{ getTrackInitial(track) }}</span>
                  </span>
                  <span class="playlist-track__copy">
                    <UiMarqueeText
                      class="playlist-track__title"
                      :text="track.title"
                    />
                    <span v-if="track.artist" class="playlist-track__subtitle">
                      {{ track.artist }}
                    </span>
                  </span>
                </span>
                <span class="playlist-track__added">
                  {{ formatAddedDate(addedAt) }}
                </span>
                <span class="playlist-track__duration">
                  {{ formatDuration(track.duration) }}
                </span>
              </li>
            </ul>
          </div>
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

.playlist-hero {
  display: grid;
  grid-template-columns: 136px minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: end;
  padding: var(--ui-space-5);
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
}

.playlist-cover {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  width: 136px;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  user-select: none;
  -webkit-user-drag: none;
}

.playlist-cover__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  background: var(--ui-surface-hover);
  color: var(--ui-text);
  font-size: var(--ui-text-lg);
  font-weight: var(--ui-font-weight-strong);
  text-transform: uppercase;
}

.playlist-cover__cell:nth-child(2),
.playlist-cover__cell:nth-child(3) {
  background: var(--ui-surface);
  color: var(--ui-text-muted);
}

.playlist-cover__cell--empty {
  color: var(--ui-text-muted);
}

.playlist-cover__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  -webkit-user-drag: none;
}

.playlist-hero__content {
  min-width: 0;
}

.playlist-hero__eyebrow {
  margin: 0 0 var(--ui-space-2);
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
  font-weight: var(--ui-font-weight-strong);
}

.playlist-hero__title {
  margin: 0;
  color: var(--ui-text);
  font-size: var(--ui-text-2xl);
  line-height: 1.05;
  font-weight: var(--ui-font-weight-strong);
  overflow-wrap: anywhere;
}

.playlist-hero__meta {
  margin: var(--ui-space-2) 0 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.playlist-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4) 0;
}

.playlist-toolbar__actions,
.playlist-toolbar__tools {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.playlist-toolbar__tools {
  min-width: 0;
}

.playlist-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
  cursor: pointer;
}

.playlist-play:not(:disabled):hover {
  background: var(--ui-accent-hover);
}

.playlist-play:disabled {
  opacity: 0.5;
  cursor: default;
}

.playlist-play:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}

.rename-input {
  box-sizing: border-box;
  width: 100%;
  max-width: 320px;
  padding: var(--ui-space-1) var(--ui-space-2);
  background: var(--ui-surface);
  color: var(--ui-text);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  font-family: var(--font-ui);
  font-size: var(--ui-text-lg);
  font-weight: var(--ui-font-weight-strong);
}

.rename-input--hero {
  max-width: min(520px, 100%);
  font-size: var(--ui-text-xl);
}

.search-box {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  min-width: 180px;
  padding: var(--ui-space-1) var(--ui-space-2);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  color: var(--ui-text-muted);
}

.search-box__icon {
  flex: 0 0 auto;
}

.search-box__input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  padding: 0;
  background: transparent;
  color: var(--ui-text);
  font-family: var(--font-ui);
  font-size: var(--ui-text-sm);
}

.search-box__input::placeholder {
  color: var(--ui-text-muted);
}

.search-box__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.search-box__clear:hover {
  color: var(--ui-text);
}

.search-box:focus-within {
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
}

.hint {
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.hint--error {
  color: var(--ui-danger);
  font-weight: var(--ui-font-weight-strong);
}

.row-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  /* Never claims space from .ui-track__info's flex:1 — the title is what
     should shrink/truncate first, not the action buttons. */
  flex: 0 0 auto;
}

.playlist-table {
  margin-top: var(--ui-space-2);
  user-select: none;
  -webkit-user-select: none;
}

.playlist-table__head,
.playlist-track {
  display: grid;
  grid-template-columns: 24px 3ch minmax(0, 2fr) minmax(120px, 1fr) 64px;
  gap: var(--ui-space-3);
  align-items: center;
}

.playlist-table__head {
  padding: 0 var(--ui-space-3) var(--ui-space-2);
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.playlist-table__sort {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: var(--ui-space-1);
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.playlist-table__sort:hover,
.playlist-table__sort--active {
  color: var(--ui-text);
}

.playlist-table__sort:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
  border-radius: var(--ui-radius);
}

.playlist-table__sort--duration {
  justify-self: end;
}

.playlist-table__sort-indicator {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--ui-sort-indicator);
}

.playlist-table__sort-indicator--desc {
  transform: rotate(180deg);
}

.playlist-table__duration,
.playlist-track__duration {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.playlist-table__body {
  list-style: none;
  margin: 0;
  padding: var(--ui-space-1) 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.playlist-track {
  position: relative;
  min-height: 52px;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius);
  color: var(--ui-text);
  font-size: var(--ui-text-sm);
  cursor: grab;
}

.playlist-track:active {
  cursor: grabbing;
}

.playlist-track--drag-disabled {
  cursor: pointer;
}

.playlist-track--dragging {
  opacity: 0.45;
}

.playlist-track--drop-before::before,
.playlist-track--drop-after::after {
  content: '';
  position: absolute;
  left: var(--ui-space-3);
  right: var(--ui-space-3);
  height: 2px;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-accent);
  pointer-events: none;
}

.playlist-track--drop-before::before {
  top: -3px;
}

.playlist-track--drop-after::after {
  bottom: -3px;
}

.playlist-track:hover {
  background: var(--ui-surface-hover);
}

.playlist-track--active {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.playlist-track__index,
.playlist-track__added,
.playlist-track__duration {
  color: var(--ui-text-muted);
}

.playlist-track__drag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--ui-text-muted);
}

.playlist-track--active .playlist-track__index,
.playlist-track--active .playlist-track__added,
.playlist-track--active .playlist-track__duration {
  color: inherit;
  opacity: 0.75;
}

.playlist-track--active .playlist-track__drag {
  color: inherit;
  opacity: 0.75;
}

.playlist-track__main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.playlist-track__thumb {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: calc(var(--ui-radius) - 2px);
  background: var(--ui-surface-hover);
  color: var(--ui-text);
  font-size: var(--ui-text-sm);
  font-weight: var(--ui-font-weight-strong);
  overflow: hidden;
  text-transform: uppercase;
  user-select: none;
  -webkit-user-drag: none;
}

.playlist-track__thumb-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  -webkit-user-drag: none;
}

.playlist-track__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.playlist-track__subtitle,
.playlist-track__added {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-track__title {
  font-weight: var(--ui-font-weight-strong);
}

.playlist-track__subtitle {
  color: var(--ui-text-muted);
}

.playlist-track--active .playlist-track__subtitle {
  color: inherit;
  opacity: 0.75;
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
