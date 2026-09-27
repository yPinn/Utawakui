import { reactive, readonly, watch } from 'vue';
import { toPlayableTrack } from '../utils/playableTrack.js';
import { buildPlaybackResumeIntent } from '../utils/playbackResumeIntent.js';
import { useLibrary } from './useLibrary.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlayer } from './usePlayer.js';

const SAVE_INTERVAL_MS = 2_000;

const state = reactive({
  isInitialized: false,
  error: null,
});

const { state: libraryState, initialize: initializeLibrary } = useLibrary();
const { state: queueState, restoreResumeState } = usePlaybackQueue();
const { state: playerState, restorePlaybackState } = usePlayer();

let initializationPromise = null;
let stopPersistenceWatch = null;
let saveTimer = null;
let isHydrating = true;

function currentIntent() {
  return buildPlaybackResumeIntent({ playerState, queueState });
}

async function persistNow() {
  if (!state.isInitialized || isHydrating) return;
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (typeof window === 'undefined' || !window.Utawakui) return;
  try {
    await window.Utawakui.savePlaybackResumeSnapshot(currentIntent());
    state.error = null;
  } catch {
    state.error = '播放進度暫時無法保存。';
  }
}

function schedulePersist() {
  if (!state.isInitialized || isHydrating || saveTimer !== null) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, SAVE_INTERVAL_MS);
}

function startPersistenceWatch() {
  stopPersistenceWatch ??= watch(currentIntent, schedulePersist, {
    deep: true,
  });
}

function initialize() {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    await initializeLibrary();
    if (typeof window !== 'undefined' && window.Utawakui) {
      try {
        const snapshot = await window.Utawakui.getPlaybackResumeSnapshot();
        if (snapshot?.currentTrackId) {
          const restoredTrack = restoreResumeState(
            snapshot.queue,
            snapshot.currentTrackId,
            libraryState.tracks,
          );
          if (restoredTrack) {
            restorePlaybackState({
              track: toPlayableTrack(restoredTrack),
              positionSeconds: snapshot.positionSeconds,
              volume: snapshot.volume,
              isMuted: snapshot.isMuted,
              playbackMode: snapshot.playbackMode,
            });
          } else {
            await window.Utawakui.savePlaybackResumeSnapshot(null);
          }
        }
        state.error = null;
      } catch {
        state.error = '上次播放狀態暫時無法恢復。';
      }
    }
    isHydrating = false;
    state.isInitialized = true;
    startPersistenceWatch();
  })();
  return initializationPromise;
}

function dispose() {
  stopPersistenceWatch?.();
  stopPersistenceWatch = null;
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

if (import.meta.hot) import.meta.hot.dispose(dispose);

export function usePlaybackResume() {
  return {
    state: readonly(state),
    initialize,
    persistNow,
    dispose,
  };
}
