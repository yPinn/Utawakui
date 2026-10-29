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
  RefreshCw,
} from '../../icons/index.js';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { releaseTypeLabel } from '../../utils/releasePresentation.js';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { useCollectionPlayback } from '../../composables/useCollectionPlayback.js';
import { useDragReorder } from '../../composables/useDragReorder.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { usePlaybackHistory } from '../../composables/usePlaybackHistory.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { useDeferredLoading } from '../../composables/useDeferredLoading.js';
import {
  artistSearchTexts,
  deriveArtistPage,
  listSidebarArtists,
  orderReferenceItems,
} from '../../utils/artistPage.js';
import { PLAYLIST_MENU_ACTIONS } from '../../utils/playlistMenu.js';
import { collectionDisplayTrackIds } from '../../utils/albumMembership.js';
import { orderPlaylistsForDisplay } from '../../utils/playlistOrdering.js';
import PlaylistSidebarRow from './PlaylistSidebarRow.vue';
import {
  addToPlaylistMenuItem,
  addToPerformanceQueueMenuItem,
  collectionManageMenuItems,
} from '../../utils/collectionMenuItems.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import '../../styles/loading.css';
import UiNotice from '../ui/UiNotice.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import { useTooltip } from '../ui/useTooltip.js';

const props = defineProps({
  // Passed from the Library shell to avoid a duplicate library subscription.
  tracksById: { type: Map, default: () => new Map() },
  libraryView: { type: String, default: 'all' },
  compact: { type: Boolean, default: false },
  libraryLoading: { type: Boolean, default: false },
});

const { state, select, selectArtist, create, reorderPlaylist, refresh } =
  usePlaylists();
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
  text: '本機檔案',
  placement: 'end',
  disabled: computed(() => !props.compact),
  describedBy: false,
});

// A custom cover (album's own official artwork, or a playlist's manually
// uploaded one — see LibraryEntityDossier.vue) always wins; otherwise the
// first 4 member tracks tile into the same UiCollageThumb collage the hero
// shows, so the two can never show a different image.
function coverTracksFor(playlist) {
  return collectionDisplayTrackIds(playlist)
    .map((id) => props.tracksById.get(id))
    .filter(Boolean)
    .slice(0, 4);
}

function memberTracksFor(playlist) {
  return collectionDisplayTrackIds(playlist)
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
// Shared with LyricsAuthoringWorkspace.vue through playlistOrdering.js.
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
// Search results are not the data-read authority: an unmatched query must
// never turn already-loaded collections back into placeholders.
const initialLoading = computed(
  () =>
    (state.isLoading || props.libraryLoading || artistIndexState.isLoading) &&
    state.playlists.length === 0 &&
    !artistIndexState.index?.artists?.length,
);

// Album subtitle uses derived artist; mixed playlists show kind only.
function subtitleFor(playlist) {
  if (playlist.kind !== 'album') return '播放清單';
  const artist = orderedPlaylists.value.albumArtistById.get(playlist.id);
  const label = releaseTypeLabel(playlist.resolvedRelease?.type || 'album');
  return artist ? `${label}・${artist}` : label;
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

// A qualified play would move the row under the pointer; apply on leave.
const { state: playbackHistoryState } = usePlaybackHistory();
const pointerInside = shallowRef(false);
const shownSourceRecency = shallowRef(playbackHistoryState.sourceRecency);
watch(
  [() => playbackHistoryState.sourceRecency, pointerInside],
  ([recency, inside]) => {
    if (!inside) shownSourceRecency.value = recency;
  },
);

// Albums and artists share one read-only reference tier, grouped by artist.
const visibleReferenceEntries = computed(() =>
  orderReferenceItems({
    albumItems: visibleAlbumItems.value,
    artistItems: visibleArtistItems.value,
    artistIndex: artistIndexState.index,
    tracksById: props.tracksById,
    fallbackAlbumArtistById: orderedPlaylists.value.albumArtistById,
    sourceRecency: shownSourceRecency.value,
  }),
);

function referenceSubtitle(entry) {
  if (entry.kind === 'artist') return '藝人';
  const label = releaseTypeLabel(entry.item?.resolvedRelease?.type || 'album');
  return entry.groupName ? `${label}・${entry.groupName}` : label;
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

const { skeletonVisible, revealContent, finishReveal } = useDeferredLoading(
  initialLoading,
  {
    identity: () => normalizedSearchQuery.value,
    hasContent: () => hasVisibleCollectionItems.value,
  },
);

const menuContext = ref(null);

const isMenuOpen = computed(() => Boolean(menuContext.value));

function createCollectionItems() {
  return [
    {
      id: 'create-playlist',
      kind: 'action',
      label: '建立播放清單',
      icon: ListPlus,
      value: { action: PLAYLIST_MENU_ACTIONS.createPlaylist },
    },
    {
      id: 'create-folder',
      kind: 'action',
      label: '建立資料夾',
      icon: FolderPlus,
      disabledReason: '尚未支援',
      disabled: true,
      value: { action: PLAYLIST_MENU_ACTIONS.createFolder },
    },
  ];
}

const { state: performancePlan } = usePerformanceSessionPlan();

const menuContent = computed(() => {
  const context = menuContext.value;
  if (!context) return { kind: 'actions', groups: [] };
  if (context.kind === 'global') {
    return {
      kind: 'actions',
      groups: [{ id: 'create', items: createCollectionItems() }],
    };
  }

  const playlist = context.playlist;
  const isAlbum = playlist.kind === 'album';

  const primaryItems = [
    {
      id: 'add-to-queue',
      kind: 'action',
      label: '加入一般佇列',
      icon: ListEnd,
      disabled: playlist.trackIds.length === 0,
      value: {
        action: PLAYLIST_MENU_ACTIONS.addToQueue,
        playlistId: playlist.id,
      },
    },
    addToPerformanceQueueMenuItem(playlist, {
      disabled: playlist.trackIds.length === 0 || performancePlan.isSaving,
    }),
  ];

  // Empty collections omit the destination submenu because they contribute
  // no tracks to another playlist.
  if (playlist.trackIds.length > 0) {
    primaryItems.push(
      addToPlaylistMenuItem(state.playlists, playlist, '新增至別的播放清單'),
    );
  }

  const groups = [
    { id: 'primary', items: primaryItems },
    { id: 'manage', items: collectionManageMenuItems(playlist) },
  ];

  // Global "create a new one" actions, unrelated to the specific row being
  // right-clicked — scoped to playlists only, matching the Spotify
  // reference (its album menu doesn't offer these either).
  if (!isAlbum) {
    groups.push({ id: 'create', items: createCollectionItems() });
  }

  return { kind: 'actions', groups };
});

function openMenuAt(event, context) {
  event.preventDefault();
  event.stopPropagation();
  menuContext.value = {
    ...context,
    anchor: { kind: 'point', x: event.clientX, y: event.clientY },
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
  <nav
    class="playlist-sidebar"
    aria-label="播放清單篩選與集合"
    @pointerenter="pointerInside = true"
    @pointerleave="pointerInside = false"
  >
    <div class="playlist-sidebar__toolbar">
      <div class="playlist-sidebar__toolbar-expanded">
        <UiSearchBox
          v-model="searchQuery"
          class="playlist-sidebar__search"
          label="搜尋播放清單、專輯或曲目"
          placeholder="搜尋"
          icon-cell
        />
        <UiIconButton
          class="playlist-sidebar__toolbar-action"
          :icon="Plus"
          label="新增播放清單"
          variant="command"
          @click="createPlaylist"
        />
      </div>
      <UiIconButton
        class="playlist-sidebar__toolbar-action playlist-sidebar__toolbar-action--compact"
        :icon="Plus"
        label="新增播放清單"
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
        aria-label="本機檔案"
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
          <span class="playlist-sidebar__label">本機檔案</span>
        </span>
        <UiTooltipSurface
          :open="localTracksTooltipOpen"
          text="本機檔案"
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
      :aria-busy="initialLoading || undefined"
      @contextmenu="openGlobalMenu"
    >
      <div
        class="playlist-sidebar__list"
        :class="{ 'ui-loading-content-enter': revealContent }"
        @animationend.self="finishReveal"
      >
        <span v-if="initialLoading" class="ui-visually-hidden" role="status"
          >正在讀取播放清單與參照內容</span
        >
        <div
          v-if="initialLoading"
          :class="{ 'playlist-sidebar__skeleton--waiting': !skeletonVisible }"
          aria-hidden="true"
          class="playlist-sidebar__skeleton"
        >
          <div
            v-for="index in 6"
            :key="index"
            class="playlist-sidebar__item playlist-sidebar__skeleton-row"
          >
            <UiSkeleton
              shape="block"
              class="playlist-sidebar__skeleton-thumb"
            />
            <UiSkeleton
              :lines="2"
              pattern="staggered"
              class="playlist-sidebar__info"
            />
          </div>
        </div>
        <template v-else-if="state.error && !state.hasLoaded">
          <template v-if="compact">
            <span class="ui-visually-hidden" role="status"
              >播放清單讀取未完成</span
            >
            <UiIconButton
              class="playlist-sidebar__retry"
              :icon="RefreshCw"
              label="重試讀取播放清單"
              @click="refresh"
            />
          </template>
          <UiNotice
            v-else
            tone="danger"
            title="播放清單讀取未完成"
            :message="state.error"
            action-label="重試"
            compact
            @action="refresh"
          />
        </template>
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
          v-if="!initialLoading && hasSearchQuery && !hasVisibleCollectionItems"
          class="playlist-sidebar__empty"
        >
          找不到符合的項目。
        </p>
      </div>
    </UiScrollLayout>

    <UiActionMenu
      :open="isMenuOpen"
      :anchor="menuContext?.anchor"
      :content="menuContent"
      @select="handleMenuSelect"
      @close="closePlaylistMenu"
    />
  </nav>
</template>

<style scoped>
.playlist-sidebar {
  --ui-playlist-navigation-plate-background: var(--ui-color-entry);
  --ui-playlist-navigation-plate-foreground: var(--ui-color-entry-foreground);

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
  /* Match the collection viewport's reserved visible scrollbar edge. */
  margin-inline-end: calc(
    var(--ui-playlist-row-state-surface-outset-inline) +
      var(--ui-scrollbar-visual-reserve)
  );
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

.playlist-sidebar__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--ui-playlist-list-gap);
}

.playlist-sidebar__retry {
  align-self: center;
}

.playlist-sidebar__skeleton--waiting {
  visibility: hidden;
}

.playlist-sidebar__skeleton-row {
  cursor: default;
  pointer-events: none;
}

.playlist-sidebar__skeleton-thumb {
  --ui-skeleton-block-min-block-size: var(--ui-sidebar-artwork-size);
  flex: 0 0 var(--ui-sidebar-artwork-size);
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
  font-size: var(--ui-type-body-compact-size);
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

.playlist-sidebar__item:where(:hover) .playlist-sidebar__item-state-surface {
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
  background: var(--ui-sidebar-row-selected-background);
}

.playlist-sidebar__item:active .playlist-sidebar__item-state-surface {
  background: var(--ui-color-surface-active);
}

.playlist-sidebar__toolbar {
  position: relative;
  margin-inline-start: var(--ui-playlist-sidebar-padding-inline);
  /* Same visible scrollbar edge as the fixed navigation below. */
  margin-inline-end: calc(
    var(--ui-playlist-row-state-surface-outset-inline) +
      var(--ui-scrollbar-visual-reserve)
  );
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
  --ui-search-box-height-override: var(--ui-sidebar-toolbar-control-size);

  flex: 1;
  min-width: 0;
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
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  overflow: hidden;
}

/* Fixed library functions use a stable filled entry plate. The row owns hover
   and pressed paint; selection is expressed by the row surface. */
.playlist-sidebar__thumb--accent {
  border: var(--ui-border-width) solid
    color-mix(
      in srgb,
      var(--ui-playlist-navigation-plate-foreground) 30%,
      var(--ui-playlist-navigation-plate-background)
    );
  background: var(--ui-playlist-navigation-plate-background);
  background-image: linear-gradient(
    145deg,
    color-mix(
      in srgb,
      var(--ui-playlist-navigation-plate-background) 90%,
      var(--ui-playlist-navigation-plate-foreground)
    ),
    var(--ui-playlist-navigation-plate-background) 48%,
    color-mix(
      in srgb,
      var(--ui-playlist-navigation-plate-background) 75%,
      var(--ui-color-canvas)
    )
  );
  color: var(--ui-playlist-navigation-plate-foreground);
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
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
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
    inline-size: var(--ui-sidebar-row-compact-hit-size);
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
          var(--ui-sidebar-row-compact-hit-size) -
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
