<script setup>
import { t } from '../../utils/i18n.js';
// Nav rows are bespoke; UiButton semantics do not match this full-row list.
import {
  Folder,
  FolderInput,
  FolderOpen,
  FolderOutput,
  FolderPlus,
  ICON_SIZE,
  Library,
  ListPlus,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
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
import {
  buildPlaylistTree,
  filterPlaylistTree,
  playlistDropPosition,
  playlistTreeRows,
} from '../../utils/playlistFolders.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import PlaylistFolderNameModal from './PlaylistFolderNameModal.vue';
import PlaylistSidebarRow from './PlaylistSidebarRow.vue';
import { collectionActionMenu } from '../../utils/collectionMenuItems.js';
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

const {
  state,
  select,
  selectArtist,
  create,
  refresh,
  createFolder,
  renameFolder,
  deleteFolder,
  setFolderCollapsed,
  moveItem,
} = usePlaylists();
const { confirm: confirmAction } = useAppConfirmation();
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
  text: t('playlist.sidebar.all'),
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
  text: t('playlist.sidebar.local'),
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
  orderPlaylistsForDisplay(
    state.playlists,
    props.tracksById,
    artistIndexState.index,
  ),
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
  if (playlist.kind !== 'album') return t('playlist.sidebar.playlist');
  const artist = orderedPlaylists.value.albumArtistById.get(playlist.id);
  const label = releaseTypeLabel(playlist.resolvedRelease?.type || 'album');
  return artist ? `${label}${t('common.metaSeparator')}${artist}` : label;
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

function folderMatchesSearch(folder) {
  return searchableText(folder.name).includes(normalizedSearchQuery.value);
}

// Search opens every folder so matches are never hidden by a collapsed one.
const visiblePlaylistRows = computed(() => {
  const tree = buildPlaylistTree(playlistItems.value, state.folderLayout);
  const nodes = hasSearchQuery.value
    ? filterPlaylistTree(tree, playlistMatchesSearch, folderMatchesSearch)
    : tree;
  return playlistTreeRows(
    nodes,
    (folder) => hasSearchQuery.value || !folder.collapsed,
  );
});

function folderRowItem(folder) {
  return { id: folder.id, name: folder.name, kind: 'folder' };
}

function folderSubtitle(row) {
  return t('playlist.folder.count', { count: row.count }, row.count);
}

function toggleFolder(folder) {
  if (hasSearchQuery.value) return;
  closePlaylistMenu();
  setFolderCollapsed(folder.id, !folder.collapsed);
}
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
  if (entry.kind === 'artist') return t('playlist.sidebar.artist');
  const label = releaseTypeLabel(entry.item?.resolvedRelease?.type || 'album');
  return entry.groupName
    ? `${label}${t('common.metaSeparator')}${entry.groupName}`
    : label;
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
    visiblePlaylistRows.value.length > 0 ||
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
      label: t('playlist.sidebar.create'),
      icon: ListPlus,
      value: { action: PLAYLIST_MENU_ACTIONS.createPlaylist },
    },
    {
      id: 'create-folder',
      kind: 'action',
      label: t('playlist.sidebar.createFolder'),
      icon: FolderPlus,
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

  if (context.kind === 'folder') return folderMenuContent(context.folder);

  const menu = collectionActionMenu(state.playlists, context.playlist, {
    performanceQueueBusy: performancePlan.isSaving,
  });
  const folderItems = folderMoveItems(context.playlist);
  if (!folderItems.length) return menu;
  return {
    ...menu,
    groups: menu.groups.map((group) =>
      group.id === 'manage'
        ? { ...group, items: [...group.items, ...folderItems] }
        : group,
    ),
  };
});

function folderMenuContent(folder) {
  return {
    kind: 'actions',
    groups: [
      {
        id: 'manage',
        items: [
          {
            id: 'rename-folder',
            kind: 'action',
            label: t('playlist.folder.rename'),
            icon: Pencil,
            value: {
              action: PLAYLIST_MENU_ACTIONS.renameFolder,
              folderId: folder.id,
            },
          },
        ],
      },
      {
        id: 'destructive',
        items: [
          {
            id: 'delete-folder',
            kind: 'action',
            label: t('playlist.folder.delete'),
            icon: Trash2,
            intent: 'danger',
            value: {
              action: PLAYLIST_MENU_ACTIONS.deleteFolder,
              folderId: folder.id,
            },
          },
        ],
      },
    ],
  };
}

// Only user playlists go into folders; albums are sorted references.
function folderMoveItems(playlist) {
  if (playlist.kind !== 'playlist') return [];
  const folders = state.folderLayout.folders;
  const targets = folders.filter((folder) => folder.id !== playlist.folderId);
  const items = [];
  if (targets.length > 0) {
    items.push({
      id: 'move-to-folder',
      kind: 'submenu',
      label: t('playlist.folder.moveTo'),
      icon: FolderInput,
      content: {
        kind: 'actions',
        groups: [
          {
            id: 'folders',
            items: targets.map((folder) => ({
              id: `folder:${folder.id}`,
              kind: 'action',
              label: folder.name,
              icon: Folder,
              value: {
                action: PLAYLIST_MENU_ACTIONS.moveToFolder,
                playlistId: playlist.id,
                folderId: folder.id,
              },
            })),
          },
        ],
      },
    });
  }
  if (folders.some((folder) => folder.id === playlist.folderId)) {
    items.push({
      id: 'move-out-of-folder',
      kind: 'action',
      label: t('playlist.folder.moveOut'),
      icon: FolderOutput,
      value: {
        action: PLAYLIST_MENU_ACTIONS.moveOutOfFolder,
        playlistId: playlist.id,
        folderId: playlist.folderId,
      },
    });
  }
  return items;
}

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

// The toolbar "+" opens the same create menu under the button.
function openCreateMenu(event) {
  event.stopPropagation();
  const element = event.currentTarget;
  if (menuContext.value?.anchor?.element === element) {
    closePlaylistMenu();
    return;
  }
  menuContext.value = {
    kind: 'global',
    anchor: { kind: 'element', element },
  };
}

const createMenuOpen = computed(
  () => menuContext.value?.anchor?.kind === 'element',
);

function openPlaylistMenu(playlist, event) {
  openMenuAt(event, { kind: 'collection', playlist });
}

function openFolderMenu(folder, event) {
  openMenuAt(event, { kind: 'folder', folder });
}

const renamingFolder = shallowRef(null);
const renamingSaving = shallowRef(false);

async function saveFolderName(name) {
  const folder = renamingFolder.value;
  if (!folder) return;
  renamingSaving.value = true;
  try {
    await renameFolder(folder.id, name);
  } finally {
    renamingSaving.value = false;
    renamingFolder.value = null;
  }
}

async function confirmDeleteFolder(folder) {
  const confirmed = await confirmAction({
    title: t('playlist.folder.deleteTitle'),
    subject: folder.name,
    message: t('playlist.folder.deleteMessage'),
    confirmLabel: t('playlist.folder.delete'),
    intent: 'danger',
  });
  if (confirmed) deleteFolder(folder.id);
}

// Folder actions stay here: no other surface lists folders.
function handleFolderAction(value) {
  const folder = state.folderLayout.folders.find(
    (entry) => entry.id === value.folderId,
  );
  if (value.action === PLAYLIST_MENU_ACTIONS.createFolder) {
    createFolder();
  } else if (!folder) {
    return;
  } else if (value.action === PLAYLIST_MENU_ACTIONS.renameFolder) {
    renamingFolder.value = folder;
  } else if (value.action === PLAYLIST_MENU_ACTIONS.deleteFolder) {
    confirmDeleteFolder(folder);
  } else if (value.action === PLAYLIST_MENU_ACTIONS.moveToFolder) {
    moveItem(value.playlistId, folder.id, 'inside');
  } else if (value.action === PLAYLIST_MENU_ACTIONS.moveOutOfFolder) {
    moveItem(value.playlistId, folder.id, 'after');
  }
}

const FOLDER_ACTIONS = new Set([
  PLAYLIST_MENU_ACTIONS.createFolder,
  PLAYLIST_MENU_ACTIONS.renameFolder,
  PLAYLIST_MENU_ACTIONS.deleteFolder,
  PLAYLIST_MENU_ACTIONS.moveToFolder,
  PLAYLIST_MENU_ACTIONS.moveOutOfFolder,
]);

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
  if (FOLDER_ACTIONS.has(value.action)) {
    handleFolderAction(value);
    return;
  }
  emit('playlistAction', value);
}

function canDragPlaylistItem() {
  return (
    !hasSearchQuery.value &&
    playlistItems.value.length + state.folderLayout.folders.length >= 2
  );
}

function isDraggingFolder(draggedId) {
  return state.folderLayout.folders.some((folder) => folder.id === draggedId);
}

function isDropAt(row, position) {
  return (
    dropTargetPlaylistId.value === row.id && dropPosition.value === position
  );
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
  onReorder: moveItem,
  canDrag: canDragPlaylistItem,
  positionFor: (row, ratio, draggedId) =>
    playlistDropPosition(row, ratio, {
      draggingFolder: isDraggingFolder(draggedId),
    }),
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
    :aria-label="t('playlist.sidebar.filters')"
    @pointerenter="pointerInside = true"
    @pointerleave="pointerInside = false"
  >
    <div class="playlist-sidebar__toolbar">
      <div class="playlist-sidebar__toolbar-expanded">
        <UiSearchBox
          v-model="searchQuery"
          class="playlist-sidebar__search"
          :label="t('playlist.sidebar.searchLabel')"
          :placeholder="t('playlist.sidebar.search')"
          icon-cell
        />
        <UiIconButton
          class="playlist-sidebar__toolbar-action"
          :icon="Plus"
          :label="t('playlist.sidebar.new')"
          variant="command"
          aria-haspopup="menu"
          :aria-expanded="createMenuOpen ? 'true' : 'false'"
          @click="openCreateMenu"
        />
      </div>
      <UiIconButton
        class="playlist-sidebar__toolbar-action playlist-sidebar__toolbar-action--compact"
        :icon="Plus"
        :label="t('playlist.sidebar.new')"
        variant="command"
        aria-haspopup="menu"
        :aria-expanded="createMenuOpen ? 'true' : 'false'"
        @click="openCreateMenu"
      />
    </div>

    <div class="playlist-sidebar__fixed-navigation">
      <button
        v-bind="allTracksTooltipTriggerProps"
        type="button"
        class="playlist-sidebar__item"
        :aria-label="t('playlist.sidebar.all')"
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
          <span class="playlist-sidebar__label">{{
            t('playlist.sidebar.all')
          }}</span>
        </span>
        <UiTooltipSurface
          :open="allTracksTooltipOpen"
          :text="t('playlist.sidebar.all')"
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
        :aria-label="t('playlist.sidebar.local')"
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
          <span class="playlist-sidebar__label">{{
            t('playlist.sidebar.local')
          }}</span>
        </span>
        <UiTooltipSurface
          :open="localTracksTooltipOpen"
          :text="t('playlist.sidebar.local')"
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
      :aria-label="t('playlist.sidebar.collections')"
      :aria-busy="initialLoading || undefined"
      @contextmenu="openGlobalMenu"
    >
      <div
        class="playlist-sidebar__list"
        :class="{ 'ui-loading-content-enter': revealContent }"
        @animationend.self="finishReveal"
      >
        <span v-if="initialLoading" class="ui-visually-hidden" role="status">{{
          t('playlist.sidebar.loading')
        }}</span>
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
            <span class="ui-visually-hidden" role="status">{{
              t('playlist.sidebar.readFailed')
            }}</span>
            <UiIconButton
              class="playlist-sidebar__retry"
              :icon="RefreshCw"
              :label="t('playlist.sidebar.retryRead')"
              @click="refresh"
            />
          </template>
          <UiNotice
            v-else
            tone="danger"
            :title="t('playlist.sidebar.readFailed')"
            :message="state.error"
            :action-label="t('playlist.sidebar.retry')"
            compact
            @action="refresh"
          />
        </template>
        <template
          v-for="row in visiblePlaylistRows"
          :key="`${row.kind}:${row.id}`"
        >
          <PlaylistSidebarRow
            v-if="row.kind === 'folder'"
            :playlist="folderRowItem(row.folder)"
            :empty-icon="row.expanded ? FolderOpen : Folder"
            :subtitle="folderSubtitle(row)"
            :compact="compact"
            :playback-enabled="false"
            expandable
            :expanded="row.expanded"
            :draggable="canDragPlaylistItem()"
            :dragging="draggingPlaylistId === row.id"
            :drop-before="isDropAt(row, 'before')"
            :drop-after="isDropAt(row, 'after')"
            :drop-inside="isDropAt(row, 'inside')"
            @select="toggleFolder(row.folder)"
            @contextmenu="openFolderMenu(row.folder, $event)"
            @drag-start="startDrag(row, $event)"
            @drag-over="updateDropTarget(row, $event)"
            @drag-leave="leaveDropTarget(row, $event)"
            @drop="dropPlaylist(row, $event)"
            @drag-end="clearDragState"
          />
          <p
            v-else-if="row.kind === 'empty'"
            class="playlist-sidebar__empty playlist-sidebar__nested"
            @dragover="updateDropTarget(row, $event)"
            @dragleave="leaveDropTarget(row, $event)"
            @drop="dropPlaylist(row, $event)"
          >
            {{ t('playlist.folder.empty') }}
          </p>
          <PlaylistSidebarRow
            v-else
            :class="{ 'playlist-sidebar__nested': row.folderId }"
            :playlist="row.playlist"
            :cover-url="row.playlist.coverUrl"
            :cover-tracks="coverTracksFor(row.playlist)"
            :subtitle="subtitleFor(row.playlist)"
            :compact="compact"
            :active="row.playlist.id === state.selectedId"
            :active-source="isActiveSource(row.playlist)"
            :playing="isPlayingThis(row.playlist)"
            :draggable="canDragPlaylistItem()"
            :dragging="draggingPlaylistId === row.id"
            :drop-before="isDropAt(row, 'before')"
            :drop-after="isDropAt(row, 'after')"
            @select="selectPlaylist(row.playlist.id)"
            @contextmenu="openPlaylistMenu(row.playlist, $event)"
            @toggle-playback="togglePlayback(row.playlist, $event)"
            @drag-start="startDrag(row, $event)"
            @drag-over="updateDropTarget(row, $event)"
            @drag-leave="leaveDropTarget(row, $event)"
            @drop="dropPlaylist(row, $event)"
            @drag-end="clearDragState"
          />
        </template>

        <hr
          v-if="
            visiblePlaylistRows.length > 0 && visibleReferenceEntries.length > 0
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
          {{ t('playlist.sidebar.noMatch') }}
        </p>
      </div>
    </UiScrollLayout>

    <PlaylistFolderNameModal
      :open="Boolean(renamingFolder)"
      :name="renamingFolder?.name ?? ''"
      :saving="renamingSaving"
      @close="renamingFolder = null"
      @save="saveFolderName"
    />

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

/* Folder members sit one step in from the folder row. */
.playlist-sidebar__list .playlist-sidebar__nested {
  padding-inline-start: calc(
    var(--ui-sidebar-row-padding-inline) + var(--ui-space-4)
  );
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

  .playlist-sidebar__list .playlist-sidebar__nested {
    padding-inline-start: var(--ui-sidebar-row-padding-block);
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
</style>
