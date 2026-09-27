<script setup>
// Nav rows are bespoke; UiButton semantics do not match this full-row list.
import {
  Disc3,
  FolderOpen,
  FolderPlus,
  ICON_SIZE,
  Library,
  ListEnd,
  ListMusic,
  ListPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
} from '../../icons/index.js';
import { computed, ref, shallowRef } from 'vue';
import { useDragReorder } from '../../composables/useDragReorder.js';
import { usePlaybackQueue } from '../../composables/usePlaybackQueue.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { deriveAlbumSummary } from '../../utils/albumSummary.js';
import {
  PLAYLIST_MENU_ACTIONS,
  playlistDisplayName,
  addToPlaylistTargets,
} from '../../utils/playlistMenu.js';
import { orderPlaylistsForDisplay } from '../../utils/playlistOrdering.js';
import { toPlayableTrack } from '../../utils/playableTrack.js';
import PlaylistSidebarRow from './PlaylistSidebarRow.vue';
import UiContextMenu from '../ui/UiContextMenu.vue';

const props = defineProps({
  // Passed from SetlistView to avoid a duplicate library subscription.
  tracksById: { type: Map, default: () => new Map() },
  libraryView: { type: String, default: 'all' },
});

const { state, select, create, reorderPlaylist } = usePlaylists();
const { state: playerState, play, pause, playTrack } = usePlayer();
const { state: queueState, setQueue } = usePlaybackQueue();

const emit = defineEmits([
  'activateSetlist',
  'libraryViewSelect',
  'playlistAction',
]);

// A custom cover (album's own official artwork, or a playlist's manually
// uploaded one — see SetlistPlaylistHeader.vue) always wins; otherwise the
// first 4 member tracks tile into the same UiCollageThumb collage the hero
// shows, so the two can never show a different image.
function coverTracksFor(playlist) {
  return playlist.trackIds
    .slice(0, 4)
    .map((id) => props.tracksById.get(id))
    .filter(Boolean);
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
const searchQuery = shallowRef('');
const normalizedSearchQuery = computed(() =>
  searchQuery.value.trim().toLocaleLowerCase(),
);
const hasSearchQuery = computed(() => normalizedSearchQuery.value.length > 0);

// Album subtitle uses derived artist; mixed playlists show kind only.
function subtitleFor(playlist) {
  if (playlist.kind !== 'album') return '播放清單';
  const { artist } = deriveAlbumSummary(memberTracksFor(playlist));
  return artist ? `專輯・${artist}` : '專輯';
}

function searchableText(value) {
  return String(value ?? '').toLocaleLowerCase();
}

function playlistMatchesSearch(playlist) {
  if (!hasSearchQuery.value) return true;
  const query = normalizedSearchQuery.value;
  if (
    searchableText(playlist.name).includes(query) ||
    searchableText(subtitleFor(playlist)).includes(query)
  ) {
    return true;
  }
  return memberTracksFor(playlist).some((track) =>
    [track.title, track.artist, track.album, track.filename, track.id].some(
      (field) => searchableText(field).includes(query),
    ),
  );
}

const visiblePlaylistItems = computed(() =>
  playlistItems.value.filter(playlistMatchesSearch),
);
const visibleAlbumItems = computed(() =>
  albumItems.value.filter(playlistMatchesSearch),
);
const hasVisibleCollectionItems = computed(
  () =>
    visiblePlaylistItems.value.length > 0 || visibleAlbumItems.value.length > 0,
);

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
      value: {
        action: PLAYLIST_MENU_ACTIONS.createPlaylist,
        sourcePlaylistId: playlist.id,
      },
    },
  ];
  const targets = addToPlaylistTargets(state.playlists, {
    excludeId: playlist.id,
  });
  if (targets.length > 0) {
    children.push({ key: 'targets-divider', separator: true });
  }
  children.push(
    ...targets.map((target) => ({
      key: target.id,
      label: playlistDisplayName(target),
      value: {
        action: PLAYLIST_MENU_ACTIONS.addToPlaylist,
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
      value: {
        action: PLAYLIST_MENU_ACTIONS.addToQueue,
        playlistId: playlist.id,
      },
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
      // An album isn't something the user authored — "移除" (remove from
      // your library), not "刪除" (delete), matches the same distinction
      // Spotify draws between a saved album and a playlist you own.
      label: isAlbum ? '移除' : '刪除',
      icon: Trash2,
      danger: true,
      value: {
        action: PLAYLIST_MENU_ACTIONS.delete,
        playlistId: playlist.id,
      },
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
        value: { action: PLAYLIST_MENU_ACTIONS.createPlaylist },
      },
      {
        key: 'create-folder',
        label: '建立資料夾',
        icon: FolderPlus,
        status: '尚未支援',
        disabled: true,
        value: { action: PLAYLIST_MENU_ACTIONS.createFolder },
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
  emit('activateSetlist');
}

function selectLibraryView(view) {
  closePlaylistMenu();
  select(null);
  emit('libraryViewSelect', view);
  emit('activateSetlist');
}

function createPlaylist() {
  closePlaylistMenu();
  emit('activateSetlist');
  create();
}

function handleMenuSelect(value) {
  closePlaylistMenu();
  emit('playlistAction', value);
}

function canDragPlaylistItem() {
  return !hasSearchQuery.value && playlistItems.value.length >= 2;
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
  <nav class="playlist-sidebar" aria-label="播放清單篩選與集合">
    <div class="playlist-sidebar__toolbar">
      <div class="playlist-sidebar__toolbar-expanded">
        <div class="playlist-sidebar__search" title="搜尋歌單、專輯或曲目">
          <span class="playlist-sidebar__search-icon-slot" aria-hidden="true">
            <Search class="playlist-sidebar__search-icon" :size="ICON_SIZE" />
          </span>
          <input
            v-model="searchQuery"
            class="playlist-sidebar__search-input"
            type="search"
            aria-label="搜尋歌單、專輯或曲目"
            placeholder="搜尋"
          />
        </div>
        <button
          type="button"
          class="playlist-sidebar__toolbar-action"
          aria-label="新增歌單"
          title="新增歌單"
          @click="createPlaylist"
        >
          <Plus :size="ICON_SIZE" aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        class="playlist-sidebar__toolbar-action playlist-sidebar__toolbar-action--compact"
        aria-label="新增歌單"
        title="新增歌單"
        @click="createPlaylist"
      >
        <Plus :size="ICON_SIZE" aria-hidden="true" />
      </button>
    </div>

    <button
      type="button"
      class="playlist-sidebar__item"
      aria-label="全部曲目"
      :class="{
        'playlist-sidebar__item--active':
          state.selectedId === null && libraryView === 'all',
      }"
      :aria-current="
        state.selectedId === null && libraryView === 'all' ? 'page' : undefined
      "
      title="全部曲目"
      @click="selectLibraryView('all')"
    >
      <span
        class="playlist-sidebar__thumb playlist-sidebar__thumb--accent"
        aria-hidden="true"
      >
        <Library :size="ICON_SIZE" aria-hidden="true" />
      </span>
      <span class="playlist-sidebar__info">
        <span class="playlist-sidebar__label">全部曲目</span>
      </span>
    </button>

    <button
      type="button"
      class="playlist-sidebar__item"
      aria-label="本機曲目"
      :class="{
        'playlist-sidebar__item--active':
          state.selectedId === null && libraryView === 'local',
      }"
      :aria-current="
        state.selectedId === null && libraryView === 'local'
          ? 'page'
          : undefined
      "
      title="本機曲目"
      @click="selectLibraryView('local')"
    >
      <span
        class="playlist-sidebar__thumb playlist-sidebar__thumb--accent"
        aria-hidden="true"
      >
        <FolderOpen :size="ICON_SIZE" aria-hidden="true" />
      </span>
      <span class="playlist-sidebar__info">
        <span class="playlist-sidebar__label">本機曲目</span>
      </span>
    </button>

    <hr
      v-if="hasVisibleCollectionItems"
      class="playlist-sidebar__divider"
      aria-hidden="true"
    />

    <PlaylistSidebarRow
      v-for="playlist in visiblePlaylistItems"
      :key="playlist.id"
      :playlist="playlist"
      :cover-url="playlist.coverUrl"
      :cover-tracks="coverTracksFor(playlist)"
      :subtitle="subtitleFor(playlist)"
      :active="playlist.id === state.selectedId"
      :active-source="isActiveSource(playlist)"
      :playing="isPlayingThis(playlist)"
      :draggable="canDragPlaylistItem()"
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
      @drag-start="startDrag(playlist, $event)"
      @drag-over="updateDropTarget(playlist, $event)"
      @drag-leave="leaveDropTarget(playlist, $event)"
      @drop="dropPlaylist(playlist, $event)"
      @drag-end="clearDragState"
    />

    <hr
      v-if="visiblePlaylistItems.length > 0 && visibleAlbumItems.length > 0"
      class="playlist-sidebar__divider"
    />

    <PlaylistSidebarRow
      v-for="playlist in visibleAlbumItems"
      :key="playlist.id"
      :playlist="playlist"
      :cover-url="playlist.coverUrl"
      :cover-tracks="coverTracksFor(playlist)"
      :subtitle="subtitleFor(playlist)"
      :active="playlist.id === state.selectedId"
      :active-source="isActiveSource(playlist)"
      :playing="isPlayingThis(playlist)"
      @select="selectPlaylist(playlist.id)"
      @contextmenu="openPlaylistMenu(playlist, $event)"
      @toggle-playback="togglePlayback(playlist, $event)"
    />

    <p
      v-if="hasSearchQuery && !hasVisibleCollectionItems"
      class="playlist-sidebar__empty"
    >
      沒有符合的集合
    </p>

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
  gap: var(--ui-playlist-list-gap);
}

.playlist-sidebar__divider {
  margin: var(--ui-playlist-section-gap) 0;
  border: none;
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

/* PlaylistSidebarRow.vue owns its own block (.playlist-sidebar-row) for the
   two dynamic loops below — this file's .playlist-sidebar__item/__thumb
   rules are only for the default library rows above, which aren't
   playlists/albums and so aren't rendered through
   PlaylistSidebarRow. The two blocks look similar by design (same visual
   row shape) but are intentionally independent, not a shared name. */
.playlist-sidebar__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ui-playlist-row-gap);
  block-size: var(--ui-playlist-row-min-height);
  min-height: var(--ui-playlist-row-min-height);
  padding: var(--ui-playlist-row-padding-block)
    var(--ui-playlist-row-padding-inline);
  border: var(--ui-border-width) solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  text-align: left;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.playlist-sidebar__item:hover {
  border-color: var(--ui-color-border);
  background: var(--ui-color-surface-hover);
}

.playlist-sidebar__item:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.playlist-sidebar__item--active {
  border-color: transparent;
  background: var(--ui-playlist-row-selected-background);
  color: var(--ui-color-text);
}

.playlist-sidebar__toolbar {
  position: relative;
  block-size: var(--ui-playlist-toolbar-height);
  min-height: var(--ui-playlist-toolbar-height);
  overflow: hidden;
}

.playlist-sidebar__toolbar-expanded {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-playlist-toolbar-gap);
  min-width: 0;
  padding: var(--ui-playlist-toolbar-padding-block)
    var(--ui-playlist-toolbar-padding-inline);
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.playlist-sidebar__search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--ui-playlist-toolbar-gap);
  min-width: 0;
  block-size: var(--ui-playlist-toolbar-control-size);
  min-height: var(--ui-playlist-toolbar-control-size);
  padding: var(--ui-playlist-search-padding-block)
    var(--ui-playlist-search-padding-inline);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.playlist-sidebar__search:focus-within {
  border-color: var(--ui-color-accent);
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.playlist-sidebar__search-icon {
  flex-shrink: 0;
}

.playlist-sidebar__search-icon-slot {
  position: relative;
  display: flex;
  flex: 0 0 var(--ui-playlist-search-icon-slot-size);
  align-items: center;
  justify-content: center;
  inline-size: var(--ui-playlist-search-icon-slot-size);
  block-size: 100%;
  user-select: none;
  -webkit-user-select: none;
}

.playlist-sidebar__search-icon-slot::after {
  content: '';
  position: absolute;
  inset-block: var(--ui-playlist-search-separator-inset-block);
  inset-inline-end: 0;
  width: var(--ui-border-width);
  background: var(--ui-color-border);
}

.playlist-sidebar__search-input {
  flex: 1;
  min-width: 0;
  padding: 0 var(--ui-playlist-search-input-padding-inline-end) 0 0;
  border: none;
  background: transparent;
  color: var(--ui-color-text);
  font: inherit;
  outline: none;
}

.playlist-sidebar__search-input::placeholder {
  color: var(--ui-color-text-muted);
}

.playlist-sidebar__toolbar-action {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: var(--ui-playlist-toolbar-control-size);
  height: var(--ui-playlist-toolbar-control-size);
  padding: 0;
  border: var(--ui-border-width) solid transparent;
  border-radius: var(--ui-radius-sm);
  background: color-mix(
    in srgb,
    var(--ui-color-surface-hover) 88%,
    var(--ui-color-text)
  );
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-label);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.playlist-sidebar__toolbar-expanded,
.playlist-sidebar__toolbar-action--compact {
  transition:
    opacity var(--ui-motion-duration-fast) var(--ui-motion-easing-exit),
    visibility 0s linear 0s;
}

.playlist-sidebar__toolbar-expanded {
  transition:
    opacity var(--ui-motion-duration-standard) var(--ui-motion-easing-enter),
    visibility 0s linear 0s;
}

.playlist-sidebar__toolbar-action--compact {
  position: absolute;
  inset-block-start: calc(
    (
        var(--ui-playlist-toolbar-height) -
          var(--ui-playlist-toolbar-control-size)
      ) /
      2
  );
  /* In expanded geometry the toolbar begins 2px farther right than the
     compact 52px lane. Offset against the row's border-aware inset here,
     then override below inside the compact query, so this fading control
     keeps the artwork centerline instead of jumping by those 2px. */
  inset-inline-start: calc(
    var(--ui-playlist-row-padding-inline) + var(--ui-border-width)
  );
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.playlist-sidebar__toolbar-action:hover {
  border-color: var(--ui-color-border);
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.playlist-sidebar__toolbar-action:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.playlist-sidebar__thumb {
  position: relative;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: var(--ui-playlist-row-thumb-size);
  height: var(--ui-playlist-row-thumb-size);
  border-radius: var(--ui-radius-sm);
  background: color-mix(
    in srgb,
    var(--ui-color-surface-hover) 88%,
    var(--ui-color-text)
  );
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  overflow: hidden;
}

.playlist-sidebar__item--active .playlist-sidebar__thumb {
  color: var(--ui-color-accent);
}

/* Default library entries act like generated covers, not outline buttons. */
.playlist-sidebar__thumb--accent {
  border: var(--ui-border-width) solid transparent;
  background: var(--ui-color-accent);
  color: var(--ui-color-accent-contrast);
}

.playlist-sidebar__item:hover .playlist-sidebar__thumb--accent {
  background: var(--ui-color-accent-hover);
  color: var(--ui-color-accent-contrast);
}

/* Selected accent rows keep the cover visible without becoming a second tab. */
.playlist-sidebar__item--active
  .playlist-sidebar__thumb.playlist-sidebar__thumb--accent {
  background: var(--ui-color-accent-hover);
  color: var(--ui-color-accent-contrast);
  opacity: 1;
}

.playlist-sidebar__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  opacity: 1;
  visibility: visible;
  transition:
    opacity var(--ui-motion-duration-standard) var(--ui-motion-easing-enter),
    visibility 0s linear 0s;
}

/* Only for the plain-text default rows — the dynamic collection rows own
   the same stable ellipsis contract in PlaylistSidebarRow.vue. */
.playlist-sidebar__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.playlist-sidebar__empty {
  margin: var(--ui-space-1) var(--ui-playlist-row-padding-inline);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
}

/* Same compact-sidebar collapse as PlaylistSidebarRow.vue's own
   .playlist-sidebar-row__info rule — see that file's comment for why the
   threshold is a literal px value instead of a custom property. */
@container (width < 256px) {
  .playlist-sidebar__item {
    align-self: center;
    justify-content: center;
    gap: 0;
    inline-size: var(--ui-playlist-row-compact-hit-size);
    block-size: var(--ui-playlist-row-compact-hit-size);
    min-height: var(--ui-playlist-row-compact-hit-size);
    padding: var(--ui-playlist-row-padding-block);
  }

  .playlist-sidebar__info {
    flex: 0 0 0;
    inline-size: 0;
    overflow: hidden;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity var(--ui-motion-duration-fast) var(--ui-motion-easing-exit),
      visibility 0s linear var(--ui-motion-duration-fast);
  }

  .playlist-sidebar__empty {
    display: none;
  }

  .playlist-sidebar__toolbar {
    align-self: center;
    inline-size: var(--ui-playlist-row-min-height);
    block-size: var(--ui-playlist-toolbar-height);
    min-height: var(--ui-playlist-toolbar-height);
  }

  .playlist-sidebar__toolbar-expanded {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .playlist-sidebar__toolbar-action--compact {
    inset-inline-start: calc(
      (
          var(--ui-playlist-row-min-height) -
            var(--ui-playlist-toolbar-control-size)
        ) /
        2
    );
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition:
      opacity var(--ui-motion-duration-standard) var(--ui-motion-easing-enter),
      visibility 0s linear 0s;
  }

  .playlist-sidebar__item--active {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }

  .playlist-sidebar__item--active .playlist-sidebar__thumb {
    box-shadow: 0 0 0 var(--ui-focus-width) var(--ui-color-accent);
  }
}

:global(:root[data-ui-motion='reduced']) .playlist-sidebar__toolbar-expanded,
:global(:root[data-ui-motion='reduced'])
  .playlist-sidebar__toolbar-action--compact,
:global(:root[data-ui-motion='reduced']) .playlist-sidebar__info {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .playlist-sidebar__toolbar-expanded,
  .playlist-sidebar__toolbar-action--compact,
  .playlist-sidebar__info {
    transition: none;
  }
}
</style>
