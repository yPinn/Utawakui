<script setup>
import { t } from '../../utils/i18n.js';
// Nav rows are bespoke; UiButton semantics do not match this full-row list.
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Folder,
  FolderInput,
  FolderOpen,
  FolderOutput,
  FolderPlus,
  Library,
  ListPlus,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  StickyNote,
  Trash2,
} from '../../icons/index.js';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { releaseTypeLabel } from '../../utils/releasePresentation.js';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { useAppView } from '../../composables/useAppView.js';
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
import {
  PLAYLIST_MENU_ACTIONS,
  playlistDisplayName,
} from '../../utils/playlistMenu.js';
import { collectionDisplayTrackIds } from '../../utils/albumMembership.js';
import { orderPlaylistsForDisplay } from '../../utils/playlistOrdering.js';
import {
  buildPlaylistTree,
  filterPlaylistTree,
  playlistDropPosition,
  playlistTreeRows,
} from '../../utils/playlistFolders.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useCollectionDrag } from '../../composables/useCollectionDrag.js';
import PlaylistFolderNameModal from './PlaylistFolderNameModal.vue';
import PlaylistSidebarRow from './PlaylistSidebarRow.vue';
import { collectionActionMenu } from '../../utils/collectionMenuItems.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import { PLAYLIST_ROW_THUMB_SIZE } from '../../constants/ui.js';
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
  expandFolder,
  moveItem,
  createPlaylistAt,
  enterFolder,
  leaveFolder,
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

const openFolder = computed(
  () =>
    state.folderLayout.folders.find(
      (folder) => folder.id === state.openFolderId,
    ) ?? null,
);

// The upper tier is the user's playlists and folders; albums stay below.
const playlistsById = computed(
  () => new Map(state.playlists.map((playlist) => [playlist.id, playlist])),
);

function folderMembers(folderId) {
  const folder = state.folderLayout.folders.find(
    (entry) => entry.id === folderId,
  );
  return (folder?.items ?? [])
    .map((id) => playlistsById.value.get(id))
    .filter(Boolean);
}

function folderHolding(playlistId) {
  return state.folderLayout.folders.find((folder) =>
    folder.items?.includes(playlistId),
  );
}

// Inside a folder only its members list; search narrows them in place.
function openFolderRows(folder) {
  const members = folderMembers(folder.id).filter(playlistMatchesSearch);
  if (!members.length && !hasSearchQuery.value) {
    return [{ kind: 'empty-view', id: folder.id }];
  }
  return members.map((playlist) => ({
    kind: 'playlist',
    key: `${folder.id}:${playlist.id}`,
    id: playlist.id,
    playlist,
    folderId: folder.id,
  }));
}

// One folder at most is open in place (older files may mark several; the
// first wins). Search opens every folder so matches are never hidden, and
// the narrow rail shows folders only; a click there steps inside instead.
const expandedFolderId = computed(
  () => state.folderLayout.folders.find((folder) => !folder.collapsed)?.id,
);

function isFolderExpanded(folder) {
  if (props.compact) return false;
  return hasSearchQuery.value || folder.id === expandedFolderId.value;
}

const visiblePlaylistRows = computed(() => {
  if (openFolder.value) return openFolderRows(openFolder.value);
  const tree = buildPlaylistTree(state.playlists, state.folderLayout);
  const nodes = hasSearchQuery.value
    ? filterPlaylistTree(tree, playlistMatchesSearch, folderMatchesSearch)
    : tree;
  return playlistTreeRows(nodes, isFolderExpanded);
});

// The three folder hues shared with the destination tabs.
const FOLDER_TONES = [
  {
    background: 'var(--ui-color-folder-primary)',
    color: 'var(--ui-color-folder-primary-foreground)',
  },
  {
    background: 'var(--ui-color-folder-secondary)',
    color: 'var(--ui-color-folder-secondary-foreground)',
  },
  {
    background: 'var(--ui-color-folder-tertiary)',
    color: 'var(--ui-color-folder-tertiary-foreground)',
  },
];

function folderTone(folder) {
  return FOLDER_TONES[folder.color] ?? FOLDER_TONES[0];
}

function folderRowItem(folder) {
  return { id: folder.id, name: folder.name, kind: 'folder' };
}

function folderSubtitle(row) {
  return t('playlist.folder.count', { count: row.count }, row.count);
}

function toggleFolder(folder) {
  if (hasSearchQuery.value) return;
  closePlaylistMenu();
  expandFolder(isFolderExpanded(folder) ? null : folder.id);
}

function folderToggleLabel(row) {
  return t(
    row.expanded
      ? 'playlist.folder.collapseNamed'
      : 'playlist.folder.expandNamed',
    { name: row.folder.name },
  );
}

function openFolderView(folder) {
  closePlaylistMenu();
  enterFolder(folder.id);
}

function closeFolderView() {
  closePlaylistMenu();
  leaveFolder();
}

// A folder plays its playlists one after another, in sidebar order.
function folderTracks(folderId) {
  return folderMembers(folderId).flatMap(memberTracksFor);
}

function toggleFolderPlayback(folder, event) {
  event?.stopPropagation();
  collectionPlayback.togglePlayback({
    tracks: folderTracks(folder.id),
    sourceName: folder.name,
    sourceId: folder.id,
  });
}

function playFolder(folder) {
  if (collectionPlayback.isPlaying(folder.id)) return;
  toggleFolderPlayback(folder);
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
  openFolder.value
    ? []
    : orderReferenceItems({
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
    visibleReferenceEntries.value.length > 0,
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
  const createPlaylistItem = {
    id: 'create-playlist',
    kind: 'action',
    label: t('playlist.sidebar.create'),
    icon: ListPlus,
    value: { action: PLAYLIST_MENU_ACTIONS.createPlaylist },
  };
  if (openFolder.value) return [createPlaylistItem];
  return [
    createPlaylistItem,
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
const { activeView, libraryWorkspace, openPerformanceArchiveIndex } =
  useAppView();
const archiveRow = {
  id: 'performance-records',
  name: t('session.archive.records'),
};

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
  const isEmpty = folderTracks(folder.id).length === 0;
  return {
    kind: 'actions',
    groups: [
      {
        id: 'primary',
        items: [
          {
            id: 'play-folder',
            kind: 'action',
            label: t('playlist.folder.play'),
            icon: Play,
            disabled: isEmpty,
            value: {
              action: PLAYLIST_MENU_ACTIONS.playFolder,
              folderId: folder.id,
            },
          },
          {
            id: 'create-playlist-in-folder',
            kind: 'action',
            label: t('playlist.folder.createHere'),
            icon: ListPlus,
            value: {
              action: PLAYLIST_MENU_ACTIONS.createPlaylistInFolder,
              folderId: folder.id,
            },
          },
        ],
      },
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

// A playlist moves between folders. An album gets one shortcut per folder;
// `fromFolderId` is the folder whose shortcut row opened the menu.
function folderMoveItems(playlist) {
  const isAlbum = playlist.kind === 'album';
  const folders = state.folderLayout.folders;
  const holder = isAlbum ? null : folderHolding(playlist.id);
  const targets = folders.filter((folder) => folder.id !== holder?.id);
  const items = [];
  if (targets.length > 0) {
    items.push({
      id: 'move-to-folder',
      kind: 'submenu',
      label: isAlbum ? t('playlist.folder.addTo') : t('playlist.folder.moveTo'),
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
              value: isAlbum
                ? copyToFolderValue(
                    playlist,
                    folder,
                    { id: folder.id },
                    'inside',
                  )
                : {
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
  if (holder) {
    items.push({
      id: 'move-out-of-folder',
      kind: 'action',
      label: t('playlist.folder.moveOut'),
      icon: FolderOutput,
      value: {
        action: PLAYLIST_MENU_ACTIONS.moveOutOfFolder,
        playlistId: playlist.id,
        folderId: holder.id,
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

// Button menus open under their button; a second press closes them.
function openMenuFrom(event, trigger, context) {
  event.stopPropagation();
  if (menuContext.value?.trigger === trigger) {
    closePlaylistMenu();
    return;
  }
  menuContext.value = {
    ...context,
    trigger,
    anchor: { kind: 'element', element: event.currentTarget },
  };
}

// The toolbar "+" opens the same create menu as the blank area.
function openCreateMenu(event) {
  openMenuFrom(event, 'create', { kind: 'global' });
}

// Inside a folder, "..." offers the folder's own context menu.
function openFolderMoreMenu(event) {
  openMenuFrom(event, 'folder-more', {
    kind: 'folder',
    folder: openFolder.value,
  });
}

const createMenuOpen = computed(() => menuContext.value?.trigger === 'create');
const folderMoreMenuOpen = computed(
  () => menuContext.value?.trigger === 'folder-more',
);

function openPlaylistMenu(playlist, event) {
  openMenuAt(event, { kind: 'collection', playlist });
}

// An album copied into a folder becomes a new playlist with its tracks; the
// shared action resolves the tracks and reports where it went.
function copyToFolderValue(album, folder, target, position) {
  return {
    action: PLAYLIST_MENU_ACTIONS.copyToFolder,
    playlistId: album.id,
    folderName: folder.name,
    target,
    position,
  };
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

// The folder's playlists are deleted with it, so the dialog counts them.
async function confirmDeleteFolder(folder) {
  const count = folderMembers(folder.id).length;
  // An empty folder takes nothing with it, so it goes without asking. The
  // dialog requires a message and would otherwise refuse silently.
  const confirmed =
    count === 0 ||
    (await confirmAction({
      title: t('playlist.folder.deleteTitle'),
      subject: folder.name,
      meta: t('playlist.folder.count', { count }, count),
      message: t('playlist.folder.deleteMessage'),
      detail: t('playlist.actions.irreversible'),
      confirmLabel: t('playlist.folder.delete'),
      intent: 'danger',
    }));
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
    moveItem({ id: value.playlistId }, { id: folder.id }, 'inside');
  } else if (value.action === PLAYLIST_MENU_ACTIONS.moveOutOfFolder) {
    moveItem({ id: value.playlistId }, { id: folder.id }, 'after');
  } else if (value.action === PLAYLIST_MENU_ACTIONS.playFolder) {
    playFolder(folder);
  } else if (value.action === PLAYLIST_MENU_ACTIONS.createPlaylistInFolder) {
    createPlaylistIn(folder.id);
  }
}

async function createPlaylistIn(folderId) {
  emit('activateLibrary');
  const created = await createPlaylistAt({ target: { id: folderId } });
  if (created) select(created.id);
}

const FOLDER_ACTIONS = new Set([
  PLAYLIST_MENU_ACTIONS.createFolder,
  PLAYLIST_MENU_ACTIONS.renameFolder,
  PLAYLIST_MENU_ACTIONS.deleteFolder,
  PLAYLIST_MENU_ACTIONS.moveToFolder,
  PLAYLIST_MENU_ACTIONS.moveOutOfFolder,
  PLAYLIST_MENU_ACTIONS.playFolder,
  PLAYLIST_MENU_ACTIONS.createPlaylistInFolder,
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
    if (openFolder.value) {
      createPlaylistIn(openFolder.value.id);
      return;
    }
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
  if (hasSearchQuery.value) return false;
  if (openFolder.value) return folderMembers(openFolder.value.id).length >= 2;
  return playlistItems.value.length + state.folderLayout.folders.length >= 2;
}

// A library album can be dropped on any folder or user playlist.
function canDragLibraryAlbum() {
  return (
    !hasSearchQuery.value &&
    playlistItems.value.length + state.folderLayout.folders.length > 0
  );
}

function libraryAlbumRow(album) {
  return {
    kind: 'playlist',
    key: `library:${album.id}`,
    id: album.id,
    playlist: album,
    folderId: null,
  };
}

// The same album can show in several rows, so drags track row keys.
function dragItem(row) {
  return { id: row.key, row };
}

function rowRef(row) {
  return { id: row.id };
}

const draggedRow = shallowRef(null);

function dropOnRow(draggedKey, targetKey, position, item) {
  const dragged = draggedRow.value;
  const target = item?.row;
  if (!dragged || !target) return;
  if (position === 'add') {
    // Copies the dragged tracks through the shared add-to-playlist action.
    emit('playlistAction', {
      action: PLAYLIST_MENU_ACTIONS.addToPlaylist,
      playlistId: dragged.playlist.id,
      targetPlaylistId: target.playlist.id,
    });
    return;
  }
  if (dragged.playlist?.kind === 'album') {
    const folder = state.folderLayout.folders.find(
      (entry) =>
        entry.id === (target.kind === 'folder' ? target.id : target.folderId),
    );
    if (folder) {
      emit(
        'playlistAction',
        copyToFolderValue(dragged.playlist, folder, rowRef(target), position),
      );
    }
    return;
  }
  moveItem(rowRef(dragged), rowRef(target), position);
}

function isDropAt(row, position) {
  return (
    dropTargetPlaylistId.value === row.key && dropPosition.value === position
  );
}

function dropPositionFor(item, ratio) {
  const row = item.row;
  const dragged = draggedRow.value;
  if (!dragged) return null;
  return playlistDropPosition(row, ratio, {
    draggingFolder: dragged.kind === 'folder',
    draggingAlbum: dragged.playlist?.kind === 'album',
  });
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
  onReorder: dropOnRow,
  positionFor: dropPositionFor,
});

// Everything outside the sidebar dims while a collection is dragged.
const collectionDrag = useCollectionDrag();
watch(draggingPlaylistId, (key) => {
  collectionDrag.setActive(Boolean(key));
  if (!key) draggedRow.value = null;
});
onBeforeUnmount(() => collectionDrag.setActive(false));

// The pointer carries a small name chip instead of a snapshot of the row.
const dragChip = ref(null);

// closePlaylistMenu() runs only once the drag will proceed; a refused drag
// start leaves an open menu alone.
function startDrag(row, event) {
  const allowed = row.key.startsWith('library:')
    ? canDragLibraryAlbum()
    : canDragPlaylistItem();
  if (!allowed) {
    event.preventDefault();
    return;
  }
  closePlaylistMenu();
  draggedRow.value = row;
  startDragReorder(dragItem(row), event);
  if (!dragChip.value || !event.dataTransfer?.setDragImage) return;
  dragChip.value.firstElementChild.textContent =
    row.kind === 'folder' ? row.folder.name : playlistDisplayName(row.playlist);
  // The chip's own transparent inset keeps the label clear of the pointer.
  event.dataTransfer.setDragImage(dragChip.value, 0, 0);
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
      <div
        v-if="openFolder"
        class="playlist-sidebar__folder-header"
        @contextmenu="openFolderMenu(openFolder, $event)"
      >
        <UiIconButton
          class="playlist-sidebar__folder-back"
          :icon="ChevronLeft"
          :label="t('playlist.folder.back')"
          @click="closeFolderView"
        />
        <span class="playlist-sidebar__label playlist-sidebar__folder-title">{{
          openFolder.name
        }}</span>
        <UiIconButton
          class="playlist-sidebar__folder-more"
          :icon="Ellipsis"
          :label="t('library.rail.more', { entity: openFolder.name })"
          aria-haspopup="menu"
          :aria-expanded="folderMoreMenuOpen ? 'true' : 'false'"
          @click="openFolderMoreMenu"
        />
      </div>
      <template v-else>
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
          <UiCollageThumb
            class="playlist-sidebar__thumb"
            plate
            :can-collage="false"
            :empty-icon="Library"
            :size="PLAYLIST_ROW_THUMB_SIZE"
            background="var(--ui-color-entry)"
            color="var(--ui-color-entry-foreground)"
          />
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
          <UiCollageThumb
            class="playlist-sidebar__thumb"
            plate
            :can-collage="false"
            :empty-icon="FolderOpen"
            :size="PLAYLIST_ROW_THUMB_SIZE"
            background="var(--ui-color-entry)"
            color="var(--ui-color-entry-foreground)"
          />
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
      </template>

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
        <PlaylistSidebarRow
          :playlist="archiveRow"
          subtitle=""
          :empty-icon="StickyNote"
          :active="
            activeView === 'library' &&
            libraryWorkspace === 'performance-records'
          "
          :compact="compact"
          :playback-enabled="false"
          @select="openPerformanceArchiveIndex"
        />
        <template v-for="row in visiblePlaylistRows" :key="row.key">
          <PlaylistSidebarRow
            v-if="row.kind === 'folder'"
            :playlist="folderRowItem(row.folder)"
            :empty-icon="row.expanded ? FolderOpen : Folder"
            :subtitle="folderSubtitle(row)"
            :compact="compact"
            folder
            :artwork-background="folderTone(row.folder).background"
            :artwork-color="folderTone(row.folder).color"
            :active-source="collectionPlayback.isActiveSource(row.id)"
            :playing="collectionPlayback.isPlaying(row.id)"
            :draggable="canDragPlaylistItem()"
            :dragging="draggingPlaylistId === row.key"
            :drop-before="isDropAt(row, 'before')"
            :drop-after="isDropAt(row, 'after')"
            :drop-inside="isDropAt(row, 'inside')"
            @select="openFolderView(row.folder)"
            @contextmenu="openFolderMenu(row.folder, $event)"
            @toggle-playback="toggleFolderPlayback(row.folder, $event)"
            @drag-start="startDrag(row, $event)"
            @drag-over="updateDropTarget(dragItem(row), $event)"
            @drag-leave="leaveDropTarget(dragItem(row), $event)"
            @drop="dropPlaylist(dragItem(row), $event)"
            @drag-end="clearDragState"
          >
            <template #trailing>
              <UiIconButton
                class="playlist-sidebar__folder-toggle"
                :icon="row.expanded ? ChevronDown : ChevronRight"
                :label="folderToggleLabel(row)"
                :aria-expanded="row.expanded ? 'true' : 'false'"
                :disabled="hasSearchQuery"
                @click="toggleFolder(row.folder)"
              />
            </template>
          </PlaylistSidebarRow>
          <p
            v-else-if="row.kind === 'empty-view'"
            class="playlist-sidebar__empty"
          >
            {{ t('playlist.folder.emptyView') }}
          </p>
          <PlaylistSidebarRow
            v-else
            :class="{ 'playlist-sidebar__nested': row.folderId && !openFolder }"
            :playlist="row.playlist"
            :cover-url="row.playlist.coverUrl"
            :cover-tracks="coverTracksFor(row.playlist)"
            :subtitle="subtitleFor(row.playlist)"
            :compact="compact"
            :active="row.playlist.id === state.selectedId"
            :active-source="isActiveSource(row.playlist)"
            :playing="isPlayingThis(row.playlist)"
            :draggable="canDragPlaylistItem()"
            :dragging="draggingPlaylistId === row.key"
            :drop-before="isDropAt(row, 'before')"
            :drop-after="isDropAt(row, 'after')"
            :drop-inside="isDropAt(row, 'add')"
            @select="selectPlaylist(row.playlist.id)"
            @contextmenu="openPlaylistMenu(row.playlist, $event)"
            @toggle-playback="togglePlayback(row.playlist, $event)"
            @drag-start="startDrag(row, $event)"
            @drag-over="updateDropTarget(dragItem(row), $event)"
            @drag-leave="leaveDropTarget(dragItem(row), $event)"
            @drop="dropPlaylist(dragItem(row), $event)"
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
            :draggable="canDragLibraryAlbum()"
            :dragging="draggingPlaylistId === `library:${entry.item.id}`"
            @select="selectPlaylist(entry.item.id)"
            @contextmenu="openPlaylistMenu(entry.item, $event)"
            @toggle-playback="togglePlayback(entry.item, $event)"
            @drag-start="startDrag(libraryAlbumRow(entry.item), $event)"
            @drag-end="clearDragState"
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

    <div ref="dragChip" class="playlist-sidebar__drag-chip" aria-hidden="true">
      <span class="playlist-sidebar__drag-chip-label"></span>
    </div>

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

/* UiCollageThumb draws the plate; the row only lifts it above its state
   surface, as PlaylistSidebarRow does for its own thumbnails. */
.playlist-sidebar__thumb {
  position: relative;
  z-index: var(--ui-layer-raised);
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

.playlist-sidebar__drag-chip {
  position: fixed;
  inset-block-start: -100vh;
  inset-inline-start: 0;
  padding: var(--ui-space-3) 0 0 var(--ui-space-3);
  pointer-events: none;
}

/* The drag label reads as a tooltip, so it reuses the tooltip surface. */
.playlist-sidebar__drag-chip-label {
  display: block;
  max-inline-size: var(--ui-tooltip-max-inline-size);
  padding: var(--ui-space-1) var(--ui-space-2);
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-tooltip-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-tooltip-background);
  color: var(--ui-tooltip-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-tooltip-font-size);
  font-weight: var(--ui-tooltip-font-weight);
  line-height: var(--ui-tooltip-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-sidebar__folder-header {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--ui-sidebar-row-gap);
  block-size: var(--ui-sidebar-row-min-height);
  padding-inline: var(--ui-sidebar-row-padding-inline);
  user-select: none;
  -webkit-user-select: none;
}

/* Same size as the toolbar commands, centred on the artwork column. */
.playlist-sidebar__folder-back,
.playlist-sidebar__folder-more {
  --ui-icon-button-size-override: var(--ui-sidebar-toolbar-control-size);
}

.playlist-sidebar__folder-more {
  margin-inline-start: auto;
}

.playlist-sidebar__folder-title {
  font-weight: var(--ui-type-label-weight);
}

/* A folder member is a normal row that starts further in, so its hover and
   selected plate move with it. */
.playlist-sidebar__list .playlist-sidebar__nested {
  width: auto;
  margin-inline-start: var(--ui-space-4);
}

.playlist-sidebar__empty {
  margin: 0;
  padding: var(--ui-space-1) var(--ui-sidebar-row-padding-inline);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  user-select: none;
  -webkit-user-select: none;
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

  /* No room for the inline toggle; the folder opens instead. */
  .playlist-sidebar__folder-toggle,
  .playlist-sidebar__folder-title,
  .playlist-sidebar__folder-more {
    display: none;
  }

  .playlist-sidebar__folder-header {
    align-self: center;
    justify-content: center;
    padding-inline: 0;
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
