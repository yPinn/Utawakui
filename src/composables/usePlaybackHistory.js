import { computed, reactive, readonly } from 'vue';
import { useLibrary } from './useLibrary.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlayer } from './usePlayer.js';
import { createPlaybackQualificationTracker } from '../utils/playbackHistoryQualification.js';

const state = reactive({
  entries: [],
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
    await initializeLibrary();
    if (typeof window !== 'undefined' && window.Utawakui) {
      try {
        state.entries = await window.Utawakui.getRecentPlaybackHistory();
        state.error = null;
      } catch {
        state.error = '最近播放紀錄暫時無法讀取。';
      }
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
    initialize,
    clear,
    dispose,
  };
}
