import { computed, nextTick, reactive, readonly, shallowRef, watch } from 'vue';
import { usePlayer } from './usePlayer.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlaybackTransport } from './usePlaybackTransport.js';
import { useLibrary } from './useLibrary.js';
import { usePlaylists } from './usePlaylists.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useLyricsAcquisition } from './lyrics/useLyricsAcquisition.js';
import { useLyricsSourceDocuments } from './lyrics/useLyricsSourceDocuments.js';
import { useExperimentalLyrics } from './lyrics/useExperimentalLyrics.js';
import { useLyricsClock } from './lyrics/useLyricsClock.js';
import { useLyricsTextProcessing } from './lyrics/useLyricsTextProcessing.js';
import { useLyricsSourcePresentation } from './lyrics/useLyricsSourcePresentation.js';
import { pickPreferredLyricsSource } from '../utils/lyrics.js';
import { useLinkedLyricsReference } from './lyrics/useLinkedLyricsReference.js';
import { useLyricsPlaybackProjection } from './lyrics/useLyricsPlaybackProjection.js';
import { normalizeLyricsDocument } from '../utils/lyricsDocument.js';
import {
  DEFAULT_LYRICS_TEXT_VARIANT,
  LYRICS_TEXT_VARIANTS,
} from '../utils/lyricsTextVariantValues.js';
import { lyricsTextVariantLoader } from '../utils/lyricsTextVariantLoader.js';
import { useLyricsPlaybackNavigation } from './lyrics/useLyricsPlaybackNavigation.js';
import { t } from '../utils/i18n.js';
const EMPTY_LYRICS = Object.freeze({ status: 'unchecked', sources: [] });
const lyricsTextVariant = shallowRef(DEFAULT_LYRICS_TEXT_VARIANT);
const player = usePlayer();
const { state: playerState, samplePlaybackClock } = player;
const { setQueue } = usePlaybackQueue();
const { arrangementBusy } = usePlaybackTransport();
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
    title: t('lyricsSource.errorTitle'),
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
  playbackOffsetSeconds: computed(
    () => linkedReference.value?.offsetSeconds ?? state.offsetSeconds,
  ),
  linkedReferenceHidden: computed(() => reference.isHidden.value),
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
  selectSource,
  prepareLyrics: (result) =>
    lyricsTextVariantLoader.prepare(
      normalizeLyricsDocument({
        text: result?.text ?? '',
        source: result?.source ?? selectedSource.value,
        sourceFingerprint: result?.timing?.sourceFingerprint ?? null,
        normalizerProfileId: result?.timing?.normalizerProfileId,
        timing: result?.timing,
      }),
    ),
});
const {
  lyricsTiming,
  lyricsAcousticEstimate,
  loadSelectedLyrics,
  waitForSelectedLyricsLoad,
  resetOffset,
  retryOffsetSave,
  saveTimingDocument,
  setSourceLabel,
  forkAuthoredLyrics,
  editAuthoredLyrics,
  deleteSource: deleteSourceDocument,
  importManualLyricsText,
  importManualLyricsFile,
} = sourceDocuments;
const reference = useLinkedLyricsReference({
  state,
  selectedTrack,
  selectedLyrics,
  tracksById,
  lyricsTiming,
  selectSource,
  copyLinkedReference: sourceDocuments.copyLinkedReference,
});
const {
  linkedReference,
  applyLinkedReference,
  hasLinkedReference,
  toggleLinkedReference,
} = reference;

const acquisition = useLyricsAcquisition({
  state,
  selectedTrack,
  requireFeatureGate,
  reportLyricsError,
  refreshLibrary,
  selectSource,
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

async function deleteSource(filename) {
  const trackId = state.selectedTrackId;
  const result = await deleteSourceDocument(filename);
  if (
    result?.sources &&
    !result.sources.some((source) => source.filename === filename)
  ) {
    acquisition.markStoredSourceRemoved(trackId, filename);
  }
  return result;
}

const lyricsDocument = computed(() =>
  normalizeLyricsDocument({
    text: state.lyricsText,
    source: selectedSource.value,
    sourceFingerprint: lyricsTiming.value.sourceFingerprint,
    normalizerProfileId: lyricsTiming.value.normalizerProfileId,
    timing: lyricsTiming.value,
  }),
);
const displayLyricsDocument = computed(() =>
  lyricsTextVariantLoader.project(
    linkedReference.value?.document ?? lyricsDocument.value,
    {
      variant: lyricsTextVariant.value,
    },
  ),
);
const lyricsTextProcessing = useLyricsTextProcessing({
  document: lyricsDocument,
  performers: () => [selectedTrack.value?.artist],
  trackId: () => state.selectedTrackId,
  reportError: reportLyricsError,
  sourceKey: () =>
    `${state.selectedTrackId ?? ''}/${state.selectedSourceFilename ?? ''}`,
});
const currentTrackId = computed(() => playerState.track?.id ?? null);
const currentLyricsPositionMs = shallowRef(null);
const experimentalLyrics = useExperimentalLyrics({
  playbackState: () => playerState,
  samplePlaybackClock,
  document: lyricsDocument,
  trackId: () => state.selectedTrackId,
  filename: () =>
    selectedSource.value?.kind === 'authored'
      ? ''
      : state.selectedSourceFilename,
  offsetMs: () => Math.round(state.offsetSeconds * 1000),
  positionMs: currentLyricsPositionMs,
  variant: lyricsTextVariant,
});
const sourcePresentation = useLyricsSourcePresentation({
  trackId: () => state.selectedTrackId,
  sources: () => selectedLyrics.value.sources,
  selectedFilename: () => state.selectedSourceFilename,
  document: () =>
    state.isLoadingLyrics || !state.lyricSource ? null : lyricsDocument.value,
  experiment: experimentalLyrics,
});
const lyricsClock = useLyricsClock({
  playerState,
  samplePlaybackClock,
  selectedTrackId: () => state.selectedTrackId,
  offsetMs: () => state.playbackOffsetSeconds * 1000,
  document: () =>
    experimentalLyrics.outputDocument.value ?? displayLyricsDocument.value,
  positionMs: currentLyricsPositionMs,
});

function setLyricsTextVariant(variant) {
  if (!Object.values(LYRICS_TEXT_VARIANTS).includes(variant)) return false;
  lyricsTextVariant.value = variant;
  return true;
}
const projection = useLyricsPlaybackProjection({
  state,
  playerState,
  samplePlaybackClock,
  displayLyricsDocument,
  currentLyricsPositionMs,
  estimatedFrame: experimentalLyrics.frame,
});
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
    previousTrackId === nextTrackId ? state.selectedSourceFilename : null;
  const preferredSource = pickPreferredLyricsSource(
    selectedTrack.value,
    currentFilename,
    sourcePresentation.availableSources.value,
  );
  state.selectedSourceFilename =
    currentFilename === '' ? '' : (preferredSource?.filename ?? null);
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

function selectSource(filename, options = {}) {
  if (state.selectedSourceFilename === filename) return;
  const trackId = state.selectedTrackId;
  state.selectedSourceFilename = filename;
  state.offsetSeconds = 0;
  loadSelectedLyrics();
  if (
    options.persistPreference !== false &&
    trackId &&
    filename &&
    typeof window.Utawakui?.setLyricsSourcePreference === 'function'
  ) {
    Promise.resolve(
      window.Utawakui.setLyricsSourcePreference(trackId, filename),
    ).catch((error) => {
      reportLyricsError(
        error,
        'set-source-preference',
        t('lyricsSource.preferenceFailed'),
        { persist: false },
      );
    });
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
    payload.stage === 'error' ? t('lyricsSource.backfillPartial') : null;

  if (payload.stage === 'idle') {
    state.backfillStatus.total = 0;
    state.backfillStatus.completed = 0;
    state.backfillStatus.currentTrackId = null;
    state.backfillStatus.currentTitle = null;
  }
}

const {
  playFromLine,
  timingPlaybackTarget,
  seekTimingPosition,
  playTimingPosition,
} = useLyricsPlaybackNavigation({
  state,
  selectedTrack,
  lyricsTiming,
  player,
  setQueue,
  arrangementBusy,
});

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
    lyricsClock.stop();
    sourcePresentation.stop();
    reference.stop();
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
    availableSources: sourcePresentation.availableSources,
    refreshSourceDetails: sourcePresentation.refresh,
    selectedSource,
    linkedReference,
    applyLinkedReference,
    hasLinkedReference,
    toggleLinkedReference,
    lyricsTiming: readonly(lyricsTiming),
    sourceSession: sourceDocuments.sourceSession,
    timingReview: sourceDocuments.timingReview,
    lyricsAcousticEstimate: readonly(lyricsAcousticEstimate),
    lyricsDocument,
    displayLyricsDocument,
    lyricsTextProcessing,
    experimentalLyrics,
    lyricsTextVariant: readonly(lyricsTextVariant),
    ...projection,
    currentTrackId,
    currentLyricsPositionMs: readonly(currentLyricsPositionMs),
    isReloading,
    initialize,
    refresh,
    setTrackScope,
    selectTrack,
    selectSource,
    setLyricsTextVariant,
    adjustOffset: sourceDocuments.adjustOffset,
    resetOffset,
    retryOffsetSave,
    saveTimingDocument,
    playFromLine,
    timingPlaybackTarget,
    seekTimingPosition,
    playTimingPosition,
    probeMusixmatch,
    ensureLyricsFlow,
    clearCandidateSearch,
    searchLyricsProviderCandidates,
    searchLyricsCandidates,
    saveLyricsProviderCandidate,
    saveLyricsCandidate,
    backfillSourceLabels,
    setSourceLabel,
    forkAuthoredLyrics,
    editAuthoredLyrics,
    deleteSource,
    importManualLyricsText,
    importManualLyricsFile,
  };
}
