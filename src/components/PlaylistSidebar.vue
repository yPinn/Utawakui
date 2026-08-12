<script setup>
// Deliberately not built from UiButton for the nav items themselves — same
// reasoning CLAUDE.md gives for AppSidebar.vue's own nav: full-width,
// left-aligned, --ui-text labels, an accent-filled active state. None of
// that matches UiButton's ghost/accent action-button semantics. "新增歌單"
// below is styled as one more row in the same list (thumb + label, Plus
// icon standing in for a cover) rather than a standalone action button, so
// it reads as a placeholder slot at the top of the list instead of a
// disconnected toolbar button.
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
import { usePlaybackQueue } from '../composables/usePlaybackQueue.js';
import { usePlayer } from '../composables/usePlayer.js';
import { usePlaylists } from '../composables/usePlaylists.js';
import { ICON_SIZE } from '../constants/ui.js';
import { deriveAlbumSummary } from '../utils/albumSummary.js';
import { orderPlaylistsForDisplay } from '../utils/playlistOrdering.js';
import { toPlayableTrack } from '../utils/playableTrack.js';
import PlaylistSidebarRow from './PlaylistSidebarRow.vue';
import UiContextMenu from './ui/UiContextMenu.vue';

const props = defineProps({
  // Keyed by track id — same shape as SetlistView.vue's own tracksById,
  // passed down rather than fetched again here (this component has no
  // other consumer, so a second listTracks()/onLibraryUpdated subscription
  // would just duplicate what the parent already has).
  tracksById: { type: Map, default: () => new Map() },
});

const { state, select, create, reorderPlaylist } = usePlaylists();
const { state: playerState, play, pause, playTrack } = usePlayer();
const { state: queueState, setQueue } = usePlaybackQueue();

const emit = defineEmits(['playlistAction']);

// First member track's thumbnail stands in for the playlist's own cover —
// same convention as the Setlist hero's playlist-cover cells. Returns
// undefined for an empty playlist, which the template renders as the
// generic Music2 fallback.
function coverTrackFor(playlist) {
  const firstTrackId = playlist.trackIds[0];
  return firstTrackId ? props.tracksById.get(firstTrackId) : undefined;
}

function memberTracksFor(playlist) {
  return playlist.trackIds
    .map((id) => props.tracksById.get(id))
    .filter(Boolean);
}

// sourceId (usePlaybackQueue.js) is the stable id of the playlist/album the
// current queue was built from — compared against this row's own id, not
// against sourceName (a display string two same-named playlists could
// collide on).
function isActiveSource(playlist) {
  return queueState.sourceId === playlist.id;
}

function isPlayingThis(playlist) {
  return isActiveSource(playlist) && playerState.isPlaying;
}

// Doesn't select/navigate the row — this button is play-only, so its click
// handler stops the event before the row's own @click (selectPlaylist) can
// fire. Resumes/pauses in place when this playlist is already the loaded
// source (same "explicit play()/pause(), not toggle()" reasoning as the
// SMTC integration in usePlayer.js); otherwise builds a fresh queue from
// this playlist's own tracks and starts it — same shape as SetlistView.vue's
// playRow()/playPlaylist(), just sourced from tracksById instead of the
// currently-selected playlist.
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

// Playlists render first, in whatever order state.playlists has them in
// (i.e. whatever the user last dragged them to — see startDrag/dropPlaylist
// below) — mixed-artist by nature, so an alphabetical rule wouldn't mean
// much and manual ordering stays useful. Albums are fixed-ordered by their
// derived artist instead (deliberately NOT draggable: a fixed sort rule
// can't coexist with free manual reordering — a dropped position would
// just get overridden back to sorted order on the next render, so drag
// stays scoped to playlistItems only — see the button elements below, only
// the playlist loop has draggable/@dragstart etc). Shared with
// LyricsWorkspace.vue's playlist <select> via playlistOrdering.js so both
// surfaces present playlists in the same order.
const orderedPlaylists = computed(() =>
  orderPlaylistsForDisplay(state.playlists, props.tracksById),
);
const playlistItems = computed(() => orderedPlaylists.value.playlistItems);
const albumItems = computed(() => orderedPlaylists.value.albumItems);

// Spotify's own library rows show "類型 • 建立者"; there's no owner concept
// here (single-user, local app), so an album substitutes its own derived
// artist (src/utils/albumSummary.js, same helper the Setlist hero uses) in
// that slot instead. A playlist can span many artists, so it just shows
// its kind alone.
function subtitleFor(playlist) {
  if (playlist.kind !== 'album') return '播放清單';
  const { artist } = deriveAlbumSummary(memberTracksFor(playlist));
  return artist ? `專輯・${artist}` : '專輯';
}

const menuContext = ref(null);
const draggingPlaylistId = ref(null);
const dropTargetPlaylistId = ref(null);
const dropPosition = ref(null);

const isMenuOpen = computed(() => Boolean(menuContext.value));
const menuX = computed(() => menuContext.value?.x ?? 0);
const menuY = computed(() => menuContext.value?.y ?? 0);
// Whole-collection version of SetlistView.vue's own single-track "新增至
// 播放清單" submenu (addMenuItems/playlistChildren there) — same shape,
// same reasoning: a fixed "建立新播放清單" entry first, then a divider,
// then every other playlist. Albums are excluded as targets because their
// membership is read-only (see setPlaylistTracks's album no-op in
// electron/lib/playlists.js) — same rule the track-level version uses.
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

function startDrag(playlist, event) {
  if (playlistItems.value.length < 2) {
    event.preventDefault();
    return;
  }

  closePlaylistMenu();
  draggingPlaylistId.value = playlist.id;
  dropTargetPlaylistId.value = null;
  dropPosition.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', playlist.id);
  }
}

function updateDropTarget(playlist, event) {
  if (!draggingPlaylistId.value || draggingPlaylistId.value === playlist.id) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

  const rect = event.currentTarget.getBoundingClientRect();
  dropTargetPlaylistId.value = playlist.id;
  dropPosition.value =
    event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function leaveDropTarget(playlist, event) {
  if (
    dropTargetPlaylistId.value === playlist.id &&
    !event.currentTarget.contains(event.relatedTarget)
  ) {
    dropTargetPlaylistId.value = null;
    dropPosition.value = null;
  }
}

function dropPlaylist(targetPlaylist, event) {
  event.preventDefault();
  event.stopPropagation();
  const draggedId =
    draggingPlaylistId.value || event.dataTransfer?.getData('text/plain');
  reorderPlaylist(draggedId, targetPlaylist.id, dropPosition.value || 'before');
  clearDragState();
}

function clearDragState() {
  draggingPlaylistId.value = null;
  dropTargetPlaylistId.value = null;
  dropPosition.value = null;
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
  border-top: 1px solid var(--ui-border);
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
  font-family: var(--font-ui);
  font-size: var(--ui-text-sm);
  text-align: left;
  cursor: pointer;
}

.playlist-sidebar__item:hover {
  background: var(--ui-surface-hover);
}

.playlist-sidebar__item:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
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
  border-radius: calc(var(--ui-radius) - 2px);
  background: var(--ui-surface-hover);
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
  font-weight: var(--ui-font-weight-strong);
  overflow: hidden;
}

.playlist-sidebar__item--active .playlist-sidebar__thumb {
  color: inherit;
  opacity: 0.85;
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
