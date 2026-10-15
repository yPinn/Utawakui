import { computed, reactive, readonly } from 'vue';
import { useLibrary } from './useLibrary.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlayer } from './usePlayer.js';
import { createPlaybackQualificationTracker } from '../utils/playbackHistoryQualification.js';

const state = reactive({
  entries: [],
  // Main-owned trackId → qualified play count; null until loaded.
  playCounts: null,
  isInitialized: false,
  error: null,
});

const { tracksById, initialize: initializeLibrary } = useLibrary();
const { state: queueState } = usePlaybackQueue();
const { onEnded, onPlaybackProgress } = usePlayer();
let initializationPromise = null;
let unsubscribeProgress = null;
let unsubscribeEnded = null;

const recentItems = computed(() =>
  state.entries
    .map((entry, index) => {
      const track = tracksById.value.get(entry.trackId);
      return track
        ? {
            key: `${entry.playedAt}:${index}:${entry.trackId}`,
            ...entry,
            track,
          }
        : null;
    })
    .filter(Boolean),
);

function currentSourceContext() {
  return queueState.currentIsSource
    ? {
        sourceId: queueState.sourceId,
        sourceName: queueState.sourceName,
      }
    : { sourceId: null, sourceName: null };
}

async function recordQualifiedTrack(trackId) {
  if (typeof window === 'undefined' || !window.Utawakui) return;
  try {
    state.entries = await window.Utawakui.recordRecentPlayback(
      trackId,
      currentSourceContext(),
    );
    // Main counted this same event; mirror it instead of refetching the map.
    if (state.playCounts) {
      state.playCounts = {
        ...state.playCounts,
        [trackId]: (state.playCounts[trackId] ?? 0) + 1,
      };
    }
    state.error = null;
  } catch {
    state.error = '最近播放紀錄暫時無法更新。';
  }
}

const qualificationTracker = createPlaybackQualificationTracker({
  onQualified: recordQualifiedTrack,
});

function subscribeToPlayback() {
  unsubscribeProgress ??= onPlaybackProgress((event) =>
    qualificationTracker.observeProgress(event),
  );
  unsubscribeEnded ??= onEnded((event) => {
    if (event) qualificationTracker.observeEnded(event);
  });
}

function initialize() {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    subscribeToPlayback();
    const bridge =
      typeof window !== 'undefined' && window.Utawakui ? window.Utawakui : null;
    // History entries do not depend on the library scan; overlap them.
    const historyRequest = bridge
      ? Promise.resolve().then(() => bridge.getRecentPlaybackHistory())
      : null;
    historyRequest?.catch(() => {});
    const playCountsRequest = bridge?.getPlaybackPlayCounts
      ? Promise.resolve().then(() => bridge.getPlaybackPlayCounts())
      : null;
    playCountsRequest?.catch(() => {});
    await initializeLibrary();
    if (bridge) {
      try {
        state.entries = await historyRequest;
        state.error = null;
      } catch {
        state.error = '最近播放紀錄暫時無法讀取。';
      }
    }
    try {
      // Unknown counts stay null so the column hides instead of showing zeros.
      if (playCountsRequest) state.playCounts = await playCountsRequest;
    } catch {
      state.playCounts = null;
    }
    state.isInitialized = true;
  })();
  return initializationPromise;
}

async function clear() {
  if (typeof window === 'undefined' || !window.Utawakui) {
    state.entries = [];
    return;
  }
  try {
    state.entries = await window.Utawakui.clearRecentPlaybackHistory();
    state.error = null;
  } catch {
    state.error = '最近播放紀錄暫時無法清除。';
  }
}

function playCountOf(trackId) {
  return state.playCounts ? (state.playCounts[trackId] ?? 0) : null;
}

function dispose() {
  unsubscribeProgress?.();
  unsubscribeEnded?.();
  unsubscribeProgress = null;
  unsubscribeEnded = null;
  qualificationTracker.reset();
}

if (import.meta.hot) import.meta.hot.dispose(dispose);

export function usePlaybackHistory() {
  return {
    state: readonly(state),
    recentItems,
    playCountOf,
    initialize,
    clear,
    dispose,
  };
}
