import { computed, markRaw, reactive, readonly } from 'vue';
import {
  IMPORT_FILTERS,
  filterPlaylistImportTracks,
  getPlaylistImportStats,
  hasImportableSelection,
} from '../utils/importPlaylist.js';
import { usePlaylists } from './usePlaylists.js';

const {
  create: createPlaylist,
  setTracks: setPlaylistTracks,
  upsertAlbum,
} = usePlaylists();

const state = reactive({
  input: '',
  status: '',
  statusType: 'idle', // 'idle' | 'pending' | 'success' | 'error'
  downloadDir: '',
  isDefaultDir: true,
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
  createdPlaylistId: null,
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

function setStatus(message, type = 'idle') {
  state.status = message;
  state.statusType = type;
}

// state is exposed readonly() — these three are the only fields ImportView
// binds two-way (input/activeFilter directly, individual track.selected
// checkboxes), so they're the only fields needing a setter.
function setInput(value) {
  state.input = value;
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
  state.createdPlaylistId = null;
  state.activeFilter = 'all';
  cancelRequested = false;
}

function createPreviewTrack(entry) {
  return {
    ...entry,
    // Always default-selected, including already-owned tracks: upsertAlbum
    // fully replaces trackIds on every sync (see electron/lib/playlists.js),
    // so a track this preview shows but the user doesn't select gets
    // dropped from the resulting playlist/album, not just skipped.
    selected: true,
    status: 'pending',
    error: null,
  };
}

function candidateId(candidate) {
  return candidate?.playbackVideoId || candidate?.id || null;
}

function createSingleTrackFromResolution(resolution, selectedCandidate = null) {
  const candidate =
    selectedCandidate || resolution.recommendedCandidate || resolution.source;
  return createPreviewTrack({
    id: candidateId(candidate),
    title: candidate.title || resolution.canonical?.title || resolution.input,
    artist: candidate.artist || resolution.canonical?.artist,
    duration: candidate.duration || resolution.canonical?.duration,
    thumbnailUrl: candidate.thumbnailUrl || resolution.source?.thumbnailUrl,
    alreadyDownloaded: candidate.alreadyDownloaded,
    downloadInput: candidateId(candidate),
    sourceVideoId: resolution.sourceVideoId,
    playbackKind: candidate.playbackKind,
    trackIdentity: resolution.trackIdentity || candidate.trackIdentity,
    importResolution: resolution,
  });
}

function selectImportCandidate(candidateIdValue) {
  if (!state.singleResolution || state.isImporting) return;
  const candidate = state.singleResolution.candidates?.find(
    (entry) => candidateId(entry) === candidateIdValue,
  );
  if (!candidate) return;
  state.selectedCandidateId = candidateIdValue;
  state.singleTrack = createSingleTrackFromResolution(
    state.singleResolution,
    candidate,
  );
}

async function resolveSource() {
  const input = state.input.trim();
  if (!input) {
    setStatus('請貼上 YouTube 或 YouTube Music 連結', 'error');
    return;
  }

  clearPreview();
  setStatus('檢查連結中...', 'pending');
  state.isResolving = true;

  try {
    const playlistResult = await window.Utawakui.fetchYoutubePlaylist(input);
    const entries = playlistResult?.entries;
    if (entries && entries.length > 0) {
      state.sourceKind = 'playlist';
      state.playlistTitle = playlistResult.title || '未命名播放清單';
      state.collectionKind =
        playlistResult.kind === 'album' ? 'album' : 'playlist';
      // markRaw: this is only ever read back out whole (syncImportedPlaylist
      // hands it straight to upsertAlbum's IPC payload) and never displayed
      // field-by-field, so it doesn't need Vue's reactivity — and it must
      // NOT get reactive()'s deep-proxy treatment, because ipcRenderer.invoke
      // structured-clones its arguments, and a Proxy fails that clone with
      // "An object could not be cloned."
      state.collectionSource = playlistResult.source
        ? markRaw(playlistResult.source)
        : null;
      state.playlistTracks = entries.map(createPreviewTrack);
      setStatus(`已找到 ${entries.length} 首，請確認要下載的曲目`, 'success');
    } else {
      if (typeof window.Utawakui.resolveImportSource === 'function') {
        const resolution = await window.Utawakui.resolveImportSource(input);
        state.sourceKind = 'single';
        state.singleResolution = resolution;
        state.selectedCandidateId = candidateId(
          resolution.recommendedCandidate || resolution.source,
        );
        state.singleTrack = createSingleTrackFromResolution(resolution);
        setStatus('已找到歌曲，確認後開始下載', 'success');
        return;
      }

      if (typeof window.Utawakui.fetchVideoMetadata !== 'function') {
        state.sourceKind = 'single';
        state.singleTrack = createPreviewTrack({
          id: input,
          title: input,
          alreadyDownloaded: false,
        });
        setStatus(
          '需要重新啟動應用程式才能使用新版單曲預覽；目前仍可下載。',
          'pending',
        );
        return;
      }

      const metadata = await window.Utawakui.fetchVideoMetadata(input);
      state.sourceKind = 'single';
      state.singleTrack = createPreviewTrack(metadata);
      setStatus('已找到歌曲，確認後開始下載', 'success');
    }
  } catch (err) {
    clearPreview();
    setStatus(`找不到來源：${err.message}`, 'error');
  } finally {
    state.isResolving = false;
  }
}

async function importSingle() {
  const input = state.input.trim();
  const downloadInput =
    state.singleTrack?.downloadInput ||
    state.singleTrack?.playbackVideoId ||
    input;
  setStatus('下載中...', 'pending');
  state.isImporting = true;

  try {
    const result = await window.Utawakui.downloadAudio(downloadInput);
    if (state.singleTrack) state.singleTrack.status = 'done';
    setStatus(`已下載：${result.title || result.filePath}`, 'success');
    state.sourceKind = 'idle';
  } catch (err) {
    setStatus(`下載失敗：${err.message}`, 'error');
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

// Runs unconditionally after the download loop, including on cancel, so
// whatever succeeded before a stop is still captured.
//
// Album imports (state.collectionKind === 'album') go through upsertAlbum,
// keyed by source on the main-process side — a retry or a later
// re-import of the same album updates its track list in place, never
// creates a duplicate, so no session-local id needs tracking.
//
// Ordinary playlist imports keep the original create-once-per-session
// path: state.createdPlaylistId tracks the playlist across retries within
// this session so a retry re-syncs the same playlist with the current
// full success set instead of creating a duplicate.
async function syncImportedPlaylist() {
  const trackIds = state.playlistTracks
    .filter(
      (track) =>
        track.selected && (track.status === 'done' || track.alreadyDownloaded),
    )
    .map((track) => track.id);
  if (trackIds.length === 0) return false;

  if (state.collectionKind === 'album') {
    const upserted = await upsertAlbum({
      name: state.playlistTitle,
      source: state.collectionSource,
      trackIds,
    });
    return Boolean(upserted);
  }

  if (!state.createdPlaylistId) {
    const created = await createPlaylist(state.playlistTitle);
    if (!created) return false;
    state.createdPlaylistId = created.id;
  }
  await setPlaylistTracks(state.createdPlaylistId, trackIds);
  return true;
}

async function importPlaylist() {
  if (!state.playlistTracks || !hasImportableSelection(state.playlistTracks)) {
    return;
  }

  cancelRequested = false;
  state.isImporting = true;
  setStatus('下載選取曲目中...', 'pending');

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

    const playlistSynced = await syncImportedPlaylist();
    const stats = getPlaylistImportStats(state.playlistTracks);
    if (cancelRequested) {
      setStatus('已停止，未完成的曲目仍留在預覽中', 'pending');
    } else if (stats.error > 0) {
      setStatus(`下載完成，${stats.error} 首失敗`, 'error');
    } else if (playlistSynced) {
      setStatus(
        state.collectionKind === 'album'
          ? `已加入專輯「${state.playlistTitle}」`
          : `已加入播放清單「${state.playlistTitle}」`,
        'success',
      );
    } else {
      setStatus('下載完成', 'success');
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
  return '待下載';
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
    state: readonly(state),
    playlistStats,
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
  };
}
