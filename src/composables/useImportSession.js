import { computed, reactive, readonly } from 'vue';
import {
  IMPORT_FILTERS,
  filterPlaylistImportTracks,
  getPlaylistImportStats,
  hasImportableSelection,
} from '../utils/importPlaylist.js';
import { normalizeAppError } from '../utils/appErrors.js';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { useImportExecution } from './import/useImportExecution.js';
import { useImportSourceResolution } from './import/useImportSourceResolution.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
const { requireFeatureGate, requestFeatureSetup } = useFeatureGateAccess();
const { recordError } = useAppDiagnostics();

const state = reactive({
  input: '',
  status: '',
  statusType: 'idle', // 'idle' | 'empty' | 'pending' | 'success' | 'error'
  failureHint: '',
  downloadDir: '',
  isDefaultDir: true,
  isDownloadDirAvailable: true,
  downloadDirIssue: null,
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
  collectionSource: null,
  collectionThumbnailUrl: null,
  createdPlaylistId: null,
  activeFilter: 'all',
  isResolving: false,
  isOpeningDiscovery: false,
  isImporting: false,
});

const playlistStats = computed(() =>
  getPlaylistImportStats(state.playlistTracks),
);

// A batch's failures are almost always the same underlying cause — one
// aggregated hint beats repeating it per track.
const dominantFailureCode = computed(() => {
  const counts = new Map();
  for (const track of state.playlistTracks ?? []) {
    if (track.status !== 'error' || !track.errorCode) continue;
    counts.set(track.errorCode, (counts.get(track.errorCode) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
});

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
    return state.sourceKind === 'playlist' ? '停止' : '下載中';
  }
  if (state.sourceKind === 'single') {
    if (state.singleTrack?.alreadyDownloaded) return '已存在';
    return '下載這首';
  }
  const { downloadableSelected, selected } = playlistStats.value;
  if (downloadableSelected > 0) return `下載 ${downloadableSelected} 首`;
  // Everything selected is already local — nothing to download, but
  // confirming still syncs them into the playlist/album's trackIds.
  if (selected > 0) return `加入 ${selected} 首`;
  return '沒有選取的曲目';
});

const canUseConfirmButton = computed(() =>
  state.isImporting ? state.sourceKind === 'playlist' : canConfirmImport.value,
);

function setStatus(message = '', type = 'idle') {
  state.status = message;
  state.statusType = type;
  // Failure sites set this back right after calling setStatus — resetting
  // it here keeps a stale hint from a previous error surviving a new status.
  state.failureHint = '';
}

function reportImportError(error, operation, message) {
  return recordError(error, {
    title: '匯入操作未完成',
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
    title: '外部來源尚未準備完成',
    message: '請到設定完成外部來源準備。',
    source: 'import',
    operation: 'provider-tool',
  });
  requestFeatureSetup(FEATURE_IDS.PROVIDER_FLOW, {
    title: '需要準備外部來源工具',
    message: '請到設定完成外部來源準備。',
    source: 'import',
    operation: 'provider-tool',
    context: {
      dependencyId: appError.context.dependencyId,
    },
  });
  setStatus(notice.message, 'pending');
  state.failureHint = '請在設定的「進階功能」中準備外部來源工具。';
  return true;
}

async function ensureProviderFlow({
  operation = 'resolve-source',
  message = '請先到設定啟用外部來源，才能解析或下載線上歌曲。',
} = {}) {
  const enabled = await requireFeatureGate(FEATURE_IDS.PROVIDER_FLOW, {
    source: 'import',
    operation,
    message,
  });
  if (!enabled) {
    setStatus('請先到設定啟用外部來源', 'pending');
  }
  return enabled;
}

// state is exposed readonly() — these three are the only fields ImportView
// binds two-way (input/activeFilter directly, individual track.selected
// checkboxes), so they're the only fields needing a setter.
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
  state.sourceKind = 'idle';
  state.singleTrack = null;
  state.singleResolution = null;
  state.selectedCandidateId = null;
  state.playlistTracks = null;
  state.playlistTitle = null;
  state.collectionKind = null;
  state.collectionSource = null;
  state.collectionThumbnailUrl = null;
  state.createdPlaylistId = null;
  state.activeFilter = 'all';
  importExecution.resetCancellation();
}

const importExecution = useImportExecution({
  state,
  canConfirmImport,
  canRetryFailed,
  dominantFailureCode,
  ensureProviderFlow,
  handleProviderSetupError,
  reportImportError,
  setStatus,
});

const sourceResolution = useImportSourceResolution({
  state,
  clearPreview,
  ensureProviderFlow,
  handleProviderSetupError,
  reportImportError,
  setStatus,
});

const { confirmImport, retryFailedTracks } = importExecution;
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

function getTrackStatusLabel(track) {
  if (track.status === 'done') return '完成';
  if (track.alreadyDownloaded) return '已存在';
  if (track.status === 'downloading') return '下載中';
  if (track.status === 'error') return '失敗';
  return '待下載';
}

function getTrackStatusClass(track) {
  if (track.status === 'done') return 'done';
  if (track.alreadyDownloaded) return 'downloaded';
  return track.status || 'pending';
}

async function refreshConfig() {
  try {
    const config = await window.Utawakui.getConfig();
    state.downloadDir = config.downloadDir;
    state.isDefaultDir = config.isDefault;
    state.isDownloadDirAvailable = config.available !== false;
    state.downloadDirIssue = config.reason || null;
    return true;
  } catch (error) {
    reportImportError(error, 'read-settings', '目前無法讀取匯入設定。');
    setStatus('目前無法讀取匯入設定，請再試一次。', 'error');
    return false;
  }
}

async function chooseDownloadDir() {
  try {
    await window.Utawakui.chooseDownloadDir();
    return refreshConfig();
  } catch (error) {
    reportImportError(error, 'choose-folder', '下載資料夾未變更。');
    setStatus('下載資料夾未變更，請再試一次。', 'error');
    return false;
  }
}

async function resetDownloadDir() {
  try {
    await window.Utawakui.resetDownloadDir();
    return refreshConfig();
  } catch (error) {
    reportImportError(error, 'reset-folder', '下載資料夾未重設。');
    setStatus('下載資料夾未重設，請再試一次。', 'error');
    return false;
  }
}

async function openDownloadDir() {
  try {
    await window.Utawakui.openDownloadDir();
    return true;
  } catch (error) {
    reportImportError(error, 'open-folder', '目前無法開啟下載資料夾。');
    setStatus('目前無法開啟下載資料夾，請再試一次。', 'error');
    return false;
  }
}

export function useImportSession() {
  return {
    state: readonly(state),
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
    confirmImport,
    clearPreview,
    selectImportCandidate,
    toggleSelectAll,
    selectMissingTracks,
    retryFailedTracks,
    getTrackStatusLabel,
    getTrackStatusClass,
    refreshConfig,
    chooseDownloadDir,
    resetDownloadDir,
    openDownloadDir,
  };
}
