import { computed, reactive, readonly, watch } from 'vue';
import { usePlayer } from './usePlayer.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlaylists } from './usePlaylists.js';
import { useLibrary } from './useLibrary.js';
import { parseLyricsText, pickPreferredLyricsSource } from '../utils/lyrics.js';
import { toPlayableTrack } from '../utils/playableTrack.js';

const EMPTY_LYRICS = { status: 'unchecked', sources: [] };

const { state: playerState, playTrack, play, seek } = usePlayer();
const { setQueue } = usePlaybackQueue();
const { selectedPlaylist } = usePlaylists();
// The full library pool (title/artist/lyrics/hasSeparation lookups) is
// shared with SetlistView.vue via this singleton — see useLibrary.js for
// why the fetch + onLibraryUpdated subscription moved out of here. What the
// UI sees (state.tracks) is always this pool joined against the selected
// playlist's own trackIds, so switching playlists doesn't need a re-fetch.
// tracksById is re-exported as-is so LyricsWorkspace.vue can order its
// playlist <select> the same way PlaylistSidebar.vue orders its nav rows
// (see src/utils/playlistOrdering.js) — deriving an album's artist needs
// its member tracks, which aren't in state.tracks for any playlist other
// than the one currently selected.
const {
  state: libraryState,
  tracksById,
  refresh: refreshLibrary,
} = useLibrary();

const state = reactive({
  tracks: [],
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
  error: null,
  offsetSeconds: 0,
});

let unsubscribeLibraryBackfillStatus = null;
let lyricsRequestId = 0;
let musixmatchProbeRequestId = 0;

const selectedTrack = computed(
  () =>
    state.tracks.find((track) => track.id === state.selectedTrackId) ?? null,
);
const selectedLyrics = computed(
  () => selectedTrack.value?.lyrics ?? EMPTY_LYRICS,
);
const lyricLines = computed(() =>
  parseLyricsText(state.lyricsText, { source: selectedSource.value }),
);
const isSelectedTrackPlaying = computed(
  () =>
    Boolean(state.selectedTrackId) &&
    playerState.track?.id === state.selectedTrackId,
);
// For the track list's own per-row "current" cue — independent of
// selectedTrackId (which track's lyrics are open), not a duplicate of it.
const currentTrackId = computed(() => playerState.track?.id ?? null);
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

// Same "ghost trackId" join SetlistView.vue's playlistTracks computed
// does — a track deleted outside the app just silently drops out. Order
// follows the playlist's own trackIds, since that's the actual performance
// order this page is meant to be scanned in, not a lyrics-readiness sort.
function joinPlaylistTracks(pool, playlist) {
  if (!playlist) return [];
  const byId = new Map(pool.map((track) => [track.id, track]));
  return playlist.trackIds.map((id) => byId.get(id)).filter(Boolean);
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

function clearMusixmatchProbe() {
  musixmatchProbeRequestId += 1;
  state.musixmatchProbe.isLoading = false;
  state.musixmatchProbe.trackId = null;
  state.musixmatchProbe.result = null;
  state.musixmatchProbe.error = null;
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

function applyScopedTracks() {
  const previousTrackId = state.selectedTrackId;
  const scoped = joinPlaylistTracks(
    libraryState.tracks,
    selectedPlaylist.value,
  );
  state.tracks = scoped;
  const nextTrackId = pickSelectedTrackId(scoped);
  state.selectedTrackId = nextTrackId;
  if (state.musixmatchProbe.trackId !== nextTrackId) {
    clearMusixmatchProbe();
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

// The "重新掃描" (reload) button's handler — delegates the actual fetch to
// the shared singleton (which also updates SetlistView.vue's copy).
// applyScopedTracks() reruns on its own via the libraryState.tracks watch
// below once the fetch resolves, and state.error mirrors libraryState.error
// via its own watch below too, so this only needs to trigger the fetch.
async function refresh() {
  await refreshLibrary();
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
    // state.tracks is already scoped to the selected playlist (see the
    // module comment above) — queue the whole thing, not just this track,
    // so PlayerBar's next/previous controls and "source" label work the
    // same way they do when playback starts from SetlistView.
    setQueue(state.tracks, selectedTrack.value.id, {
      sourceName: selectedPlaylist.value?.name || '',
      sourceId: selectedPlaylist.value?.id ?? null,
    });
    await playTrack(toPlayableTrack(selectedTrack.value));
  }
  seek(targetTime);
  await play();
}

async function probeMusixmatch() {
  const track = selectedTrack.value;
  if (!track) return null;

  musixmatchProbeRequestId += 1;
  const requestId = musixmatchProbeRequestId;

  state.musixmatchProbe.isLoading = true;
  state.musixmatchProbe.trackId = track.id;
  state.musixmatchProbe.result = null;
  state.musixmatchProbe.error = null;

  if (typeof window.Utawakui?.probeMusixmatchLyrics !== 'function') {
    state.musixmatchProbe.isLoading = false;
    state.musixmatchProbe.error =
      'Musixmatch 探測 API 尚未載入，請重啟 Electron app';
    return null;
  }

  try {
    const result = await window.Utawakui.probeMusixmatchLyrics(track.id);
    if (requestId !== musixmatchProbeRequestId) return null;
    state.musixmatchProbe.result = result;
    return result;
  } catch (err) {
    if (requestId !== musixmatchProbeRequestId) return null;
    state.musixmatchProbe.error =
      err instanceof Error ? err.message : String(err);
    return null;
  } finally {
    if (requestId === musixmatchProbeRequestId) {
      state.musixmatchProbe.isLoading = false;
    }
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

// Re-derive from the already-fetched pool on playlist switch — no need to
// re-fetch over IPC just because the user picked a different playlist.
const stopPlaylistSync = watch(selectedPlaylist, () => applyScopedTracks());

// Reruns whenever the shared library pool changes, whether from this
// module's own refresh(), SetlistView.vue's, or the singleton's own
// onLibraryUpdated subscription — immediate so it applies whatever's
// already in libraryState.tracks (possibly already loaded by another
// consumer) instead of waiting for the next change.
const stopLibrarySync = watch(
  () => libraryState.tracks,
  () => applyScopedTracks(),
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
    state.error = error;
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
    stopPlaylistSync();
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
    lyricLines,
    activeLine,
    activeLineIndex,
    isSelectedTrackPlaying,
    currentTrackId,
    isReloading,
    refresh,
    selectTrack,
    selectSource,
    adjustOffset,
    resetOffset,
    playFromLine,
    probeMusixmatch,
  };
}
