<script setup>
// Nav rows are bespoke; UiButton semantics do not match this full-row list.
import {
  Disc3,
  Download,
  FolderPlus,
  ListEnd,
  ListMusic,
  ListPlus,
  Music2,
  Pencil,
  Plus,
  Trash2,
} from '@lucide/vue';
import { computed, ref } from 'vue';
import { useDragReorder } from '../../composables/useDragReorder.js';
import { usePlaybackQueue } from '../../composables/usePlaybackQueue.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { ICON_SIZE } from '../../constants/ui.js';
import { deriveAlbumSummary } from '../../utils/albumSummary.js';
import { orderPlaylistsForDisplay } from '../../utils/playlistOrdering.js';
import { toPlayableTrack } from '../../utils/playableTrack.js';
import PlaylistSidebarRow from './PlaylistSidebarRow.vue';
import UiContextMenu from '../ui/UiContextMenu.vue';

const props = defineProps({
  // Passed from SetlistView to avoid a duplicate library subscription.
  tracksById: { type: Map, default: () => new Map() },
});

const { state, select, create, reorderPlaylist } = usePlaylists();
const { state: playerState, play, pause, playTrack } = usePlayer();
const { state: queueState, setQueue } = usePlaybackQueue();

const emit = defineEmits(['playlistAction']);

// First member thumbnail stands in as the playlist cover.
function coverTrackFor(playlist) {
  const firstTrackId = playlist.trackIds[0];
  return firstTrackId ? props.tracksById.get(firstTrackId) : undefined;
}

function memberTracksFor(playlist) {
  return playlist.trackIds
    .map((id) => props.tracksById.get(id))
    .filter(Boolean);
}

// Compare stable sourceId, not display name.
function isActiveSource(playlist) {
  return queueState.sourceId === playlist.id;
}

function isPlayingThis(playlist) {
  return isActiveSource(playlist) && playerState.isPlaying;
}

// Play-only control: stop row navigation, then resume/pause or load this list.
function togglePlayback(playlist, event) {
  event.stopPropagation();
  if (isPlayingThis(playlist)) {
    pause();
    return;
  }
  if (isActiveSource(playlist)) {
    play();
    return;
  }
  const tracks = memberTracksFor(playlist);
  const first = tracks[0];
  if (!first) return;
  setQueue(tracks, first.id, {
    sourceName: playlist.name,
    sourceId: playlist.id,
  });
  playTrack(toPlayableTrack(first));
}

// Playlists keep manual order; albums are sorted and not draggable.
// Shared with LyricsWorkspace.vue through playlistOrdering.js.
const orderedPlaylists = computed(() =>
  orderPlaylistsForDisplay(state.playlists, props.tracksById),
);
const playlistItems = computed(() => orderedPlaylists.value.playlistItems);
const albumItems = computed(() => orderedPlaylists.value.albumItems);

// Album subtitle uses derived artist; mixed playlists show kind only.
function subtitleFor(playlist) {
  if (playlist.kind !== 'album') return '播放清單';
  const { artist } = deriveAlbumSummary(memberTracksFor(playlist));
  return artist ? `專輯・${artist}` : '專輯';
}

const menuContext = ref(null);

const isMenuOpen = computed(() => Boolean(menuContext.value));
const menuX = computed(() => menuContext.value?.x ?? 0);
const menuY = computed(() => menuContext.value?.y ?? 0);
// Albums are excluded because their membership is read-only.
function addToPlaylistChildren(playlist) {
  const children = [
    {
      key: 'create-playlist',
      label: '建立新播放清單',
      icon: Plus,
      value: { action: 'create-playlist', sourcePlaylistId: playlist.id },
    },
  ];
  const targets = state.playlists.filter(
    (candidate) => candidate.kind !== 'album' && candidate.id !== playlist.id,
  );
  if (targets.length > 0) {
    children.push({ key: 'targets-divider', separator: true });
  }
  children.push(
    ...targets.map((target) => ({
      key: target.id,
      label: target.name || '(未命名歌單)',
      value: {
        action: 'add-to-playlist',
        playlistId: playlist.id,
        targetPlaylistId: target.id,
      },
    })),
  );
  return children;
}

const menuItems = computed(() => {
  const playlist = menuContext.value?.playlist;
  if (!playlist) return [];
  const isAlbum = playlist.kind === 'album';

  const items = [
    {
      key: 'add-to-queue',
      label: '新增至佇列',
      icon: ListEnd,
      disabled: playlist.trackIds.length === 0,
      value: { action: 'add-to-queue', playlistId: playlist.id },
    },
  ];

  // Only offered when there's something to add — UiContextMenu opens a
  // submenu on hover regardless of `disabled`, so an empty collection omits
  // `children` entirely rather than showing a disabled trigger that still
  // pops an empty submenu.
  if (playlist.trackIds.length > 0) {
    items.push({
      key: 'add-to-playlist',
      label: '新增至別的播放清單',
      icon: ListPlus,
      children: addToPlaylistChildren(playlist),
      submenuWidth: 240,
    });
  }

  items.push(
    { key: 'manage-divider', separator: true },
    {
      key: 'edit-details',
      label: '編輯詳細資料',
      icon: Pencil,
      value: { action: 'edit-details', playlistId: playlist.id },
    },
    {
      key: 'convert-kind',
      label: isAlbum ? '轉為播放清單' : '轉為專輯',
      icon: isAlbum ? ListMusic : Disc3,
      value: { action: 'convert-kind', playlistId: playlist.id },
    },
    {
      key: 'delete',
      // An album isn't something the user authored — "移除" (remove from
      // your library), not "刪除" (delete), matches the same distinction
      // Spotify draws between a saved album and a playlist you own.
      label: isAlbum ? '移除' : '刪除',
      icon: Trash2,
      danger: true,
      value: { action: 'delete', playlistId: playlist.id },
    },
    {
      key: 'download',
      label: '下載',
      icon: Download,
      status: '尚未支援',
      disabled: true,
      value: { action: 'download', playlistId: playlist.id },
    },
  );

  // Global "create a new one" actions, unrelated to the specific row being
  // right-clicked — scoped to playlists only, matching the Spotify
  // reference (its album menu doesn't offer these either).
  if (!isAlbum) {
    items.push(
      { key: 'create-divider', separator: true },
      {
        key: 'create-playlist',
        label: '建立播放清單',
        icon: ListPlus,
        value: { action: 'create-playlist' },
      },
      {
        key: 'create-folder',
        label: '建立資料夾',
        icon: FolderPlus,
        status: '尚未支援',
        disabled: true,
        value: { action: 'create-folder' },
      },
    );
  }

  return items;
});

function openPlaylistMenu(playlist, event) {
  event.preventDefault();
  event.stopPropagation();
  menuContext.value = { playlist, x: event.clientX, y: event.clientY };
}

function closePlaylistMenu() {
  menuContext.value = null;
}

function selectPlaylist(id) {
  closePlaylistMenu();
  select(id);
}

function handleMenuSelect(value) {
  closePlaylistMenu();
  emit('playlistAction', value);
}

function canDragPlaylistItem() {
  return playlistItems.value.length >= 2;
}

const {
  draggingId: draggingPlaylistId,
  dropTargetId: dropTargetPlaylistId,
  dropPosition,
  startDrag: startDragReorder,
  updateDropTarget,
  leaveDropTarget,
  drop: dropPlaylist,
  clearDragState,
} = useDragReorder({
  onReorder: reorderPlaylist,
  canDrag: canDragPlaylistItem,
});

// closePlaylistMenu() is a caller-side side effect (dismiss any open
// context menu before a drag starts) — not part of the drag gesture
// itself, so it stays here rather than inside the shared composable. Only
// fires when the drag will actually proceed, matching the original
// guard-then-side-effect order (closing the menu on a rejected drag start
// would be an observable behavior change, not a pure refactor).
function startDrag(playlist, event) {
  if (!canDragPlaylistItem()) {
    event.preventDefault();
    return;
  }
  closePlaylistMenu();
  startDragReorder(playlist, event);
}
</script>

<template>
  <nav class="playlist-sidebar">
    <button
      type="button"
      class="playlist-sidebar__item playlist-sidebar__add"
      aria-label="新增歌單"
      title="新增歌單"
      @click="create()"
    >
      <span class="playlist-sidebar__thumb" aria-hidden="true">
        <Plus :size="ICON_SIZE" aria-hidden="true" />
      </span>
      <span class="playlist-sidebar__info">
        <span class="playlist-sidebar__label">新增歌單</span>
      </span>
    </button>

    <button
      type="button"
      class="playlist-sidebar__item"
      :class="{ 'playlist-sidebar__item--active': state.selectedId === null }"
      :aria-current="state.selectedId === null ? 'page' : undefined"
      @click="selectPlaylist(null)"
    >
      <span
        class="playlist-sidebar__thumb playlist-sidebar__thumb--accent"
        aria-hidden="true"
      >
        <Music2 :size="ICON_SIZE" aria-hidden="true" />
      </span>
      <span class="playlist-sidebar__info">
        <span class="playlist-sidebar__label">全部曲目</span>
      </span>
    </button>

    <PlaylistSidebarRow
      v-for="playlist in playlistItems"
      :key="playlist.id"
      :playlist="playlist"
      :cover-track="coverTrackFor(playlist)"
      :subtitle="subtitleFor(playlist)"
      :active="playlist.id === state.selectedId"
      :is-active-source="isActiveSource(playlist)"
      :is-playing="isPlayingThis(playlist)"
      :draggable="playlistItems.length > 1"
      :dragging="draggingPlaylistId === playlist.id"
      :drop-before="
        dropTargetPlaylistId === playlist.id && dropPosition === 'before'
      "
      :drop-after="
        dropTargetPlaylistId === playlist.id && dropPosition === 'after'
      "
      @select="selectPlaylist(playlist.id)"
      @contextmenu="openPlaylistMenu(playlist, $event)"
      @toggle-playback="togglePlayback(playlist, $event)"
      @dragstart="startDrag(playlist, $event)"
      @dragover="updateDropTarget(playlist, $event)"
      @dragleave="leaveDropTarget(playlist, $event)"
      @drop="dropPlaylist(playlist, $event)"
      @dragend="clearDragState"
    />

    <hr
      v-if="playlistItems.length > 0 && albumItems.length > 0"
      class="playlist-sidebar__divider"
    />

    <PlaylistSidebarRow
      v-for="playlist in albumItems"
      :key="playlist.id"
      :playlist="playlist"
      :cover-track="coverTrackFor(playlist)"
      :subtitle="subtitleFor(playlist)"
      :active="playlist.id === state.selectedId"
      :is-active-source="isActiveSource(playlist)"
      :is-playing="isPlayingThis(playlist)"
      @select="selectPlaylist(playlist.id)"
      @contextmenu="openPlaylistMenu(playlist, $event)"
      @toggle-playback="togglePlayback(playlist, $event)"
    />

    <UiContextMenu
      :open="isMenuOpen"
      :x="menuX"
      :y="menuY"
      :items="menuItems"
      @select="handleMenuSelect"
      @close="closePlaylistMenu"
    />
  </nav>
</template>

<style scoped>
.playlist-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.playlist-sidebar__divider {
  margin: var(--ui-space-1) 0;
  border: none;
  border-top: var(--ui-border-width) solid var(--ui-border);
}

/* Shared row styles (base .playlist-sidebar__item, __thumb, __play,
   __info, __kind) live in PlaylistSidebarRow.vue now — both dynamic loops
   below render through that component. The rules kept here
   (.playlist-sidebar__item, __thumb, __thumb--accent) are only for the two
   static rows above ("新增歌單"/"全部曲目"), which aren't playlists/albums
   and so aren't rendered through PlaylistSidebarRow. */
.playlist-sidebar__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2);
  border: none;
  border-radius: var(--ui-radius);
  background: transparent;
  color: var(--ui-text);
  font-family: var(--ui-font);
  font-size: var(--ui-text-sm);
  text-align: left;
  cursor: pointer;
}

.playlist-sidebar__item:hover {
  background: var(--ui-surface-hover);
}

.playlist-sidebar__item:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.playlist-sidebar__item--active {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.playlist-sidebar__thumb {
  position: relative;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-hover);
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
  font-weight: var(--ui-font-weight-strong);
  overflow: hidden;
}

.playlist-sidebar__item--active .playlist-sidebar__thumb {
  color: var(--ui-accent-contrast-muted);
}

/* Distinguishes "全部曲目" from the "新增歌單" row directly above it now
   that both sit at the top of the list with the same neutral thumb style
   otherwise — filled with the theme accent color instead of the shared
   --ui-surface-hover background every other thumb uses. */
.playlist-sidebar__thumb--accent {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

/* When this row is selected, .playlist-sidebar__item--active already fills
   the whole row with --ui-accent — an accent-on-accent thumb would vanish
   into it, so invert the fill instead of just dimming it like the generic
   .playlist-sidebar__item--active .playlist-sidebar__thumb rule does. The
   compound selector (thumb AND thumb--accent on the same element) beats
   that rule's equal-specificity descendant selector regardless of
   source order. */
.playlist-sidebar__item--active
  .playlist-sidebar__thumb.playlist-sidebar__thumb--accent {
  background: var(--ui-accent-contrast);
  color: var(--ui-accent);
  opacity: 1;
}

.playlist-sidebar__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* Only for the plain-text rows ("新增歌單"/"全部曲目") — the two dynamic
   name rows render through PlaylistSidebarRow, which uses UiMarqueeText
   and owns its own overflow/text-overflow/animation internally. */
.playlist-sidebar__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
</style>
