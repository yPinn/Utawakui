import { computed, nextTick, reactive, readonly, shallowRef, watch } from 'vue';
import { usePlayer } from './usePlayer.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { useLibrary } from './useLibrary.js';
import { usePlaylists } from './usePlaylists.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { pickPreferredLyricsSource } from '../utils/lyrics.js';
import {
  deriveLyricsPlaybackState,
  normalizeLyricsDocument,
  projectLegacyLyricLines,
} from '../utils/lyricsDocument.js';
import { toPlayableTrack } from '../utils/playableTrack.js';

const EMPTY_LYRICS = { status: 'unchecked', sources: [] };
const EMPTY_TIMING = Object.freeze({
  status: 'missing',
  sourceFingerprint: null,
});

const { state: playerState, playTrack, play, seek } = usePlayer();
const { setQueue } = usePlaybackQueue();
const { selectedPlaylist, initialize: initializePlaylists } = usePlaylists();
const { requireFeatureGate } = useFeatureGateAccess();
const { recordError } = useAppDiagnostics();

function reportLyricsError(error, operation, message) {
  return recordError(error, {
    code: `LYRICS_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
    title: '歌詞操作未完成',
    message,
    source: 'lyrics',
    operation,
    context: { retryable: true },
  }).message;
}
// The full library pool (title/artist/lyrics/hasSeparation lookups) is
// shared with SetlistView.vue via this singleton — see useLibrary.js for why
// the fetch + onLibraryUpdated subscription moved out of here. Lyrics owns
// its own internal track scope/selection; the Setlist collection rail is only
// consulted when the user explicitly chooses the "current playlist" scope.
const {
  state: libraryState,
  tracksById,
  initialize: initializeLibrary,
  refresh: refreshLibrary,
} = useLibrary();

const state = reactive({
  tracks: [],
  trackScope: 'all',
  selectedTrackId: null,
  selectedSourceFilename: null,
  lyricsText: '',
  lyricSource: null,
  // Auto-unwrapped by reactive() — libraryState.isLoading is the only
  // writer, so this stays a live mirror rather than a value this module
  // manages itself.
  isLoading: computed(() => libraryState.isLoading),
  isLoadingLyrics: false,
  backfillStatus: {
    isRunning: false,
    total: 0,
    completed: 0,
    currentTrackId: null,
    currentTitle: null,
    error: null,
  },
  musixmatchProbe: {
    isLoading: false,
    trackId: null,
    result: null,
    error: null,
  },
  // Manual lrclib search — separate from the passive backfill above.
  candidateSearch: {
    isLoading: false,
    trackId: null,
    status: null, // 'ok' | 'unavailable' | 'error' | null
    reason: null,
    candidates: [],
    error: null,
  },
  manualSave: {
    isSaving: false,
    error: null,
  },
  timingSave: {
    isSaving: false,
    error: null,
  },
  error: null,
  offsetSeconds: 0,
});
// Timing documents can grow to thousands of lines/segments and are immutable
// snapshots. Replacing one shallow ref avoids recursively proxying the document
// while keeping useLyrics as the sole renderer owner.
const lyricsTiming = shallowRef(EMPTY_TIMING);

let unsubscribeLibraryBackfillStatus = null;
let lyricsRequestId = 0;
let musixmatchProbeRequestId = 0;
let candidateSearchRequestId = 0;
let initializationPromise = null;
let selectedLyricsLoad = Promise.resolve();

const selectedTrack = computed(
  () =>
    state.tracks.find((track) => track.id === state.selectedTrackId) ?? null,
);
const selectedLyrics = computed(
  () => selectedTrack.value?.lyrics ?? EMPTY_LYRICS,
);
const selectedSource = computed(() => {
  if (!state.selectedSourceFilename) return null;
  return (
    selectedLyrics.value.sources.find(
      (source) => source.filename === state.selectedSourceFilename,
    ) ?? null
  );
});
const lyricsDocument = computed(() =>
  normalizeLyricsDocument({
    text: state.lyricsText,
    source: selectedSource.value,
    sourceFingerprint: lyricsTiming.value.sourceFingerprint,
    normalizerProfileId: lyricsTiming.value.normalizerProfileId,
    timing: lyricsTiming.value,
  }),
);
const lyricLines = computed(() =>
  projectLegacyLyricLines(lyricsDocument.value),
);
const isSelectedTrackPlaying = computed(
  () =>
    Boolean(state.selectedTrackId) &&
    playerState.track?.id === state.selectedTrackId,
);
// For the track list's own per-row "current" cue — independent of
// selectedTrackId (which track's lyrics are open), not a duplicate of it.
const currentTrackId = computed(() => playerState.track?.id ?? null);
const currentLyricsPositionMs = computed(() =>
  isSelectedTrackPlaying.value
    ? (playerState.currentTime + state.offsetSeconds) * 1000
    : null,
);
const playbackState = computed(() =>
  deriveLyricsPlaybackState(
    lyricsDocument.value,
    currentLyricsPositionMs.value ?? Number.NaN,
    Number.isFinite(playerState.duration) ? playerState.duration * 1000 : null,
  ),
);
const activeLineIndex = computed(() => playbackState.value.activeLineIndex);
const activeLine = computed(() =>
  activeLineIndex.value >= 0 ? lyricLines.value[activeLineIndex.value] : null,
);
const activeLineId = computed(() => playbackState.value.activeLineId);
const activeSegmentId = computed(() => playbackState.value.activeSegmentId);
const isReloading = computed(
  () => state.isLoading || state.backfillStatus.isRunning,
);

function joinPlaylistTracks(pool, playlist) {
  if (!playlist) return [];
  const byId = new Map(pool.map((track) => [track.id, track]));
  return playlist.trackIds.map((id) => byId.get(id)).filter(Boolean);
}

function isMissingLyrics(track) {
  return track?.lyrics?.status !== 'available';
}

function buildScopedTracks(pool) {
  if (state.trackScope === 'current-playlist') {
    return joinPlaylistTracks(pool, selectedPlaylist.value);
  }
  if (state.trackScope === 'local') {
    return pool.filter((track) => track.sourceType === 'local-file');
  }
  if (state.trackScope === 'missing-lyrics') {
    return pool.filter(isMissingLyrics);
  }
  if (state.trackScope === 'available-lyrics') {
    return pool.filter((track) => track.lyrics?.status === 'available');
  }
  return pool;
}

function pickSelectedTrackId(tracks) {
  if (
    playerState.track?.id &&
    tracks.some((track) => track.id === playerState.track.id)
  ) {
    return playerState.track.id;
  }
  if (
    state.selectedTrackId &&
    tracks.some((track) => track.id === state.selectedTrackId)
  ) {
    return state.selectedTrackId;
  }
  return tracks[0]?.id ?? null;
}

function clearMusixmatchProbe() {
  musixmatchProbeRequestId += 1;
  state.musixmatchProbe.isLoading = false;
  state.musixmatchProbe.trackId = null;
  state.musixmatchProbe.result = null;
  state.musixmatchProbe.error = null;
}

function clearCandidateSearch() {
  candidateSearchRequestId += 1;
  state.candidateSearch.isLoading = false;
  state.candidateSearch.trackId = null;
  state.candidateSearch.status = null;
  state.candidateSearch.reason = null;
  state.candidateSearch.candidates = [];
  state.candidateSearch.error = null;
}

async function ensureLyricsFlow(options = {}) {
  const enabled = await requireFeatureGate(FEATURE_IDS.LYRICS_FLOW, {
    source: 'lyrics',
    operation: options.operation || 'external-source',
    message: '請先到設定啟用歌詞來源，才能搜尋、保存或整理線上歌詞。',
  });
  if (!enabled) {
    const message = '請先到設定啟用歌詞來源';
    if (options.errorTarget === 'musixmatchProbe') {
      state.musixmatchProbe.error = message;
    } else if (options.errorTarget === 'manualSave') {
      state.manualSave.error = message;
    } else {
      state.candidateSearch.error = message;
    }
  }
  return enabled;
}

async function loadSelectedLyrics() {
  const track = selectedTrack.value;
  const filename = state.selectedSourceFilename;
  lyricsRequestId += 1;
  const requestId = lyricsRequestId;

  state.lyricsText = '';
  state.lyricSource = null;
  lyricsTiming.value = EMPTY_TIMING;
  if (!track || !filename) return;

  if (typeof window.Utawakui?.getTrackLyrics !== 'function') {
    state.error = '請重新啟動應用程式後再讀取歌詞。';
    return;
  }

  state.isLoadingLyrics = true;
  try {
    const result = await window.Utawakui.getTrackLyrics(track.id, filename);
    if (requestId !== lyricsRequestId) return;
    state.lyricsText = result?.text ?? '';
    state.lyricSource = result?.source ?? null;
    lyricsTiming.value = result?.timing ?? EMPTY_TIMING;
    state.error = null;
  } catch (err) {
    if (requestId !== lyricsRequestId) return;
    state.error = reportLyricsError(
      err,
      'load',
      '目前無法讀取歌詞，請再試一次。',
    );
  } finally {
    if (requestId === lyricsRequestId) state.isLoadingLyrics = false;
  }
}

function applyLibraryTracks() {
  const previousTrackId = state.selectedTrackId;
  state.tracks = buildScopedTracks(libraryState.tracks);
  const nextTrackId = pickSelectedTrackId(state.tracks);
  state.selectedTrackId = nextTrackId;
  if (state.musixmatchProbe.trackId !== nextTrackId) {
    clearMusixmatchProbe();
  }
  if (state.candidateSearch.trackId !== nextTrackId) {
    clearCandidateSearch();
  }
  const currentFilename =
    previousTrackId === state.selectedTrackId
      ? state.selectedSourceFilename
      : null;
  state.selectedSourceFilename =
    pickPreferredLyricsSource(selectedTrack.value, currentFilename)?.filename ??
    null;
  selectedLyricsLoad = loadSelectedLyrics();
}

function setTrackScope(scope) {
  if (state.trackScope === scope) return;
  state.trackScope = scope;
  applyLibraryTracks();
}

// The "重新掃描" (reload) button's handler — delegates the actual fetch to
// the shared singleton (which also updates SetlistView.vue's copy).
// applyLibraryTracks() reruns on its own via the libraryState.tracks watch
// below once the fetch resolves, and state.error mirrors libraryState.error
// via its own watch below too, so this only needs to trigger the fetch.
async function refresh() {
  await refreshLibrary();
}

function initialize() {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    await Promise.all([initializeLibrary(), initializePlaylists()]);
    await nextTick();
    await selectedLyricsLoad;
  })();
  return initializationPromise;
}

function selectTrack(trackId) {
  if (state.selectedTrackId === trackId) return;
  const track = state.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return;
  state.selectedTrackId = track.id;
  state.selectedSourceFilename =
    pickPreferredLyricsSource(track)?.filename ?? null;
  state.offsetSeconds = 0;
  clearMusixmatchProbe();
  clearCandidateSearch();
  loadSelectedLyrics();
}

function selectSource(filename) {
  if (state.selectedSourceFilename === filename) return;
  state.selectedSourceFilename = filename;
  state.offsetSeconds = 0;
  loadSelectedLyrics();
}

function adjustOffset(deltaSeconds) {
  state.offsetSeconds =
    Math.round((state.offsetSeconds + deltaSeconds) * 10) / 10;
}

function resetOffset() {
  state.offsetSeconds = 0;
}

async function saveTimingDocument(document) {
  const trackId = state.selectedTrackId;
  const sourceFilename = state.selectedSourceFilename;
  const sourceFingerprint = lyricsTiming.value.sourceFingerprint;
  if (!trackId || !sourceFilename || !sourceFingerprint) {
    state.timingSave.error = '目前歌詞來源缺少可驗證的版本資訊。';
    return null;
  }
  if (typeof window.Utawakui?.saveLyricsTiming !== 'function') {
    state.timingSave.error = '請重新啟動應用程式後再儲存歌詞時間。';
    return null;
  }

  state.timingSave.isSaving = true;
  state.timingSave.error = null;
  try {
    const timing = await window.Utawakui.saveLyricsTiming(
      trackId,
      sourceFilename,
      sourceFingerprint,
      document,
    );
    if (
      state.selectedTrackId === trackId &&
      state.selectedSourceFilename === sourceFilename &&
      lyricsTiming.value.sourceFingerprint === sourceFingerprint
    ) {
      lyricsTiming.value = timing;
    }
    return timing?.document ?? document;
  } catch (err) {
    state.timingSave.error = reportLyricsError(
      err,
      'save-timing',
      '歌詞時間未儲存，請再試一次。',
    );
    return null;
  } finally {
    state.timingSave.isSaving = false;
  }
}

function applyBackfillStatus(payload = {}) {
  state.backfillStatus.isRunning = Boolean(payload.isRunning);
  state.backfillStatus.total = Number.isFinite(payload.total)
    ? payload.total
    : state.backfillStatus.total;
  state.backfillStatus.completed = Number.isFinite(payload.completed)
    ? payload.completed
    : state.backfillStatus.completed;
  state.backfillStatus.currentTrackId = payload.trackId ?? null;
  state.backfillStatus.currentTitle = payload.title ?? null;
  state.backfillStatus.error =
    payload.stage === 'error' ? '部分曲目資訊未更新。' : null;

  if (payload.stage === 'idle') {
    state.backfillStatus.total = 0;
    state.backfillStatus.completed = 0;
    state.backfillStatus.currentTrackId = null;
    state.backfillStatus.currentTitle = null;
  }
}

async function playFromLine(line) {
  if (!line || !Number.isFinite(line.start) || !selectedTrack.value) return;
  const targetTime = Math.max(0, line.start - state.offsetSeconds);
  if (playerState.track?.id !== selectedTrack.value.id) {
    // Queue the Lyrics workspace's own track pool, not the Setlist sidebar's
    // selection. Lyrics is an internal work surface; the persistent playlist
    // rail should not become its hidden queue/source owner.
    setQueue(state.tracks, selectedTrack.value.id, {
      sourceName: '歌詞',
      sourceId: 'lyrics-workspace',
    });
    await playTrack(toPlayableTrack(selectedTrack.value));
  }
  seek(targetTime);
  await play();
}

async function probeMusixmatch() {
  const track = selectedTrack.value;
  if (!track) return null;
  if (!(await ensureLyricsFlow({ errorTarget: 'musixmatchProbe' }))) {
    return null;
  }

  musixmatchProbeRequestId += 1;
  const requestId = musixmatchProbeRequestId;

  state.musixmatchProbe.isLoading = true;
  state.musixmatchProbe.trackId = track.id;
  state.musixmatchProbe.result = null;
  state.musixmatchProbe.error = null;

  if (typeof window.Utawakui?.probeMusixmatchLyrics !== 'function') {
    state.musixmatchProbe.isLoading = false;
    state.musixmatchProbe.error = '請重新啟動應用程式後再檢查歌詞來源。';
    return null;
  }

  try {
    const result = await window.Utawakui.probeMusixmatchLyrics(track.id);
    if (requestId !== musixmatchProbeRequestId) return null;
    state.musixmatchProbe.result = result;
    return result;
  } catch (err) {
    if (requestId !== musixmatchProbeRequestId) return null;
    state.musixmatchProbe.error = reportLyricsError(
      err,
      'probe-source',
      '目前無法檢查歌詞來源，請再試一次。',
    );
    return null;
  } finally {
    if (requestId === musixmatchProbeRequestId) {
      state.musixmatchProbe.isLoading = false;
    }
  }
}

async function searchLyricsCandidates() {
  const track = selectedTrack.value;
  if (!track) return;
  if (!(await ensureLyricsFlow())) return;

  candidateSearchRequestId += 1;
  const requestId = candidateSearchRequestId;

  state.candidateSearch.isLoading = true;
  state.candidateSearch.trackId = track.id;
  state.candidateSearch.error = null;

  if (typeof window.Utawakui?.searchLyricsCandidates !== 'function') {
    state.candidateSearch.isLoading = false;
    state.candidateSearch.error = '請重新啟動應用程式後再搜尋歌詞。';
    return;
  }

  try {
    const result = await window.Utawakui.searchLyricsCandidates(track.id);
    if (requestId !== candidateSearchRequestId) return;
    state.candidateSearch.status = result?.status ?? null;
    state.candidateSearch.reason =
      result?.status === 'error'
        ? '請稍後再試一次。'
        : result?.status === 'unavailable'
          ? '目前沒有合適的候選歌詞。'
          : null;
    state.candidateSearch.candidates = result?.candidates ?? [];
  } catch (err) {
    if (requestId !== candidateSearchRequestId) return;
    state.candidateSearch.error = reportLyricsError(
      err,
      'search',
      '目前無法搜尋歌詞，請再試一次。',
    );
  } finally {
    if (requestId === candidateSearchRequestId) {
      state.candidateSearch.isLoading = false;
    }
  }
}

// main also broadcasts library:updated after a save, but that's fire-and-
// forget — this explicit refresh is what lets selectSource() run only
// once selectedLyrics.sources actually contains the new filename.
async function saveLyricsCandidate(candidateId) {
  const track = selectedTrack.value;
  if (!track) return null;
  if (!(await ensureLyricsFlow())) return null;

  if (typeof window.Utawakui?.saveLyricsCandidate !== 'function') {
    state.manualSave.error = '請重新啟動應用程式後再儲存歌詞。';
    return null;
  }

  state.manualSave.isSaving = true;
  state.manualSave.error = null;
  try {
    const result = await window.Utawakui.saveLyricsCandidate(
      track.id,
      candidateId,
    );
    await refreshLibrary();
    selectSource(result.source.filename);
    return result;
  } catch (err) {
    state.manualSave.error = reportLyricsError(
      err,
      'save-candidate',
      '歌詞未儲存，請再試一次。',
    );
    return null;
  } finally {
    state.manualSave.isSaving = false;
  }
}

// One-time repair for lrclib sources saved before the label field existed.
async function backfillSourceLabels() {
  const track = selectedTrack.value;
  if (!track) return null;
  if (!(await ensureLyricsFlow())) return null;

  if (typeof window.Utawakui?.backfillLyricsSourceLabels !== 'function') {
    state.manualSave.error = '請重新啟動應用程式後再更新標籤。';
    return null;
  }

  state.manualSave.isSaving = true;
  state.manualSave.error = null;
  try {
    const result = await window.Utawakui.backfillLyricsSourceLabels(track.id);
    await refreshLibrary();
    return result;
  } catch (err) {
    state.manualSave.error = reportLyricsError(
      err,
      'backfill-labels',
      '標籤未更新，請再試一次。',
    );
    return null;
  } finally {
    state.manualSave.isSaving = false;
  }
}

// A blank label clears it back to plain language/kind display.
async function setSourceLabel(filename, label) {
  const track = selectedTrack.value;
  if (!track) return null;

  if (typeof window.Utawakui?.setLyricsSourceLabel !== 'function') {
    state.manualSave.error = '請重新啟動應用程式後再編輯標籤。';
    return null;
  }

  state.manualSave.isSaving = true;
  state.manualSave.error = null;
  try {
    const result = await window.Utawakui.setLyricsSourceLabel(
      track.id,
      filename,
      label,
    );
    await refreshLibrary();
    return result;
  } catch (err) {
    state.manualSave.error = reportLyricsError(
      err,
      'set-label',
      '標籤未更新，請再試一次。',
    );
    return null;
  } finally {
    state.manualSave.isSaving = false;
  }
}

// Falls the active selection off the deleted filename so
// loadSelectedLyrics() doesn't keep requesting a file that's now gone.
async function deleteSource(filename) {
  const track = selectedTrack.value;
  if (!track) return null;

  if (typeof window.Utawakui?.deleteLyricsSource !== 'function') {
    state.manualSave.error = '請重新啟動應用程式後再刪除歌詞來源。';
    return null;
  }

  state.manualSave.isSaving = true;
  state.manualSave.error = null;
  try {
    const result = await window.Utawakui.deleteLyricsSource(track.id, filename);
    await refreshLibrary();
    if (state.selectedSourceFilename === filename) {
      selectSource(result.sources[0]?.filename ?? '');
    }
    return result;
  } catch (err) {
    state.manualSave.error = reportLyricsError(
      err,
      'delete-source',
      '無法刪除歌詞來源，請再試一次。',
    );
    return null;
  } finally {
    state.manualSave.isSaving = false;
  }
}

async function importManualLyricsText(payload) {
  const track = selectedTrack.value;
  if (!track) return null;

  if (typeof window.Utawakui?.importLyricsText !== 'function') {
    state.manualSave.error = '請重新啟動應用程式後再匯入歌詞。';
    return null;
  }

  state.manualSave.isSaving = true;
  state.manualSave.error = null;
  try {
    const result = await window.Utawakui.importLyricsText(track.id, payload);
    await refreshLibrary();
    if (result?.source?.filename) selectSource(result.source.filename);
    return result;
  } catch (err) {
    state.manualSave.error = reportLyricsError(
      err,
      'import-text',
      '歌詞未匯入，請再試一次。',
    );
    return null;
  } finally {
    state.manualSave.isSaving = false;
  }
}

async function importManualLyricsFile() {
  const track = selectedTrack.value;
  if (!track) return null;

  if (typeof window.Utawakui?.importLyricsFile !== 'function') {
    state.manualSave.error = '請重新啟動應用程式後再匯入歌詞檔。';
    return null;
  }

  state.manualSave.isSaving = true;
  state.manualSave.error = null;
  try {
    const result = await window.Utawakui.importLyricsFile(track.id);
    if (!result) return null;
    await refreshLibrary();
    if (result?.source?.filename) selectSource(result.source.filename);
    return result;
  } catch (err) {
    state.manualSave.error = reportLyricsError(
      err,
      'import-file',
      '歌詞未匯入，請再試一次。',
    );
    return null;
  } finally {
    state.manualSave.isSaving = false;
  }
}

const stopPlayerSync = watch(
  () => playerState.track?.id,
  (trackId) => {
    if (trackId && state.tracks.some((track) => track.id === trackId)) {
      selectTrack(trackId);
    }
  },
);

// Reruns whenever the shared library pool changes, whether from this
// module's own refresh(), SetlistView.vue's, or the singleton's own
// onLibraryUpdated subscription — immediate so it applies whatever's
// already in libraryState.tracks (possibly already loaded by another
// consumer) instead of waiting for the next change.
const stopLibrarySync = watch(
  () => [
    libraryState.tracks,
    state.trackScope,
    state.trackScope === 'current-playlist'
      ? (selectedPlaylist.value?.id ?? null)
      : null,
    state.trackScope === 'current-playlist'
      ? (selectedPlaylist.value?.trackIds.join('\0') ?? '')
      : '',
  ],
  () => applyLibraryTracks(),
  { immediate: true },
);

// Mirrors fetch errors from every path that can update the shared pool
// (initial load, SetlistView.vue's onMounted re-fetch, the
// onLibraryUpdated subscription, and this module's own refresh()) — not
// just the last one, which unconditionally overwriting state.error also
// clears a stale error on the next successful fetch.
const stopLibraryErrorSync = watch(
  () => libraryState.error,
  (error) => {
    state.error = error?.message ?? error;
  },
  { immediate: true },
);

if (typeof window !== 'undefined' && window.Utawakui) {
  if (typeof window.Utawakui.onLibraryBackfillStatus === 'function') {
    unsubscribeLibraryBackfillStatus =
      window.Utawakui.onLibraryBackfillStatus(applyBackfillStatus);
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopPlayerSync();
    stopLibrarySync();
    stopLibraryErrorSync();
    unsubscribeLibraryBackfillStatus?.();
  });
}

export function useLyrics() {
  return {
    state: readonly(state),
    tracksById,
    selectedTrack,
    selectedLyrics,
    selectedSource,
    lyricsTiming: readonly(lyricsTiming),
    lyricsDocument,
    lyricLines,
    activeLine,
    activeLineIndex,
    activeLineId,
    activeSegmentId,
    playbackState,
    isSelectedTrackPlaying,
    currentTrackId,
    currentLyricsPositionMs,
    isReloading,
    initialize,
    refresh,
    setTrackScope,
    selectTrack,
    selectSource,
    adjustOffset,
    resetOffset,
    saveTimingDocument,
    playFromLine,
    probeMusixmatch,
    ensureLyricsFlow,
    searchLyricsCandidates,
    saveLyricsCandidate,
    backfillSourceLabels,
    setSourceLabel,
    deleteSource,
    importManualLyricsText,
    importManualLyricsFile,
  };
}
