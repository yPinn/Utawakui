import { computed, reactive, readonly, watch } from 'vue';
import { usePlayer } from './usePlayer.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { parseVtt, pickPreferredLyricsSource } from '../utils/lyrics.js';
import { toPlayableTrack } from '../utils/playableTrack.js';

const EMPTY_LYRICS = { status: 'unchecked', sources: [] };

const { state: playerState, playTrack, play, seek } = usePlayer();
const { setQueue } = usePlaybackQueue();

const state = reactive({
  tracks: [],
  selectedTrackId: null,
  selectedSourceFilename: null,
  lyricsText: '',
  lyricSource: null,
  isLoading: false,
  isLoadingLyrics: false,
  backfillStatus: {
    isRunning: false,
    total: 0,
    completed: 0,
    currentTrackId: null,
    currentTitle: null,
    error: null,
  },
  error: null,
  offsetSeconds: 0,
});

let unsubscribeLibraryUpdated = null;
let unsubscribeLibraryBackfillStatus = null;
let lyricsRequestId = 0;

const selectedTrack = computed(
  () =>
    state.tracks.find((track) => track.id === state.selectedTrackId) ?? null,
);
const selectedLyrics = computed(
  () => selectedTrack.value?.lyrics ?? EMPTY_LYRICS,
);
const lyricLines = computed(() =>
  parseVtt(state.lyricsText, { source: selectedSource.value }),
);
const isSelectedTrackPlaying = computed(
  () =>
    Boolean(state.selectedTrackId) &&
    playerState.track?.id === state.selectedTrackId,
);
const activeLineIndex = computed(() => {
  if (!isSelectedTrackPlaying.value) return -1;
  const currentTime = playerState.currentTime + state.offsetSeconds;
  return lyricLines.value.findIndex(
    (line) => currentTime >= line.start && currentTime < line.end,
  );
});
const activeLine = computed(() =>
  activeLineIndex.value >= 0 ? lyricLines.value[activeLineIndex.value] : null,
);
const isReloading = computed(
  () => state.isLoading || state.backfillStatus.isRunning,
);
const selectedSource = computed(() => {
  if (!state.selectedSourceFilename) return null;
  return (
    selectedLyrics.value.sources.find(
      (source) => source.filename === state.selectedSourceFilename,
    ) ?? null
  );
});

function hasLyrics(track) {
  return track?.lyrics?.status === 'available';
}

function compareByLyricsAvailability(first, second) {
  const firstHasLyrics = hasLyrics(first.track);
  const secondHasLyrics = hasLyrics(second.track);
  if (firstHasLyrics !== secondHasLyrics) return firstHasLyrics ? -1 : 1;
  return first.index - second.index;
}

function orderTracksByLyricsAvailability(tracks) {
  return tracks
    .map((track, index) => ({ track, index }))
    .sort(compareByLyricsAvailability)
    .map(({ track }) => track);
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
  return tracks.find(hasLyrics)?.id ?? tracks[0]?.id ?? null;
}

async function loadSelectedLyrics() {
  const track = selectedTrack.value;
  const filename = state.selectedSourceFilename;
  lyricsRequestId += 1;
  const requestId = lyricsRequestId;

  state.lyricsText = '';
  state.lyricSource = null;
  if (!track || !filename) return;

  if (typeof window.Utawakui?.getTrackLyrics !== 'function') {
    state.error = '歌詞讀取需要重新啟動應用程式才能載入新版橋接 API。';
    return;
  }

  state.isLoadingLyrics = true;
  try {
    const result = await window.Utawakui.getTrackLyrics(track.id, filename);
    if (requestId !== lyricsRequestId) return;
    state.lyricsText = result?.text ?? '';
    state.lyricSource = result?.source ?? null;
    state.error = null;
  } catch (err) {
    if (requestId !== lyricsRequestId) return;
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    if (requestId === lyricsRequestId) state.isLoadingLyrics = false;
  }
}

function applyTracks(tracks) {
  const previousTrackId = state.selectedTrackId;
  state.tracks = orderTracksByLyricsAvailability(tracks);
  state.selectedTrackId = pickSelectedTrackId(tracks);
  const currentFilename =
    previousTrackId === state.selectedTrackId
      ? state.selectedSourceFilename
      : null;
  state.selectedSourceFilename =
    pickPreferredLyricsSource(selectedTrack.value, currentFilename)?.filename ??
    null;
  loadSelectedLyrics();
}

async function refresh() {
  if (typeof window === 'undefined' || !window.Utawakui) return;
  state.isLoading = true;
  try {
    applyTracks(await window.Utawakui.listTracks());
    state.error = null;
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    state.isLoading = false;
  }
}

function selectTrack(trackId) {
  if (state.selectedTrackId === trackId) return;
  const track = state.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return;
  state.selectedTrackId = track.id;
  state.selectedSourceFilename =
    pickPreferredLyricsSource(track)?.filename ?? null;
  state.offsetSeconds = 0;
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
    payload.stage === 'error' ? payload.error || 'Reload failed' : null;

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
    setQueue([selectedTrack.value], selectedTrack.value.id);
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

if (typeof window !== 'undefined' && window.Utawakui) {
  refresh();
  unsubscribeLibraryUpdated = window.Utawakui.onLibraryUpdated(refresh);
  if (typeof window.Utawakui.onLibraryBackfillStatus === 'function') {
    unsubscribeLibraryBackfillStatus =
      window.Utawakui.onLibraryBackfillStatus(applyBackfillStatus);
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopPlayerSync();
    unsubscribeLibraryUpdated?.();
    unsubscribeLibraryBackfillStatus?.();
  });
}

export function useLyrics() {
  return {
    state: readonly(state),
    selectedTrack,
    selectedLyrics,
    selectedSource,
    lyricLines,
    activeLine,
    activeLineIndex,
    isSelectedTrackPlaying,
    isReloading,
    refresh,
    selectTrack,
    selectSource,
    adjustOffset,
    resetOffset,
    playFromLine,
  };
}

export const __testing = {
  orderTracksByLyricsAvailability,
};
