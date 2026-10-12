<script setup>
// Nav rows are bespoke; UiButton semantics do not match this full-row list.
import {
  FolderOpen,
  FolderPlus,
  ICON_SIZE,
  Library,
  ListEnd,
  ListPlus,
  Plus,
  Search,
} from '../../icons/index.js';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { useCollectionPlayback } from '../../composables/useCollectionPlayback.js';
import { useDragReorder } from '../../composables/useDragReorder.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import {
  artistSearchTexts,
  deriveArtistPage,
  listSidebarArtists,
  orderReferenceItems,
} from '../../utils/artistPage.js';
import { PLAYLIST_MENU_ACTIONS } from '../../utils/playlistMenu.js';
import { orderPlaylistsForDisplay } from '../../utils/playlistOrdering.js';
import PlaylistSidebarRow from './PlaylistSidebarRow.vue';
import {
  addToPlaylistMenuItem,
  collectionManageMenuItems,
} from '../../utils/collectionMenuItems.js';
import UiContextMenu from '../ui/UiContextMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import { useTooltip } from '../ui/useTooltip.js';

const props = defineProps({
  // Passed from the Library shell to avoid a duplicate library subscription.
  tracksById: { type: Map, default: () => new Map() },
  libraryView: { type: String, default: 'all' },
  compact: { type: Boolean, default: false },
});

const { state, select, selectArtist, create, reorderPlaylist } = usePlaylists();
const collectionPlayback = useCollectionPlayback();
const {
  state: artistIndexState,
  ensureLoaded: ensureArtistIndex,
  resolvePhotos: resolveArtistPhotos,
} = useArtistIndex();

const emit = defineEmits([
  'activateLibrary',
  'libraryViewSelect',
  'playlistAction',
]);

const {
  open: allTracksTooltipOpen,
  position: allTracksTooltipPosition,
  setTooltip: setAllTracksTooltip,
  tooltipId: allTracksTooltipId,
  triggerProps: allTracksTooltipTriggerProps,
} = useTooltip({
  text: '全部曲目',
  placement: 'end',
  disabled: computed(() => !props.compact),
  describedBy: false,
});

const {
  open: localTracksTooltipOpen,
  position: localTracksTooltipPosition,
  setTooltip: setLocalTracksTooltip,
  tooltipId: localTracksTooltipId,
  triggerProps: localTracksTooltipTriggerProps,
} = useTooltip({
  text: '本機曲目',
  placement: 'end',
  disabled: computed(() => !props.compact),
  describedBy: false,
});

// A custom cover (album's own official artwork, or a playlist's manually
// uploaded one — see LibraryEntityDossier.vue) always wins; otherwise the
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
  return collectionPlayback.isActiveSource(playlist.id);
}

function isPlayingThis(playlist) {
  return collectionPlayback.isPlaying(playlist.id);
}

// Play-only control: stop row navigation, then resume/pause or load this list.
function togglePlayback(playlist, event) {
  event.stopPropagation();
  collectionPlayback.togglePlayback({
    tracks: memberTracksFor(playlist),
    sourceName: playlist.name,
    sourceId: playlist.id,
  });
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
  const artist = orderedPlaylists.value.albumArtistById.get(playlist.id);
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
    [
      track.title,
      ...artistSearchTexts(track, artistIndexState.index),
      track.album,
      track.filename,
      track.id,
    ].some((field) => searchableText(field).includes(query)),
  );
}

const visiblePlaylistItems = computed(() =>
  playlistItems.value.filter(playlistMatchesSearch),
);
const visibleAlbumItems = computed(() =>
  albumItems.value.filter(playlistMatchesSearch),
);
// Artists section (ADR 0022): requested once the library list exists, at idle,
// so the derived index adds no work to app startup.
let artistIndexTimer = null;
watch(
  () => props.tracksById.size > 0,
  (hasTracks) => {
    if (!hasTracks || artistIndexTimer !== null) return;
    artistIndexTimer = setTimeout(ensureArtistIndex, 0);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(artistIndexTimer));

const albumEntries = computed(() =>
  state.playlists
    .filter((playlist) => playlist.kind === 'album')
    .map((collection) => ({ collection, tracks: memberTracksFor(collection) })),
);
const visibleArtistItems = computed(() =>
  listSidebarArtists({
    artistIndex: artistIndexState.index,
    albumEntries: albumEntries.value,
    tracksById: props.tracksById,
    query: normalizedSearchQuery.value,
  }).map((artist) => ({ ...artist, kind: 'artist' })),
);

// Listed artists without a photo ask main for their channel avatar.
watch(
  () =>
    listSidebarArtists({
      artistIndex: artistIndexState.index,
      albumEntries: albumEntries.value,
      tracksById: props.tracksById,
    })
      .filter((artist) => !artist.photoUrl)
      .map((artist) => artist.id)
      .join('\n'),
  (missing) => {
    if (missing) resolveArtistPhotos(missing.split('\n'));
  },
  { immediate: true },
);

// Albums and artists share one read-only reference tier, grouped by artist.
const visibleReferenceEntries = computed(() =>
  orderReferenceItems({
    albumItems: visibleAlbumItems.value,
    artistItems: visibleArtistItems.value,
    artistIndex: artistIndexState.index,
    tracksById: props.tracksById,
    fallbackAlbumArtistById: orderedPlaylists.value.albumArtistById,
  }),
);

function referenceSubtitle(entry) {
  if (entry.kind === 'artist') return '藝人';
  return entry.groupName ? `專輯・${entry.groupName}` : '專輯';
}

function artistTracksFor(artist) {
  return (
    deriveArtistPage({
      artistId: artist.id,
      artistIndex: artistIndexState.index,
      albumEntries: albumEntries.value,
      tracksById: props.tracksById,
    })?.tracks ?? []
  );
}

function toggleArtistPlayback(artist, event) {
  event.stopPropagation();
  collectionPlayback.togglePlayback({
    tracks: artistTracksFor(artist),
    sourceName: artist.name,
    sourceId: artist.id,
  });
}

function selectArtistRow(id) {
  closePlaylistMenu();
  selectArtist(id);
  emit('activateLibrary');
}

// Artist rows are read-only references with no collection menu.
function suppressArtistMenu(event) {
  event.preventDefault();
  event.stopPropagation();
}

const isLibraryViewActive = (view) =>
  state.selectedId === null &&
  state.selectedArtistId === null &&
  props.libraryView === view;

const hasVisibleCollectionItems = computed(
  () =>
    visiblePlaylistItems.value.length > 0 ||
    visibleAlbumItems.value.length > 0 ||
    visibleArtistItems.value.length > 0,
);

const menuContext = ref(null);

const isMenuOpen = computed(() => Boolean(menuContext.value));
const menuX = computed(() => menuContext.value?.x ?? 0);
const menuY = computed(() => menuContext.value?.y ?? 0);

function createCollectionItems() {
  return [
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
  ];
}

const menuItems = computed(() => {
  const context = menuContext.value;
  if (!context) return [];
  if (context.kind === 'global') return createCollectionItems();

  const playlist = context.playlist;
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
    items.push(
      addToPlaylistMenuItem(state.playlists, playlist, '新增至別的播放清單'),
    );
  }

  items.push(
    { key: 'manage-divider', separator: true },
    ...collectionManageMenuItems(playlist),
  );

  // Global "create a new one" actions, unrelated to the specific row being
  // right-clicked — scoped to playlists only, matching the Spotify
  // reference (its album menu doesn't offer these either).
  if (!isAlbum) {
    items.push(
      { key: 'create-divider', separator: true },
      ...createCollectionItems(),
    );
  }

  return items;
});

function openMenuAt(event, context) {
  event.preventDefault();
  event.stopPropagation();
  menuContext.value = {
    ...context,
    x: event.clientX,
    y: event.clientY,
  };
}

function openGlobalMenu(event) {
  openMenuAt(event, { kind: 'global' });
}

function openPlaylistMenu(playlist, event) {
  openMenuAt(event, { kind: 'collection', playlist });
}

function closePlaylistMenu() {
  menuContext.value = null;
}

function selectPlaylist(id) {
  closePlaylistMenu();
  select(id);
  emit('activateLibrary');
}

function selectLibraryView(view) {
  closePlaylistMenu();
  select(null);
  emit('libraryViewSelect', view);
  emit('activateLibrary');
}

function createPlaylist() {
  closePlaylistMenu();
  emit('activateLibrary');
  create();
}

function handleMenuSelect(value) {
  const contextKind = menuContext.value?.kind;
  closePlaylistMenu();
  if (
    contextKind === 'global' &&
    value.action === PLAYLIST_MENU_ACTIONS.createPlaylist
  ) {
    emit('activateLibrary');
    create();
    return;
  }
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
        <div class="playlist-sidebar__search">
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
        <UiIconButton
          class="playlist-sidebar__toolbar-action"
          :icon="Plus"
          label="新增歌單"
          variant="command"
          @click="createPlaylist"
        />
      </div>
      <UiIconButton
        class="playlist-sidebar__toolbar-action playlist-sidebar__toolbar-action--compact"
        :icon="Plus"
        label="新增歌單"
        variant="command"
        @click="createPlaylist"
      />
    </div>

    <div class="playlist-sidebar__fixed-navigation">
      <button
        v-bind="allTracksTooltipTriggerProps"
        type="button"
        class="playlist-sidebar__item"
        aria-label="全部曲目"
        :class="{
          'playlist-sidebar__item--active': isLibraryViewActive('all'),
        }"
        :aria-current="isLibraryViewActive('all') ? 'page' : undefined"
        @click="selectLibraryView('all')"
        @contextmenu="openGlobalMenu"
      >
        <span
          class="playlist-sidebar__item-state-surface"
          aria-hidden="true"
        ></span>
        <span
          class="playlist-sidebar__thumb playlist-sidebar__thumb--accent"
          aria-hidden="true"
        >
          <Library :size="ICON_SIZE" aria-hidden="true" />
        </span>
        <span class="playlist-sidebar__info">
          <span class="playlist-sidebar__label">全部曲目</span>
        </span>
        <UiTooltipSurface
          :open="allTracksTooltipOpen"
          text="全部曲目"
          :tooltip-id="allTracksTooltipId"
          :position="allTracksTooltipPosition"
          placement="end"
          :set-element="setAllTracksTooltip"
        />
      </button>

      <button
        v-bind="localTracksTooltipTriggerProps"
        type="button"
        class="playlist-sidebar__item"
        aria-label="本機曲目"
        :class="{
          'playlist-sidebar__item--active': isLibraryViewActive('local'),
        }"
        :aria-current="isLibraryViewActive('local') ? 'page' : undefined"
        @click="selectLibraryView('local')"
        @contextmenu="openGlobalMenu"
      >
        <span
          class="playlist-sidebar__item-state-surface"
          aria-hidden="true"
        ></span>
        <span
          class="playlist-sidebar__thumb playlist-sidebar__thumb--accent"
          aria-hidden="true"
        >
          <FolderOpen :size="ICON_SIZE" aria-hidden="true" />
        </span>
        <span class="playlist-sidebar__info">
          <span class="playlist-sidebar__label">本機曲目</span>
        </span>
        <UiTooltipSurface
          :open="localTracksTooltipOpen"
          text="本機曲目"
          :tooltip-id="localTracksTooltipId"
          :position="localTracksTooltipPosition"
          placement="end"
          :set-element="setLocalTracksTooltip"
        />
      </button>

      <hr
        v-if="hasVisibleCollectionItems"
        class="playlist-sidebar__divider"
        aria-hidden="true"
      />
    </div>

    <UiScrollLayout
      class="playlist-sidebar__scroll"
      axis="vertical"
      :scrollbar-visibility="compact ? 'hidden' : 'auto'"
      tabindex="0"
      aria-label="播放清單與參照內容"
      @contextmenu="openGlobalMenu"
    >
      <div class="playlist-sidebar__list">
        <PlaylistSidebarRow
          v-for="playlist in visiblePlaylistItems"
          :key="playlist.id"
          :playlist="playlist"
          :cover-url="playlist.coverUrl"
          :cover-tracks="coverTracksFor(playlist)"
          :subtitle="subtitleFor(playlist)"
          :compact="compact"
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
          v-if="
            visiblePlaylistItems.length > 0 &&
            visibleReferenceEntries.length > 0
          "
          class="playlist-sidebar__divider"
        />

        <template
          v-for="entry in visibleReferenceEntries"
          :key="`${entry.kind}:${entry.item.id}`"
        >
          <PlaylistSidebarRow
            v-if="entry.kind === 'artist'"
            :playlist="entry.item"
            :cover-url="entry.item.photoUrl"
            :subtitle="referenceSubtitle(entry)"
            :compact="compact"
            :active="entry.item.id === state.selectedArtistId"
            :active-source="collectionPlayback.isActiveSource(entry.item.id)"
            :playing="collectionPlayback.isPlaying(entry.item.id)"
            @select="selectArtistRow(entry.item.id)"
            @contextmenu="suppressArtistMenu"
            @toggle-playback="toggleArtistPlayback(entry.item, $event)"
          />
          <PlaylistSidebarRow
            v-else
            :playlist="entry.item"
            :cover-url="entry.item.coverUrl"
            :cover-tracks="coverTracksFor(entry.item)"
            :subtitle="referenceSubtitle(entry)"
            :compact="compact"
            :active="entry.item.id === state.selectedId"
            :active-source="isActiveSource(entry.item)"
            :playing="isPlayingThis(entry.item)"
            @select="selectPlaylist(entry.item.id)"
            @contextmenu="openPlaylistMenu(entry.item, $event)"
            @toggle-playback="togglePlayback(entry.item, $event)"
          />
        </template>

        <p
          v-if="hasSearchQuery && !hasVisibleCollectionItems"
          class="playlist-sidebar__empty"
        >
          沒有符合的集合
        </p>
      </div>
    </UiScrollLayout>

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
  --ui-playlist-navigation-plate-background: var(--ui-color-entry);
  --ui-playlist-navigation-plate-foreground: var(--ui-color-entry-foreground);
  --ui-playlist-navigation-active-indicator: var(
    --ui-color-entry-selected-indicator
  );

  box-sizing: border-box;
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  padding-block-start: var(--ui-playlist-sidebar-padding-block);
}

.playlist-sidebar__fixed-navigation {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--ui-playlist-list-gap);
  margin-block-start: var(--ui-playlist-list-gap);
  margin-inline-start: var(--ui-playlist-sidebar-padding-inline);
  margin-inline-end: var(--ui-playlist-row-state-surface-outset-inline);
}

.playlist-sidebar__scroll {
  --ui-scroll-layout-padding-block-start: var(--ui-playlist-list-gap);
  --ui-scroll-layout-padding-block-end: var(
    --ui-playlist-sidebar-padding-block
  );
  --ui-scroll-layout-padding-inline-start: var(
    --ui-playlist-sidebar-padding-inline
  );
  --ui-scroll-layout-padding-inline-end: var(
    --ui-playlist-row-state-surface-outset-inline
  );

  min-height: 0;
  flex: 1;
}

.playlist-sidebar__list {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--ui-playlist-list-gap);
}

.playlist-sidebar__divider {
  margin-block: calc(
    var(--ui-playlist-section-gap) - var(--ui-playlist-list-gap)
  );
  margin-inline: 0;
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
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: var(--ui-sidebar-row-gap);
  block-size: var(--ui-sidebar-row-min-height);
  min-height: var(--ui-sidebar-row-min-height);
  padding: var(--ui-sidebar-row-padding-block)
    var(--ui-sidebar-row-padding-inline);
  border: var(--ui-border-width) solid transparent;
  border-radius: var(--ui-side-panel-row-radius);
  background: transparent;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  text-align: left;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.playlist-sidebar__item-state-surface {
  position: absolute;
  inset-block: 0;
  inset-inline: calc(-1 * var(--ui-playlist-row-state-surface-outset-inline));
  z-index: var(--ui-layer-base);
  border: var(--ui-border-width) solid transparent;
  border-radius: inherit;
  background: transparent;
  pointer-events: none;
}

.playlist-sidebar__item:hover .playlist-sidebar__item-state-surface {
  background: var(--ui-color-surface-hover);
}

.playlist-sidebar__item:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.playlist-sidebar__item--active {
  color: var(--ui-color-text);
}

.playlist-sidebar__item--active .playlist-sidebar__item-state-surface {
  border-color: transparent;
  background: var(--ui-sidebar-row-selected-bg);
}

.playlist-sidebar__item:active .playlist-sidebar__item-state-surface {
  background: var(--ui-color-surface-active);
}

.playlist-sidebar__toolbar {
  position: relative;
  margin-inline: var(--ui-playlist-sidebar-padding-inline);
  block-size: var(--ui-sidebar-toolbar-block-size);
  min-height: var(--ui-sidebar-toolbar-block-size);
  overflow: hidden;
}

.playlist-sidebar__toolbar-expanded {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-sidebar-toolbar-gap);
  min-width: 0;
  padding: var(--ui-sidebar-toolbar-padding-block)
    var(--ui-sidebar-toolbar-padding-inline);
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.playlist-sidebar__search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--ui-sidebar-toolbar-gap);
  min-width: 0;
  block-size: var(--ui-sidebar-toolbar-control-size);
  min-height: var(--ui-sidebar-toolbar-control-size);
  padding: var(--ui-sidebar-search-padding-block)
    var(--ui-sidebar-search-padding-inline);
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
  flex: 0 0 var(--ui-sidebar-search-icon-inline-size);
  align-items: center;
  justify-content: center;
  inline-size: var(--ui-sidebar-search-icon-inline-size);
  block-size: 100%;
  user-select: none;
  -webkit-user-select: none;
}

.playlist-sidebar__search-icon-slot::after {
  content: '';
  position: absolute;
  inset-block: var(--ui-sidebar-search-separator-inset-block);
  inset-inline-end: 0;
  width: var(--ui-border-width);
  background: var(--ui-color-border);
}

.playlist-sidebar__search-input {
  flex: 1;
  min-width: 0;
  padding: 0 var(--ui-sidebar-search-input-padding-inline-end) 0 0;
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
  --ui-icon-button-size-override: var(--ui-sidebar-toolbar-control-size);
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
        var(--ui-sidebar-toolbar-block-size) -
          var(--ui-sidebar-toolbar-control-size)
      ) /
      2
  );
  inset-inline-start: calc(
    var(--ui-sidebar-row-padding-inline) + var(--ui-border-width)
  );
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.playlist-sidebar__thumb {
  position: relative;
  z-index: var(--ui-layer-raised);
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: var(--ui-sidebar-artwork-size);
  height: var(--ui-sidebar-artwork-size);
  border-radius: var(--ui-radius-sm);
  background: color-mix(
    in srgb,
    var(--ui-color-surface-hover) 88%,
    var(--ui-color-text)
  );
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  overflow: hidden;
}

/* Fixed library functions use a stable filled entry plate. The row owns hover
   and pressed paint; the plate only adds a selected-state indicator. */
.playlist-sidebar__thumb--accent {
  border: var(--ui-border-width) solid transparent;
  background: var(--ui-playlist-navigation-plate-background);
  color: var(--ui-playlist-navigation-plate-foreground);
}

.playlist-sidebar__item--active
  .playlist-sidebar__thumb.playlist-sidebar__thumb--accent {
  box-shadow: 0 0 0 var(--ui-focus-width)
    var(--ui-playlist-navigation-active-indicator);
}

.playlist-sidebar__info {
  position: relative;
  z-index: var(--ui-layer-raised);
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
  margin: 0;
  padding: var(--ui-space-1) var(--ui-sidebar-row-padding-inline);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
}

/* Same compact-sidebar collapse as PlaylistSidebarRow.vue's own
   .playlist-sidebar-row__info rule — see that file's comment for why the
   threshold is a literal px value instead of a custom property. */
@container (width < 256px) {
  .playlist-sidebar__fixed-navigation {
    margin-inline: var(--ui-playlist-sidebar-padding-inline-compact);
  }

  .playlist-sidebar__scroll {
    --ui-scroll-layout-padding-inline-start: var(
      --ui-playlist-sidebar-padding-inline-compact
    );
    --ui-scroll-layout-padding-inline-end: var(
      --ui-playlist-sidebar-padding-inline-compact
    );
  }

  .playlist-sidebar__item {
    align-self: center;
    justify-content: center;
    gap: 0;
    inline-size: var(--ui-sidebar-row-compact-hit-size);
    block-size: var(--ui-sidebar-row-compact-hit-size);
    min-height: var(--ui-sidebar-row-compact-hit-size);
    padding: var(--ui-sidebar-row-padding-block);
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

  .playlist-sidebar__item-state-surface {
    inset-inline: 0;
  }

  .playlist-sidebar__empty {
    display: none;
  }

  .playlist-sidebar__toolbar {
    align-self: center;
    margin-inline: var(--ui-playlist-sidebar-padding-inline-compact);
    inline-size: var(--ui-sidebar-row-min-height);
    block-size: var(--ui-sidebar-toolbar-block-size);
    min-height: var(--ui-sidebar-toolbar-block-size);
  }

  .playlist-sidebar__toolbar-expanded {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .playlist-sidebar__toolbar-action--compact {
    inset-inline-start: calc(
      (
          var(--ui-sidebar-row-min-height) -
            var(--ui-sidebar-toolbar-control-size)
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

  .playlist-sidebar__item--active .playlist-sidebar__item-state-surface {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
}

:global(:root[data-ui-motion='reduced'] .playlist-sidebar__toolbar-expanded),
:global(
  :root[data-ui-motion='reduced'] .playlist-sidebar__toolbar-action--compact
),
:global(:root[data-ui-motion='reduced'] .playlist-sidebar__info) {
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
