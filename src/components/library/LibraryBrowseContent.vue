<script setup>
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { ImagePlus, Search, Trash2, UserRound } from '../../icons/index.js';
import { useAlbumNavigation } from '../../composables/useAlbumNavigation.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useAppDiagnostics } from '../../composables/useAppDiagnostics.js';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { useArtistPhotoCandidates } from '../../composables/useArtistPhotoCandidates.js';
import { useBgmSession } from '../../composables/useBgmSession.js';
import { useCollectionPlayback } from '../../composables/useCollectionPlayback.js';
import { useDragReorder } from '../../composables/useDragReorder.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { usePlaylistActions } from '../../composables/usePlaylistActions.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { usePlaybackHistory } from '../../composables/usePlaybackHistory.js';
import { usePlaybackQueue } from '../../composables/usePlaybackQueue.js';
import { useLibraryAlbumContext } from '../../composables/useLibraryAlbumContext.js';
import { useScrolledPast } from '../../composables/useScrolledPast.js';
import { useSeparationQueueContext } from '../../composables/useSeparationQueueContext.js';
import { useTrackListDensity } from '../../composables/useTrackListDensity.js';
import { useTrackSeparationAction } from '../../composables/useTrackSeparationAction.js';
import { useTrackPreview } from '../../composables/useTrackPreview.js';
import { useTrackMetadataEditor } from '../../composables/useTrackMetadataEditor.js';
import ArtistPhotoCandidateModal from '../artists/ArtistPhotoCandidateModal.vue';
import LibraryArtistIdentityController from './LibraryArtistIdentityController.vue';
import TrackMetadataModal from './TrackMetadataModal.vue';
import TrackTable from '../track/TrackTable.vue';
import { normalizeTrackCollectionSort } from '../track/trackCollectionProfiles.js';
import {
  addToPlaylistContent,
  addToPlaylistMenuItem,
  collectionManageMenuItems,
} from '../../utils/collectionMenuItems.js';
import AppFolderCompactBar from '../layout/AppFolderCompactBar.vue';
import AppFolderContentField from '../layout/AppFolderContentField.vue';
import LibraryAlbumSupportingContent from './LibraryAlbumSupportingContent.vue';
import LibraryCollectionHeader from './LibraryCollectionHeader.vue';
import TrackPreviewOverlay from '../track/TrackPreviewOverlay.vue';
import PlaybackPrimaryButton from '../playback/PlaybackPrimaryButton.vue';
import TrackActionMenu from '../track/TrackActionMenu.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import { contentLangAttribute } from '../../utils/contentLanguage.js';
import { formatLongDuration } from '../../utils/format.js';
import {
  TRACK_MENU_ACTIONS,
  libraryViewTitle,
  playlistDisplayName,
} from '../../utils/playlistMenu.js';
import {
  sortPlaylistEntries as sortTrackRowEntries,
  nextPlaylistSort as nextTrackRowSort,
} from '../../utils/playlistSort.js';
import { toPlayableTrack } from '../../utils/playableTrack.js';
import { deriveAlbumSummary } from '../../utils/albumSummary.js';
import { deriveAlbumReference } from '../../utils/albumReference.js';
import { artistSearchTexts, deriveArtistPage } from '../../utils/artistPage.js';
import { shufflePreviewTracks } from '../../utils/trackPreviewOrder.js';
import {
  sortLibraryTracks,
  sortLocalLibraryTracks,
} from '../../utils/trackSourceDisplay.js';

const { state, playTrack, clearTrack, toggle } = usePlayer();
const { confirm: confirmAction } = useAppConfirmation();
const { recordError } = useAppDiagnostics();
const {
  state: libraryState,
  tracksById: libraryTracksById,
  initialize: initializeLibrary,
  refresh: refreshLibrary,
} = useLibrary();
const {
  state: queueState,
  setQueue,
  enqueueTrack,
  removeTrack: removeTrackFromQueue,
  toggleShuffle,
} = usePlaybackQueue();
// Rename playlist actions to avoid colliding with file deletion helpers.
const {
  state: playlistState,
  selectedPlaylist,
  create: createPlaylistAction,
  select: selectPlaylistAction,
  selectArtist,
  addTrack: addTrackToPlaylist,
  removeTrack: removeTrackFromPlaylist,
  setTracks: setPlaylistTracksAction,
} = usePlaylists();
const { resolvePlaylistTracks, openEditDetails, handlePlaylistMenuAction } =
  usePlaylistActions();
const { playCountOf } = usePlaybackHistory();
const collectionPlayback = useCollectionPlayback();
const { canJumpToAlbum, jumpToAlbum } = useAlbumNavigation();
const {
  state: artistIndexState,
  ensureLoaded: ensureArtistIndex,
  refresh: refreshArtistIndex,
  resolvePhotos: resolveArtistPhotos,
  choosePhoto: chooseArtistPhoto,
  clearPhoto: clearArtistPhoto,
} = useArtistIndex();
const artistPhotoCandidates = useArtistPhotoCandidates({
  refreshArtistIndex,
});
const trackPreview = useTrackPreview();
const { handoffState: bgmHandoffState } = useBgmSession();

// Transient UI mode stays local; mutations persist immediately.
const deleteError = ref(null);
const selectedTrackId = shallowRef(null);
const artistIdentityOpen = shallowRef(false);
const searchQuery = defineModel('searchQuery', {
  type: String,
  default: '',
});
const addMenu = ref(null);
const trackRowSort = ref({ key: null, direction: 'asc' });
const tableColumnPreferencesByKind = shallowRef({});

const trackMetadataEditor = useTrackMetadataEditor({ refresh: refreshLibrary });

const albumReference = computed(() =>
  deriveAlbumReference(
    playlistState.selectedAlbumReference,
    libraryState.tracks,
  ),
);

const mode = computed(() => {
  if (selectedPlaylist.value) {
    return selectedPlaylist.value.kind === 'album' ? 'album' : 'playlist';
  }
  if (playlistState.selectedAlbumReference) return 'album';
  return playlistState.selectedArtistId ? 'artist' : 'all';
});
const isLocalLibraryView = computed(
  () => mode.value === 'all' && playlistState.libraryView === 'local',
);
const tableCollectionKind = computed(() =>
  mode.value === 'all' ? `library-${playlistState.libraryView}` : mode.value,
);
const effectiveTrackRowSort = computed(() =>
  normalizeTrackCollectionSort(tableCollectionKind.value, trackRowSort.value),
);

// Album track membership/order is read-only — see playlists.js's
// PLAYLIST_KINDS comment. Rename/delete/play remain available, while the
// source-owned row order stays fixed.
const isAlbumSelected = computed(() => mode.value === 'album');
const isAlbumReferenceSelected = computed(() =>
  Boolean(playlistState.selectedAlbumReference),
);
// Artist pages are derived read-only references (ADR 0022).
const isArtistSelected = computed(() => mode.value === 'artist');

const { density: trackListDensity, setDensity: setTrackListDensity } =
  useTrackListDensity();
const separationController = useSeparationQueueContext();
const {
  enqueueingTrackId: vsEnqueuePendingTrackId,
  error: separationActionError,
  vsQueuedTrackIds,
  queueTrackForSeparation,
  clearError: clearSeparationActionError,
} = useTrackSeparationAction({
  separationController,
  tracksById: libraryTracksById,
});
const collectionHeader = shallowRef(null);
// Spotify-style: once the dossier scrolls away, a compact bar keeps the
// title and Play reachable and the table header sticks below it.
const compactBarVisible = useScrolledPast(collectionHeader);
const stickyOffsetStyle = computed(() => ({
  '--ui-folder-sticky-offset': compactBarVisible.value
    ? 'var(--ui-folder-compact-bar-block-size)'
    : '0px',
}));

const { albumEntries, albumSupportingContent } = useLibraryAlbumContext();
const artistPage = computed(() =>
  isArtistSelected.value
    ? deriveArtistPage({
        artistId: playlistState.selectedArtistId,
        artistIndex: artistIndexState.index,
        albumEntries: albumEntries.value,
        tracksById: libraryTracksById.value,
      })
    : null,
);
// Queue/history source of the open collection: playlist, album or artist.
// Library views are collections too; the prefix never collides with
// playlist UUIDs or artist ids in the shared queue/history namespace.
const collectionSourceId = computed(() => {
  if (mode.value === 'all') return `library:${playlistState.libraryView}`;
  return (
    selectedPlaylist.value?.id ??
    albumReference.value?.id ??
    artistPage.value?.id ??
    null
  );
});

const playlistTracks = computed(() =>
  isArtistSelected.value
    ? (artistPage.value?.tracks ?? [])
    : isAlbumReferenceSelected.value
      ? (albumReference.value?.tracks ?? [])
      : resolvePlaylistTracks(selectedPlaylist.value),
);

// Empty inside an album's own page — jumping to itself would be a no-op.
const albumJumpableTrackIds = computed(() => {
  if (isAlbumSelected.value) return new Set();
  const ids = new Set();
  const tracks =
    mode.value === 'all' ? libraryState.tracks : playlistTracks.value;
  for (const track of tracks) {
    if (canJumpToAlbum(track)) ids.add(track.id);
  }
  return ids;
});

const showTrackSearch = computed(
  () => mode.value === 'all' || mode.value === 'playlist',
);
const normalizedSearchQuery = computed(() =>
  showTrackSearch.value ? searchQuery.value.trim().toLocaleLowerCase() : '',
);

function matchesSearch(track) {
  const query = normalizedSearchQuery.value;
  if (!query) return true;
  return [
    track.title,
    ...artistSearchTexts(track, artistIndexState.index),
    track.id,
    track.filename,
  ].some((value) =>
    String(value ?? '')
      .toLocaleLowerCase()
      .includes(query),
  );
}

const libraryViewTracks = computed(() =>
  isLocalLibraryView.value
    ? sortLocalLibraryTracks(libraryState.tracks)
    : sortLibraryTracks(libraryState.tracks),
);
const orderedLibraryEntries = computed(() => {
  const entries = libraryViewTracks.value.map((track, playlistIndex) => ({
    track,
    playlistIndex,
    addedAt: track.importedAt,
    playCount: playCountOf(track.id),
  }));
  return sortTrackRowEntries(entries, effectiveTrackRowSort.value);
});
const orderedPlaylistEntries = computed(() => {
  // Artist pages have no membership date; show when the track entered the library.
  const entries = playlistTracks.value.map((track, playlistIndex) => ({
    track,
    playlistIndex,
    addedAt:
      isArtistSelected.value || isAlbumReferenceSelected.value
        ? track.importedAt
        : selectedPlaylist.value?.addedAt?.[track.id],
    playCount: playCountOf(track.id),
  }));

  return sortTrackRowEntries(entries, effectiveTrackRowSort.value);
});

const visiblePlaylistEntries = computed(() =>
  orderedPlaylistEntries.value
    .filter(({ track }) => matchesSearch(track))
    .map((entry, visibleIndex) => ({ ...entry, visibleIndex })),
);
const visibleLibraryEntries = computed(() =>
  orderedLibraryEntries.value
    .filter(({ track }) => matchesSearch(track))
    .map((entry, visibleIndex) => ({ ...entry, visibleIndex })),
);
const visibleTableEntries = computed(() =>
  mode.value === 'all'
    ? visibleLibraryEntries.value
    : visiblePlaylistEntries.value,
);
const currentTableColumnPreferences = computed(
  () => tableColumnPreferencesByKind.value[tableCollectionKind.value] ?? {},
);

function updateTableColumnPreferences(preferences) {
  tableColumnPreferencesByKind.value = {
    ...tableColumnPreferencesByKind.value,
    [tableCollectionKind.value]: preferences,
  };
}
// Header actions act on the whole page, independent of the search filter.
const headerTracks = computed(() =>
  mode.value === 'all' ? libraryViewTracks.value : playlistTracks.value,
);
const collectionPlaybackTracks = computed(() =>
  mode.value === 'all'
    ? orderedLibraryEntries.value.map(({ track }) => track)
    : orderedPlaylistEntries.value.map(({ track }) => track),
);

const playlistCoverUrl = computed(() => selectedPlaylist.value?.coverUrl ?? '');
// Artist pages show the artist photo or the person placeholder, never an album.
const collectionCoverUrl = computed(() =>
  isArtistSelected.value
    ? (artistPage.value?.photoUrl ?? '')
    : playlistCoverUrl.value,
);
const collectionCoverTracks = computed(() =>
  isArtistSelected.value ? [] : playlistTracks.value,
);
const playlistDescription = computed(
  () => selectedPlaylist.value?.description ?? '',
);
const playlistTotalDuration = computed(() =>
  headerTracks.value.reduce(
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
// Every Library track list renders artist credits. Load the canonical index for
// all modes so those credits do not silently degrade to plain text outside an
// album or artist page.
ensureArtistIndex();
const headerFields = computed(() => {
  const count = headerTracks.value.length;
  const duration = formatLongDuration(playlistTotalDuration.value);
  const countLine = duration
    ? `${count} 首曲目，${duration}`
    : `${count} 首曲目`;
  if (isArtistSelected.value) {
    const page = artistPage.value;
    const fields = [countLine];
    if (page?.albums.length) fields.push(`${page.albums.length} 張專輯`);
    if (page?.yearStart) {
      fields.push(
        page.yearEnd && page.yearEnd !== page.yearStart
          ? `${page.yearStart}–${page.yearEnd}`
          : String(page.yearStart),
      );
    }
    return fields;
  }
  const releaseYear = isAlbumSelected.value
    ? albumSummary.value.releaseYear
    : undefined;
  return releaseYear ? [String(releaseYear), countLine] : [countLine];
});
// The album header names its artist from the shared index once it is loaded.
const playlistArtist = computed(
  () => albumSupportingContent.value?.artist ?? albumSummary.value.artist ?? '',
);
const playlistArtistLinkLabel = computed(() =>
  albumSupportingContent.value
    ? `前往藝人：${albumSupportingContent.value.artist}`
    : '',
);

const pageTitle = computed(() => {
  if (selectedPlaylist.value)
    return playlistDisplayName(selectedPlaylist.value);
  if (isAlbumReferenceSelected.value) {
    return albumReference.value?.name ?? playlistState.selectedAlbumReference;
  }
  if (isArtistSelected.value) return artistPage.value?.name ?? '藝人';
  return libraryViewTitle(playlistState.libraryView);
});

const selectedCollectionPlaybackContext = computed(() => ({
  sourceId: collectionSourceId.value ?? '',
  sourceName: pageTitle.value,
  tracks: collectionPlaybackTracks.value,
}));
const selectedCollectionIsPlaying = computed(() =>
  collectionPlayback.isPlaying(collectionSourceId.value),
);
const playingSupportingAlbumId = computed(() => {
  if (!state.isPlaying || !queueState.sourceId) return '';
  return albumEntries.value.some(
    ({ collection }) => collection.id === queueState.sourceId,
  )
    ? queueState.sourceId
    : '';
});

function openAlbumArtist() {
  const artistId = albumSupportingContent.value?.artistId;
  if (artistId) selectArtist(artistId);
}

// An opened artist page asks for its photo too, including unlisted artists.
watch(
  () =>
    isArtistSelected.value && artistPage.value && !artistPage.value.photoUrl
      ? artistPage.value.id
      : null,
  (artistId) => {
    if (artistId) resolveArtistPhotos([artistId]);
  },
);

function chooseSelectedArtistPhoto() {
  if (artistPage.value) chooseArtistPhoto(artistPage.value.id);
}

function openArtistIdentity() {
  if (artistPage.value?.id) artistIdentityOpen.value = true;
}

async function confirmClearArtistPhoto() {
  const artist = artistPage.value;
  if (!artist?.photoUrl) return;
  const { id, photoUrl } = artist;
  const confirmed = await confirmAction({
    title: '移除藝人照片？',
    subject: artist.name,
    message: '目前的藝人照片會被移除，曲目與藝人資料會保留。',
    detail: '移除後需重新選擇或搜尋照片。',
    confirmLabel: '移除照片',
    intent: 'danger',
  });
  if (
    !confirmed ||
    artistPage.value?.id !== id ||
    artistPage.value.photoUrl !== photoUrl
  )
    return;
  await clearArtistPhoto(id);
}

function handleCollectionMenuAction(value) {
  if (value?.action === ARTIST_IDENTITY_ACTIONS.manage) {
    openArtistIdentity();
  } else if (value?.action === ARTIST_PHOTO_ACTIONS.choose) {
    chooseSelectedArtistPhoto();
  } else if (value?.action === ARTIST_PHOTO_ACTIONS.searchOnline) {
    if (artistPage.value) {
      artistPhotoCandidates.openForArtist(artistPage.value);
    }
  } else if (value?.action === ARTIST_PHOTO_ACTIONS.clear) {
    void confirmClearArtistPhoto();
  } else {
    handlePlaylistMenuAction(value);
  }
}

const selectedPlaylistDestinationContent = computed(() =>
  selectedPlaylist.value
    ? addToPlaylistContent(playlistState.playlists, selectedPlaylist.value.id)
    : null,
);

const ARTIST_PHOTO_ACTIONS = Object.freeze({
  choose: 'choose-artist-photo',
  searchOnline: 'search-online-artist-photo',
  clear: 'clear-artist-photo',
});
const ARTIST_IDENTITY_ACTIONS = Object.freeze({
  manage: 'manage-artist-identity',
});

const collectionMoreContent = computed(() => {
  if (isArtistSelected.value) {
    if (!artistPage.value) return { kind: 'actions', groups: [] };
    return {
      kind: 'actions',
      groups: [
        {
          id: 'identity',
          items: [
            {
              id: ARTIST_IDENTITY_ACTIONS.manage,
              kind: 'action',
              label: '整理藝人',
              icon: UserRound,
              value: { action: ARTIST_IDENTITY_ACTIONS.manage },
            },
          ],
        },
        {
          id: 'photo',
          items: [
            {
              id: ARTIST_PHOTO_ACTIONS.choose,
              kind: 'action',
              label: '選擇藝人照片',
              icon: ImagePlus,
              value: { action: ARTIST_PHOTO_ACTIONS.choose },
            },
            ...(!artistPage.value.photoUrl
              ? [
                  {
                    id: ARTIST_PHOTO_ACTIONS.searchOnline,
                    kind: 'action',
                    label: '搜尋線上藝人照片',
                    icon: Search,
                    value: { action: ARTIST_PHOTO_ACTIONS.searchOnline },
                  },
                ]
              : [
                  {
                    id: ARTIST_PHOTO_ACTIONS.clear,
                    kind: 'action',
                    label: '移除藝人照片',
                    icon: Trash2,
                    intent: 'danger',
                    value: { action: ARTIST_PHOTO_ACTIONS.clear },
                  },
                ]),
          ],
        },
      ],
    };
  }
  const playlist = selectedPlaylist.value;
  if (!playlist) return { kind: 'actions', groups: [] };
  const manageItems = collectionManageMenuItems(playlist);
  const groups = [];
  if (playlistTracks.value.length > 0) {
    const addLabel =
      playlist.kind === 'album' ? '新增專輯至播放清單' : '新增至別的播放清單';
    groups.push({
      id: 'destinations',
      items: [
        addToPlaylistMenuItem(playlistState.playlists, playlist, addLabel),
      ],
    });
  }
  groups.push({ id: 'manage', items: manageItems });
  return { kind: 'actions', groups };
});

const canReorderPlaylistTracks = computed(
  () =>
    mode.value === 'playlist' &&
    !normalizedSearchQuery.value &&
    effectiveTrackRowSort.value.key === null &&
    Boolean(selectedPlaylist.value),
);
const queuedTrackIds = computed(() =>
  queueState.queuedTracks.map((track) => track.id),
);
// Row right-click and the preview's menu offer the same items per track.
function trackMenuOptions(track) {
  const inEditablePlaylist =
    Boolean(track) &&
    !isAlbumSelected.value &&
    Boolean(selectedPlaylist.value?.trackIds.includes(track.id));
  return {
    removeFromPlaylistId: inEditablePlaylist ? selectedPlaylist.value.id : '',
    canGoToAlbum: Boolean(
      track && !isAlbumSelected.value && canJumpToAlbum(track),
    ),
    canDelete: Boolean(track) && mode.value === 'all',
  };
}
const addMenuOptions = computed(() => trackMenuOptions(addMenu.value?.track));

const pageError = computed(
  () => playlistState.error || deleteError.value || separationActionError.value,
);
const visibleTracksEmptyText = computed(() =>
  normalizedSearchQuery.value ? '找不到符合搜尋的曲目。' : '沒有曲目。',
);
const tableEmptyText = computed(() => {
  if (mode.value === 'all') return visibleTracksEmptyText.value;
  if (playlistTracks.value.length > 0) return '找不到符合搜尋的曲目。';
  if (isArtistSelected.value) return '沒有曲目。';
  if (isAlbumSelected.value) return '這個專輯參照目前沒有曲目。';
  return '這個歌單還沒有曲目。從任一曲目列的操作選單加入。';
});
const contentFieldVariant = computed(() => {
  if (
    libraryState.isLoading ||
    libraryState.error ||
    libraryState.tracks.length === 0
  ) {
    return 'state';
  }
  return visibleTableEntries.value.length > 0 ? 'content' : 'state';
});

// Selecting a different playlist/library-view (both now live in the shared
// usePlaylists() state, driven by the persistent AppPlaylistSidebar) only
// affects the search/add-menu/drag state scoped to this view's main content
// area — it must not touch the edit-details modal, which AppPlaylistSidebar
// owns independently.
watch(
  [
    () => selectedPlaylist.value?.id,
    () => playlistState.selectedAlbumReference,
    () => playlistState.selectedArtistId,
    () => playlistState.libraryView,
  ],
  () => {
    if (!showTrackSearch.value) searchQuery.value = '';
    selectedTrackId.value = null;
    artistIdentityOpen.value = false;
    artistPhotoCandidates.close();
    closeAddMenu();
    clearDragState();
    trackPreview.close();
    clearSeparationActionError();
  },
);

function currentVisibleQueueTracks() {
  return visibleTableEntries.value.map(({ track }) => track);
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
    sourceId: collectionSourceId.value,
  });
  playTrack(toPlayableTrack(track));
}

function toggleTrackPlayback(track) {
  if (state.track?.id === track?.id) {
    toggle();
    return;
  }
  activateTrack(track);
}

function toggleSelectedCollectionPlayback() {
  collectionPlayback.togglePlayback(selectedCollectionPlaybackContext.value);
}

function toggleSupportingAlbumPlayback(albumId) {
  const entry = albumEntries.value.find(
    ({ collection }) => collection.id === albumId,
  );
  if (!entry) return;
  collectionPlayback.togglePlayback({
    sourceId: entry.collection.id,
    sourceName: playlistDisplayName(entry.collection),
    tracks: entry.tracks,
  });
}

function enqueueSelectedCollection() {
  collectionPlayback.enqueueCollection(selectedCollectionPlaybackContext.value);
}

function toggleTrackRowSort(key) {
  if (!normalizeTrackCollectionSort(tableCollectionKind.value, { key }).key) {
    return;
  }
  trackRowSort.value = nextTrackRowSort(effectiveTrackRowSort.value, key);
  clearDragState();
}

// Deletes both the original file and its separation output (see
// electron/lib/library/tracks.js's deleteTrack), and cascades into every
// playlist that referenced it (main.js composes that cascade) — the
// confirm dialog says so explicitly since there's no undo. The list
// refreshes itself via the existing library:updated subscription, not a
// manual reload here.
async function removeTrack(track) {
  const confirmed = await confirmAction({
    title: '刪除曲目？',
    subject: track.title,
    message: '會從曲庫與所有播放清單移除。',
    detail: '原始音檔與去人聲版本也會刪除，且無法復原。',
    confirmLabel: '刪除曲目',
    intent: 'danger',
  });
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
  const fromButton = event.type !== 'contextmenu' && event.currentTarget;
  addMenu.value = {
    track,
    anchor: fromButton
      ? { kind: 'element', element: fromButton }
      : {
          kind: 'point',
          x: event.clientX ?? 0,
          y: event.clientY ?? 0,
        },
  };
}

function closeAddMenu() {
  addMenu.value = null;
}

async function handleTrackMenuSelect(value) {
  const track = addMenu.value?.track;
  if (track) await applyTrackMenuAction(track, value);
  closeAddMenu();
}

async function confirmRemovePlaylistTrack(track, playlistId) {
  const playlist = playlistState.playlists.find(
    (item) => item.id === playlistId,
  );
  if (
    !playlist ||
    playlist.kind !== 'playlist' ||
    !playlist.trackIds.includes(track.id)
  )
    return;
  const confirmed = await confirmAction({
    title: '從播放清單移除曲目？',
    subject: track.title,
    meta: playlist.name || '播放清單',
    message: '只會移除此清單中的曲目安排，曲庫歌曲與音檔會保留。',
    detail: '之後可重新加入清單。',
    confirmLabel: '移除曲目',
    intent: 'danger',
  });
  if (!confirmed) return;
  const current = playlistState.playlists.find(
    (item) => item.id === playlistId,
  );
  if (current?.kind !== 'playlist' || !current.trackIds.includes(track.id))
    return;
  const removed = await removeTrackFromPlaylist(playlistId, track.id);
  if (
    removed &&
    playlistState.selectedId === playlistId &&
    selectedTrackId.value === track.id
  )
    selectedTrackId.value = null;
}

async function applyTrackMenuAction(track, value) {
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
    await confirmRemovePlaylistTrack(track, value.playlistId);
  } else if (value.action === TRACK_MENU_ACTIONS.goToAlbum) {
    jumpToAlbum(track);
  } else if (value.action === TRACK_MENU_ACTIONS.deleteTrack) {
    await removeTrack(track);
  }
}

const previewMenuOptions = computed(() =>
  trackMenuOptions(trackPreview.state.tracks[trackPreview.state.index]),
);

// The preview starts at the selection and follows the visible (searched)
// order; artist pages shuffle so they differ from the album view.
function openTrackPreview() {
  const visibleTracks = visibleTableEntries.value.map(({ track }) => track);
  const tracks = isArtistSelected.value
    ? shufflePreviewTracks(visibleTracks, { pinnedId: selectedTrackId.value })
    : visibleTracks;
  const startIndex = Math.max(
    0,
    tracks.findIndex((track) => track.id === selectedTrackId.value),
  );
  trackPreview.open({ title: pageTitle.value, tracks, startIndex });
}

// The preview lane never sounds while recording or live (track-preview contract).
const previewBlockedReason = computed(() =>
  bgmHandoffState.sessionMode === 'inactive' ? '' : '錄影或直播中無法使用',
);

function playFromPreview(track) {
  trackPreview.close();
  activateTrack(track);
}

// Editing or leaving for an album needs the page underneath, not the preview.
const PREVIEW_CLOSING_ACTIONS = new Set([
  TRACK_MENU_ACTIONS.editMetadata,
  TRACK_MENU_ACTIONS.goToAlbum,
]);

function handlePreviewMenuSelect(value, track) {
  if (PREVIEW_CLOSING_ACTIONS.has(value.action)) trackPreview.close();
  applyTrackMenuAction(track, value);
}

onUnmounted(() => trackPreview.close());

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

function movePlaylistTrack(trackId, offset) {
  const playlist = selectedPlaylist.value;
  if (!playlist || !canReorderPlaylistTracks.value) return;
  const currentIndex = playlist.trackIds.indexOf(trackId);
  const targetIndex = currentIndex + offset;
  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= playlist.trackIds.length
  ) {
    return;
  }

  const next = [...playlist.trackIds];
  [next[currentIndex], next[targetIndex]] = [
    next[targetIndex],
    next[currentIndex],
  ];
  setPlaylistTracksAction(playlist.id, next);
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
  canDrag: () => canReorderPlaylistTracks.value,
});

// closeAddMenu() is a caller-side side effect (dismiss any open context
// menu before a drag starts) — not part of the drag gesture itself, so it
// stays here rather than inside the shared composable. Only fires when the
// drag will actually proceed, matching the original guard-then-side-effect
// order (closing the menu on a rejected drag start would be an observable
// behavior change, not a pure refactor).
function startDrag(track, event) {
  if (!canReorderPlaylistTracks.value) {
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
  <div class="library-browse-content">
    <TrackMetadataModal
      :open="trackMetadataEditor.isOpen.value"
      :title="trackMetadataEditor.state.titleDraft"
      :artist="trackMetadataEditor.state.artistDraft"
      :thumbnail-url="trackMetadataEditor.state.artworkPreviewUrl"
      :dirty="trackMetadataEditor.isDirty.value"
      :artwork-changed="trackMetadataEditor.isArtworkDirty.value"
      :saving="trackMetadataEditor.state.isSaving"
      :artwork-preparing="trackMetadataEditor.state.isArtworkPreparing"
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
      @update-title="trackMetadataEditor.setTitleDraft"
      @update-artist="trackMetadataEditor.setArtistDraft"
    />

    <LibraryArtistIdentityController
      :open="artistIdentityOpen"
      :artist-id="artistPage?.id ?? ''"
      @close="artistIdentityOpen = false"
    />

    <ArtistPhotoCandidateModal
      :open="artistPhotoCandidates.state.open"
      :artist-name="artistPhotoCandidates.state.artistName"
      :status="artistPhotoCandidates.state.status"
      :candidates="artistPhotoCandidates.state.candidates"
      :selected-candidate-id="artistPhotoCandidates.state.selectedCandidateId"
      :error="artistPhotoCandidates.state.error"
      @close="artistPhotoCandidates.close"
      @retry="artistPhotoCandidates.retry"
      @select-candidate="artistPhotoCandidates.selectCandidate"
      @confirm="artistPhotoCandidates.applySelected"
    />

    <TrackPreviewOverlay
      :open="trackPreview.state.isOpen"
      :title="trackPreview.state.title"
      :tracks="trackPreview.state.tracks"
      :index="trackPreview.state.index"
      :status="trackPreview.state.status"
      :blocked-reason="trackPreview.state.blockedReason"
      :segment="trackPreview.state.segment"
      :current-time="trackPreview.state.currentTime"
      :muted="trackPreview.state.isMuted"
      :playlists="playlistState.playlists"
      :current-track-id="state.track?.id ?? ''"
      :queued-track-ids="queuedTrackIds"
      :menu-options="previewMenuOptions"
      @close="trackPreview.close"
      @navigate="trackPreview.close"
      @select="trackPreview.select"
      @mute="trackPreview.setMuted"
      @play-track="playFromPreview"
      @add-to-queue="enqueueTrack"
      @menu-select="handlePreviewMenuSelect"
    />

    <div class="library-browse-content__main" :style="stickyOffsetStyle">
      <AppFolderCompactBar
        :title="pageTitle"
        :title-lang="
          mode === 'all' ? undefined : contentLangAttribute(pageTitle)
        "
        :visible="compactBarVisible"
      >
        <template #action>
          <PlaybackPrimaryButton
            :playing="selectedCollectionIsPlaying"
            :disabled="headerTracks.length === 0"
            :play-label="`播放${pageTitle}`"
            :pause-label="`暫停${pageTitle}`"
            @click="toggleSelectedCollectionPlayback"
          />
        </template>
      </AppFolderCompactBar>

      <div
        ref="collectionHeader"
        class="library-browse-content__collection-header"
      >
        <LibraryCollectionHeader
          v-model:search-query="searchQuery"
          :entity-kind="mode === 'all' ? 'library' : mode"
          :library-view="playlistState.libraryView"
          :title="pageTitle"
          :artist="playlistArtist"
          :artist-link-label="playlistArtistLinkLabel"
          :fields="headerFields"
          :cover-tracks="collectionCoverTracks"
          :cover-url="collectionCoverUrl"
          :description="playlistDescription"
          :playing="selectedCollectionIsPlaying"
          :shuffle-active="queueState.isShuffle"
          :can-play="headerTracks.length > 0"
          :can-shuffle="queueState.tracks.length > 1"
          :can-add-to-queue="headerTracks.length > 0"
          :can-preview="visibleTableEntries.length > 0"
          :preview-blocked-reason="previewBlockedReason"
          :can-add-to-playlist="playlistTracks.length > 0"
          :add-to-playlist-content="selectedPlaylistDestinationContent"
          :entity-action-visible="!isAlbumReferenceSelected"
          :more-content="collectionMoreContent"
          :show-search="showTrackSearch"
          :density="trackListDensity"
          @toggle-playback="toggleSelectedCollectionPlayback"
          @toggle-shuffle="toggleShuffle"
          @add-to-queue="enqueueSelectedCollection"
          @preview="openTrackPreview"
          @open-edit-details="openEditDetails"
          @menu-action="handleCollectionMenuAction"
          @select-artist="openAlbumArtist"
          @choose-photo="chooseSelectedArtistPhoto"
          @update-density="setTrackListDensity"
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
          還沒有任何曲目——使用左側的「匯入曲目」開始建立曲庫。
        </UiHint>

        <template v-else>
          <UiNotice
            v-if="pageError"
            tone="danger"
            title="曲目操作未完成"
            :message="pageError"
            compact
          />

          <UiHint v-if="isArtistSelected && !artistPage" role="status">
            載入中…
          </UiHint>
          <UiHint v-else-if="visibleTableEntries.length === 0">
            {{ tableEmptyText }}
          </UiHint>
          <TrackTable
            v-else
            :entries="visibleTableEntries"
            :collection-kind="tableCollectionKind"
            :column-preferences="currentTableColumnPreferences"
            :label="`${pageTitle}曲目`"
            :sort="effectiveTrackRowSort"
            :can-reorder-playlist-tracks="canReorderPlaylistTracks"
            :selected-track-id="selectedTrackId"
            :current-track-id="state.track?.id"
            :playing-track-id="state.isPlaying ? state.track?.id : ''"
            :dragging-track-id="draggingTrackId"
            :drop-target-track-id="dropTargetTrackId"
            :drop-position="dropPosition"
            :album-jumpable-track-ids="albumJumpableTrackIds"
            :vs-queued-track-ids="vsQueuedTrackIds"
            :vs-enqueue-pending-track-id="vsEnqueuePendingTrackId"
            :density="trackListDensity"
            @toggle-sort="toggleTrackRowSort"
            @update-column-preferences="updateTableColumnPreferences"
            @select-track="selectTrack"
            @activate-track="activateTrack"
            @toggle-playback="toggleTrackPlayback"
            @navigate-album="jumpToAlbum"
            @queue-separation="queueTrackForSeparation"
            @open-menu="openAddMenu"
            @move-track="movePlaylistTrack"
            @track-drag-start="startDrag"
            @track-drag-over="updateDropTarget"
            @track-drag-leave="leaveDropTarget"
            @track-drop="dropTrack"
            @track-drag-end="clearDragState"
          />
        </template>
      </AppFolderContentField>

      <LibraryAlbumSupportingContent
        v-if="albumSupportingContent?.relatedAlbums.length > 0"
        :artist="albumSupportingContent.artist"
        :related-albums="albumSupportingContent.relatedAlbums"
        :playing-album-id="playingSupportingAlbumId"
        @select-album="selectPlaylistAction"
        @play-album="toggleSupportingAlbumPlayback"
      />

      <LibraryAlbumSupportingContent
        v-else-if="artistPage && artistPage.albums.length > 0"
        :artist="artistPage.name"
        :related-albums="artistPage.albums"
        :playing-album-id="playingSupportingAlbumId"
        albums-title="專輯"
        @select-album="selectPlaylistAction"
        @play-album="toggleSupportingAlbumPlayback"
      />

      <TrackActionMenu
        :open="Boolean(addMenu)"
        :anchor="addMenu?.anchor"
        :track="addMenu?.track ?? null"
        :playlists="playlistState.playlists"
        :current-track-id="state.track?.id ?? ''"
        :queued-track-ids="queuedTrackIds"
        :remove-from-playlist-id="addMenuOptions.removeFromPlaylistId"
        :can-go-to-album="addMenuOptions.canGoToAlbum"
        :can-delete="addMenuOptions.canDelete"
        @select="handleTrackMenuSelect"
        @close="closeAddMenu"
      />
    </div>
  </div>
</template>

<style scoped>
.library-browse-content {
  display: grid;
  min-block-size: 100%;
}

.library-browse-content__main {
  min-width: 0;
  min-block-size: 100%;
  display: flex;
  flex-direction: column;
}

.library-browse-content__collection-header {
  min-width: 0;
  flex: 0 0 auto;
}

.library-browse-content__session-boundary {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}
</style>
