import { computed, reactive, readonly, shallowRef } from 'vue';
import { notificationKey } from '../constants/notificationKeys.js';
import {
  IMPORT_FILTERS,
  filterPlaylistImportTracks,
  getPlaylistImportStats,
  hasImportableSelection,
  getDominantImportFailureCode,
} from '../utils/importPlaylist.js';
import { normalizeAppError } from '../utils/appErrors.js';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { useImportExecution } from './import/useImportExecution.js';
import { useImportSourceResolution } from './import/useImportSourceResolution.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { registerProviderImportActivity } from './usePreparationActivity.js';
import { useAppNotifications } from './useAppNotifications.js';
import { t } from '../utils/i18n.js';
const notifications = useAppNotifications();
const { requireFeatureGate, requestFeatureSetup } = useFeatureGateAccess();
const { recordError } = useAppDiagnostics();

const state = reactive({
  input: '',
  status: '',
  statusType: 'idle', // 'idle' | 'empty' | 'pending' | 'success' | 'error'
  statusScope: 'surface', // 'surface' | 'object'
  failureHint: '',
  downloadDir: '',
  isDefaultDir: true,
  isDownloadDirAvailable: true,
  downloadDirIssue: null,
  configError: '',
  sourceKind: 'idle', // 'idle' | 'playlist' | 'single' — input source shape
  singleTrack: null,
  singleResolution: null,
  selectedCandidateId: null,
  playlistTracks: null,
  playlistTitle: null,
  // Only meaningful when sourceKind === 'playlist' — 'album' | 'playlist',
  // from yt:fetch-playlist's classifyPlaylistKind. Drives which write path
  // syncImportedPlaylist() below takes.
  collectionKind: null,
  collectionReleaseType: 'unknown',
  collectionReleaseDate: null,
  collectionSource: null,
  collectionThumbnailUrl: null,
  createdPlaylistId: null,
  activeFilter: 'all',
  isResolving: false,
  isOpeningDiscovery: false,
  isImporting: false,
});
const readonlyState = readonly(state);
const draftRevision = shallowRef(0);

const playlistStats = computed(() =>
  getPlaylistImportStats(state.playlistTracks),
);

// A batch's failures are almost always the same underlying cause — one
// aggregated hint beats repeating it per track.
const dominantFailureCode = computed(() =>
  getDominantImportFailureCode(state.playlistTracks),
);

const visiblePlaylistTracks = computed(() =>
  filterPlaylistImportTracks(state.playlistTracks, state.activeFilter),
);

const selectablePlaylistTracks = computed(() =>
  (state.playlistTracks ?? []).filter(
    (track) => !track.alreadyDownloaded && track.status !== 'done',
  ),
);

const allSelected = computed(
  () =>
    selectablePlaylistTracks.value.length > 0 &&
    selectablePlaylistTracks.value.every((track) => track.selected),
);

const canConfirmImport = computed(() => {
  if (state.isResolving || state.isImporting) return false;
  if (state.sourceKind === 'single') {
    return Boolean(
      state.input.trim() &&
      state.singleTrack &&
      !state.singleTrack.alreadyDownloaded &&
      state.singleTrack.status !== 'done',
    );
  }
  if (state.sourceKind === 'playlist') {
    return hasImportableSelection(state.playlistTracks);
  }
  return false;
});

const canRetryFailed = computed(
  () => !state.isImporting && playlistStats.value.error > 0,
);

const filterOptions = computed(() =>
  IMPORT_FILTERS.map((filter) => ({
    ...filter,
    count: filterPlaylistImportTracks(state.playlistTracks, filter.key).length,
  })),
);

const confirmImportLabel = computed(() => {
  if (state.isImporting) {
    return state.sourceKind === 'playlist'
      ? t('import.session.stop')
      : t('import.session.downloading');
  }
  if (state.sourceKind === 'single') {
    if (state.singleTrack?.alreadyDownloaded) return t('import.session.exists');
    return t('import.session.downloadThis');
  }
  const { downloadableSelected, selected } = playlistStats.value;
  if (downloadableSelected > 0)
    return t('import.session.downloadCount', { count: downloadableSelected });
  // Everything selected is already local — nothing to download, but
  // confirming still syncs them into the playlist/album's trackIds.
  if (selected > 0) return t('import.session.addCount', { count: selected });
  return t('import.session.noneSelected');
});

const canUseConfirmButton = computed(() =>
  state.isImporting ? state.sourceKind === 'playlist' : canConfirmImport.value,
);

function setStatus(message = '', type = 'idle', scope = 'surface') {
  state.status = message;
  state.statusType = type;
  state.statusScope = scope;
  // Failure sites set this back right after calling setStatus — resetting
  // it here keeps a stale hint from a previous error surviving a new status.
  state.failureHint = '';
}

function reportImportError(error, operation, message) {
  return recordError(error, {
    title: t('import.session.failedTitle'),
    message,
    source: 'import',
    operation,
  });
}

function handleProviderSetupError(err) {
  const appError = normalizeAppError(err, {
    source: 'import',
    operation: 'provider-tool',
  });
  if (appError.code !== 'FEATURE_DEPENDENCY_MISSING') return false;
  const notice = recordError(err, {
    title: t('import.session.providerNotReadyTitle'),
    message: t('import.session.providerSetupMessage'),
    source: 'import',
    operation: 'provider-tool',
  });
  requestFeatureSetup(FEATURE_IDS.PROVIDER_FLOW, {
    title: t('import.session.providerToolTitle'),
    message: t('import.session.providerSetupMessage'),
    source: 'import',
    operation: 'provider-tool',
    context: {
      dependencyId: appError.context.dependencyId,
    },
  });
  setStatus(notice.message, 'pending');
  state.failureHint = t('import.session.providerToolHint');
  return true;
}

async function ensureProviderFlow({
  operation = 'resolve-source',
  message = t('import.session.providerRequired'),
} = {}) {
  const revision = draftRevision.value;
  const enabled = await requireFeatureGate(FEATURE_IDS.PROVIDER_FLOW, {
    source: 'import',
    operation,
    message,
  });
  if (!enabled && revision === draftRevision.value) {
    setStatus(t('import.session.providerRequiredStatus'), 'pending');
  }
  return enabled;
}

// State is exposed readonly(). The Dock and review modal use these bounded
// setters for input, filters and per-track selection instead of mutating the
// shared session through their presentation surfaces.
function setInput(value) {
  if (value === state.input) return;
  state.input = value;
  clearPreview();
  setStatus();
}

function setActiveFilter(key) {
  state.activeFilter = key;
}

// trackId, not a track object reference — a track reached through the
// readonly-wrapped state (e.g. in a test) is a *different*, deep-readonly
// proxy than the one the template's un-wrapped visiblePlaylistTracks
// exposes; mutating that reference directly no-ops silently instead of
// throwing. Looking the track up by id inside this module always finds the
// real, writable one.
function setTrackSelected(trackId, selected) {
  const track = state.playlistTracks?.find((t) => t.id === trackId);
  if (track) track.selected = selected;
}

function clearPreview() {
  draftRevision.value++;
  state.isImporting = false;
  state.sourceKind = 'idle';
  state.singleTrack = null;
  state.singleResolution = null;
  state.selectedCandidateId = null;
  state.playlistTracks = null;
  state.playlistTitle = null;
  state.collectionKind = null;
  state.collectionReleaseType = 'unknown';
  state.collectionReleaseDate = null;
  state.collectionSource = null;
  state.collectionThumbnailUrl = null;
  state.createdPlaylistId = null;
  state.activeFilter = 'all';
}

const importExecution = useImportExecution({
  state,
  getDraftRevision: () => draftRevision.value,
  canConfirmImport,
  canRetryFailed,
  ensureProviderFlow,
  handleProviderSetupError,
  reportImportError,
  setStatus,
});
registerProviderImportActivity(importExecution.activity);

const sourceResolution = useImportSourceResolution({
  state,
  getDraftRevision: () => draftRevision.value,
  clearPreview,
  ensureProviderFlow,
  handleProviderSetupError,
  reportImportError,
  setStatus,
});

const { cancelTrackDownload, confirmImport, retryFailedTracks } =
  importExecution;
const { openYoutubeMusicSearch, resolveSource, selectImportCandidate } =
  sourceResolution;

function toggleSelectAll() {
  const next = !allSelected.value;
  for (const track of selectablePlaylistTracks.value) {
    track.selected = next;
  }
}

function selectMissingTracks() {
  if (!state.playlistTracks) return;
  // Additive, not absolute: tracks default selected (see createPreviewTrack),
  // and upsertAlbum replaces trackIds wholesale on sync — forcibly
  // deselecting already-owned tracks here would drop them from the album on
  // the next confirm instead of just skipping their (unneeded) download.
  for (const track of state.playlistTracks) {
    if (!track.alreadyDownloaded && track.status !== 'done') {
      track.selected = true;
    }
  }
  state.activeFilter = 'missing';
}

function getTrackStatusClass(track) {
  if (track.status === 'done') return 'done';
  if (track.alreadyDownloaded) return 'downloaded';
  return track.status || 'pending';
}

function reportDirectoryFailure(
  error,
  operation,
  message,
  notifyFailure,
  action,
) {
  reportImportError(error, operation, message);
  if (notifyFailure) {
    notifications.notify({
      key: notificationKey.libraryDirectory(operation),
      title:
        operation === 'read-settings'
          ? t('import.session.libraryUnreadableTitle')
          : t('import.session.folderFailedTitle'),
      message,
      tone: 'danger',
      actionLabel: t('import.session.retry'),
      action,
    });
  } else {
    setStatus(message, 'error');
  }
}

async function refreshConfig({ notifyFailure = false } = {}) {
  try {
    const config = await window.Utawakui.getConfig();
    state.downloadDir = config.downloadDir;
    state.isDefaultDir = config.isDefault;
    state.isDownloadDirAvailable = config.available !== false;
    state.downloadDirIssue = config.reason || null;
    state.configError = '';
    notifications.clear(notificationKey.libraryDirectory('read-settings'));
    return true;
  } catch (error) {
    state.configError = t('import.session.libraryUnreadable');
    reportDirectoryFailure(
      error,
      'read-settings',
      t('import.session.settingsUnreadable'),
      notifyFailure,
      () => refreshConfig({ notifyFailure: true }),
    );
    return false;
  }
}

async function chooseDownloadDir({ notifyFailure = false } = {}) {
  try {
    await window.Utawakui.chooseDownloadDir();
    notifications.clear(notificationKey.libraryDirectory('choose-folder'));
    return refreshConfig({ notifyFailure });
  } catch (error) {
    reportDirectoryFailure(
      error,
      'choose-folder',
      t('import.session.folderUnchanged'),
      notifyFailure,
      () => chooseDownloadDir({ notifyFailure: true }),
    );
    return false;
  }
}

async function resetDownloadDir({ notifyFailure = false } = {}) {
  try {
    await window.Utawakui.resetDownloadDir();
    notifications.clear(notificationKey.libraryDirectory('reset-folder'));
    return refreshConfig({ notifyFailure });
  } catch (error) {
    reportDirectoryFailure(
      error,
      'reset-folder',
      t('import.session.folderNotReset'),
      notifyFailure,
      () => resetDownloadDir({ notifyFailure: true }),
    );
    return false;
  }
}

async function openDownloadDir({ notifyFailure = false } = {}) {
  try {
    await window.Utawakui.openDownloadDir();
    notifications.clear(notificationKey.libraryDirectory('open-folder'));
    return true;
  } catch (error) {
    reportDirectoryFailure(
      error,
      'open-folder',
      t('import.session.folderOpenFailed'),
      notifyFailure,
      () => openDownloadDir({ notifyFailure: true }),
    );
    return false;
  }
}

export function useImportSession() {
  return {
    activity: importExecution.activity,
    currentBatchId: computed(importExecution.currentBatchId),
    submitImport: importExecution.submitImport,
    cancelBatch: importExecution.cancelBatch,
    retryBatch: importExecution.retryBatch,
    dismissBatch: importExecution.dismissBatch,
    clearCompletedBatches: importExecution.clearCompletedBatches,
    state: readonlyState,
    playlistStats,
    dominantFailureCode,
    visiblePlaylistTracks,
    selectablePlaylistTracks,
    allSelected,
    canConfirmImport,
    canRetryFailed,
    filterOptions,
    confirmImportLabel,
    canUseConfirmButton,
    setInput,
    setActiveFilter,
    setTrackSelected,
    openYoutubeMusicSearch,
    resolveSource,
    cancelTrackDownload,
    confirmImport,
    selectImportCandidate,
    toggleSelectAll,
    selectMissingTracks,
    retryFailedTracks,
    getTrackStatusClass,
    refreshConfig,
    chooseDownloadDir,
    resetDownloadDir,
    openDownloadDir,
  };
}
