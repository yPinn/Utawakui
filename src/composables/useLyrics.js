import { computed, nextTick, reactive, readonly, watch } from 'vue';
import { usePlayer } from './usePlayer.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { useLibrary } from './useLibrary.js';
import { usePlaylists } from './usePlaylists.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useLyricsAcquisition } from './lyrics/useLyricsAcquisition.js';
import { useLyricsSourceDocuments } from './lyrics/useLyricsSourceDocuments.js';
import { pickPreferredLyricsSource } from '../utils/lyrics.js';
import {
  deriveLyricsPlaybackState,
  normalizeLyricsDocument,
  projectLegacyLyricLines,
} from '../utils/lyricsDocument.js';
import { toPlayableTrack } from '../utils/playableTrack.js';

const EMPTY_LYRICS = Object.freeze({ status: 'unchecked', sources: [] });

const { state: playerState, playTrack, play, seek } = usePlayer();
const { setQueue } = usePlaybackQueue();
const { selectedPlaylist, initialize: initializePlaylists } = usePlaylists();
const { requireFeatureGate } = useFeatureGateAccess();
const { recordError } = useAppDiagnostics();
const {
  state: libraryState,
  tracksById,
  initialize: initializeLibrary,
  refresh: refreshLibrary,
} = useLibrary();

function reportLyricsError(error, operation, message, options = {}) {
  return recordError(error, {
    code: `LYRICS_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
    title: '歌詞操作未完成',
    message,
    source: 'lyrics',
    operation,
    context: { retryable: true },
    ...options,
  }).message;
}

const state = reactive({
  tracks: [],
  trackScope: 'all',
  selectedTrackId: null,
  selectedSourceFilename: null,
  lyricsText: '',
  lyricSource: null,
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
  candidateSearch: {
    isLoading: false,
    trackId: null,
    providerId: null,
    status: null,
    reason: null,
    candidates: [],
    groups: { best: [], related: [] },
    recordingGroups: { best: [], related: [] },
    providerStatuses: [],
    partial: false,
    invalidRecordCount: 0,
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
  offsetSave: {
    isSaving: false,
    error: null,
  },
  error: null,
  offsetSeconds: 0,
});

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

const sourceDocuments = useLyricsSourceDocuments({
  state,
  selectedTrack,
  reportLyricsError,
  refreshLibrary,
  selectSource: (filename) => selectSource(filename),
});
const {
  lyricsTiming,
  loadSelectedLyrics,
  waitForSelectedLyricsLoad,
  adjustOffset,
  resetOffset,
  retryOffsetSave,
  saveTimingDocument,
  setSourceLabel,
  deleteSource,
  importManualLyricsText,
  importManualLyricsFile,
} = sourceDocuments;

const acquisition = useLyricsAcquisition({
  state,
  selectedTrack,
  requireFeatureGate,
  reportLyricsError,
  refreshLibrary,
  selectSource: (filename) => selectSource(filename),
});
const {
  clearMusixmatchProbe,
  clearCandidateSearch,
  ensureLyricsFlow,
  probeMusixmatch,
  searchLyricsProviderCandidates,
  searchLyricsCandidates,
  saveLyricsProviderCandidate,
  saveLyricsCandidate,
  backfillSourceLabels,
} = acquisition;

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

function buildScopedTracks(pool) {
  if (state.trackScope === 'current-playlist') {
    return joinPlaylistTracks(pool, selectedPlaylist.value);
  }
  if (state.trackScope === 'local') {
    return pool.filter((track) => track.sourceType === 'local-file');
  }
  if (state.trackScope === 'missing-lyrics') {
    return pool.filter((track) => track?.lyrics?.status !== 'available');
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
  loadSelectedLyrics();
}

function setTrackScope(scope) {
  if (state.trackScope === scope) return;
  state.trackScope = scope;
  applyLibraryTracks();
}

async function refresh() {
  await refreshLibrary();
}

let initializationPromise = null;
function initialize() {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    await Promise.all([initializeLibrary(), initializePlaylists()]);
    await nextTick();
    await waitForSelectedLyricsLoad();
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
    setQueue(state.tracks, selectedTrack.value.id, {
      sourceName: '歌詞',
      sourceId: 'lyrics-workspace',
    });
    await playTrack(toPlayableTrack(selectedTrack.value));
  }
  seek(targetTime);
  await play();
}

const stopPlayerSync = watch(
  () => playerState.track?.id,
  (trackId) => {
    if (trackId && state.tracks.some((track) => track.id === trackId)) {
      selectTrack(trackId);
    }
  },
);

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

const stopLibraryErrorSync = watch(
  () => libraryState.error,
  (error) => {
    state.error = error?.message ?? error;
  },
  { immediate: true },
);

let unsubscribeLibraryBackfillStatus = null;
if (
  typeof window !== 'undefined' &&
  typeof window.Utawakui?.onLibraryBackfillStatus === 'function'
) {
  unsubscribeLibraryBackfillStatus =
    window.Utawakui.onLibraryBackfillStatus(applyBackfillStatus);
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
    retryOffsetSave,
    saveTimingDocument,
    playFromLine,
    probeMusixmatch,
    ensureLyricsFlow,
    clearCandidateSearch,
    searchLyricsProviderCandidates,
    searchLyricsCandidates,
    saveLyricsProviderCandidate,
    saveLyricsCandidate,
    backfillSourceLabels,
    setSourceLabel,
    deleteSource,
    importManualLyricsText,
    importManualLyricsFile,
  };
}
