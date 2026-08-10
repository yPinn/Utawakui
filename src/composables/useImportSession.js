import { computed, reactive } from 'vue';
import {
  IMPORT_FILTERS,
  filterPlaylistImportTracks,
  getPlaylistImportStats,
  hasImportableSelection,
} from '../utils/importPlaylist.js';

const state = reactive({
  input: '',
  status: '',
  statusType: 'idle', // 'idle' | 'pending' | 'success' | 'error'
  downloadDir: '',
  isDefaultDir: true,
  sourceKind: 'idle', // 'idle' | 'playlist' | 'single'
  singleTrack: null,
  playlistTracks: null,
  activeFilter: 'all',
  isResolving: false,
  isImporting: false,
});

let cancelRequested = false;

const playlistStats = computed(() =>
  getPlaylistImportStats(state.playlistTracks),
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
      Boolean(state.input.trim()) &&
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
    return state.sourceKind === 'playlist' ? '停止在下一首前' : '下載中';
  }
  if (state.sourceKind === 'single') {
    if (state.singleTrack?.alreadyDownloaded) return '已存在';
    return '確認匯入單曲';
  }
  const count = playlistStats.value.downloadableSelected;
  return count > 0 ? `確認匯入 ${count} 首` : '沒有可匯入曲目';
});

const canUseConfirmButton = computed(() =>
  state.isImporting ? state.sourceKind === 'playlist' : canConfirmImport.value,
);

function setStatus(message, type = 'idle') {
  state.status = message;
  state.statusType = type;
}

function clearPreview() {
  state.sourceKind = 'idle';
  state.singleTrack = null;
  state.playlistTracks = null;
  state.activeFilter = 'all';
  cancelRequested = false;
}

function createPreviewTrack(entry) {
  return {
    ...entry,
    selected: !entry.alreadyDownloaded,
    status: 'pending',
    error: null,
  };
}

async function resolveSource() {
  const input = state.input.trim();
  if (!input) {
    setStatus('請輸入 YouTube 影片或播放清單 URL', 'error');
    return;
  }

  clearPreview();
  setStatus('正在解析來源...', 'pending');
  state.isResolving = true;

  try {
    const entries = await window.Utawakui.listPlaylist(input);
    if (entries && entries.length > 0) {
      state.sourceKind = 'playlist';
      state.playlistTracks = entries.map(createPreviewTrack);
      setStatus(`已建立 ${entries.length} 首曲目的預覽快照`, 'success');
    } else {
      if (typeof window.Utawakui.fetchVideoMetadata !== 'function') {
        state.sourceKind = 'single';
        state.singleTrack = createPreviewTrack({
          id: input,
          title: input,
          alreadyDownloaded: false,
        });
        setStatus(
          '單曲預覽需要重新啟動應用程式才能載入新版橋接 API；仍可確認匯入。',
          'pending',
        );
        return;
      }

      const metadata = await window.Utawakui.fetchVideoMetadata(input);
      state.sourceKind = 'single';
      state.singleTrack = createPreviewTrack(metadata);
      setStatus('已辨識為單曲來源，確認後才會下載', 'success');
    }
  } catch (err) {
    clearPreview();
    setStatus(`解析失敗：${err.message}`, 'error');
  } finally {
    state.isResolving = false;
  }
}

async function importSingle() {
  const input = state.input.trim();
  setStatus('下載中...', 'pending');
  state.isImporting = true;

  try {
    const result = await window.Utawakui.downloadAudio(input);
    if (state.singleTrack) state.singleTrack.status = 'done';
    setStatus(`已匯入：${result.title || result.filePath}`, 'success');
    state.sourceKind = 'idle';
  } catch (err) {
    setStatus(`匯入失敗：${err.message}`, 'error');
  } finally {
    state.isImporting = false;
  }
}

function toggleSelectAll() {
  const next = !allSelected.value;
  for (const track of selectablePlaylistTracks.value) {
    track.selected = next;
  }
}

function selectMissingTracks() {
  if (!state.playlistTracks) return;
  for (const track of state.playlistTracks) {
    track.selected = !track.alreadyDownloaded && track.status !== 'done';
  }
  state.activeFilter = 'missing';
}

function selectFailedTracks() {
  if (!state.playlistTracks) return;
  for (const track of state.playlistTracks) {
    if (track.status === 'error') track.selected = true;
  }
  state.activeFilter = 'failed';
}

async function downloadPlaylistTrack(track) {
  if (track.alreadyDownloaded || track.status === 'done') return;

  track.status = 'downloading';
  track.error = null;

  try {
    await window.Utawakui.downloadAudio(track.id);
    track.status = 'done';
  } catch (err) {
    track.status = 'error';
    track.error = err.message;
  }
}

async function importPlaylist() {
  if (!state.playlistTracks || !hasImportableSelection(state.playlistTracks)) {
    return;
  }

  cancelRequested = false;
  state.isImporting = true;
  setStatus('批次匯入中...', 'pending');

  try {
    for (const track of state.playlistTracks) {
      if (cancelRequested) break;
      if (
        !track.selected ||
        track.alreadyDownloaded ||
        track.status === 'done'
      ) {
        continue;
      }
      await downloadPlaylistTrack(track);
    }

    const stats = getPlaylistImportStats(state.playlistTracks);
    if (cancelRequested) {
      setStatus('已停止，未開始的曲目保留待下載', 'pending');
    } else if (stats.error > 0) {
      setStatus(`批次完成，${stats.error} 首需要重試`, 'error');
    } else {
      setStatus('批次匯入完成', 'success');
    }
  } finally {
    state.isImporting = false;
  }
}

function cancelImport() {
  cancelRequested = true;
}

async function confirmImport() {
  if (state.isImporting) {
    cancelImport();
    return;
  }
  if (!canConfirmImport.value) return;
  if (state.sourceKind === 'single') {
    await importSingle();
    return;
  }
  await importPlaylist();
}

async function retryFailedTracks() {
  if (!canRetryFailed.value) return;
  selectFailedTracks();
  await importPlaylist();
}

function getTrackStatusLabel(track) {
  if (track.status === 'done') return '完成';
  if (track.alreadyDownloaded) return '已存在';
  if (track.status === 'downloading') return '下載中';
  if (track.status === 'error') return '失敗';
  return '待確認';
}

function getTrackStatusClass(track) {
  if (track.status === 'done') return 'done';
  if (track.alreadyDownloaded) return 'downloaded';
  return track.status || 'pending';
}

async function refreshConfig() {
  const config = await window.Utawakui.getConfig();
  state.downloadDir = config.downloadDir;
  state.isDefaultDir = config.isDefault;
}

async function chooseDownloadDir() {
  await window.Utawakui.chooseDownloadDir();
  await refreshConfig();
}

async function resetDownloadDir() {
  await window.Utawakui.resetDownloadDir();
  await refreshConfig();
}

export function useImportSession() {
  return {
    state,
    playlistStats,
    visiblePlaylistTracks,
    selectablePlaylistTracks,
    allSelected,
    canConfirmImport,
    canRetryFailed,
    filterOptions,
    confirmImportLabel,
    canUseConfirmButton,
    resolveSource,
    confirmImport,
    clearPreview,
    toggleSelectAll,
    selectMissingTracks,
    retryFailedTracks,
    getTrackStatusLabel,
    getTrackStatusClass,
    refreshConfig,
    chooseDownloadDir,
    resetDownloadDir,
  };
}
