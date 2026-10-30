import { computed, reactive, readonly } from 'vue';
import { NOTIFICATION_KEYS } from '../constants/notificationKeys.js';
import { useLibrary } from './useLibrary.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlayer } from './usePlayer.js';
import { createPlaybackQualificationTracker } from '../utils/playbackHistoryQualification.js';
import { useAppNotifications } from './useAppNotifications.js';
import { t } from '../utils/i18n.js';

const state = reactive({
  entries: [],
  // Main-owned trackId → qualified play count; null until loaded.
  playCounts: null,
  // Main-owned sourceId → last qualified playback from that source.
  sourceRecency: {},
  isInitialized: false,
  readError: null,
  updateError: null,
  isReading: false,
  isClearing: false,
  get error() {
    return this.readError || this.updateError;
  },
});

const { tracksById, initialize: initializeLibrary } = useLibrary();
const { state: queueState, onSourceStarted } = usePlaybackQueue();
const { onEnded, onPlaybackProgress } = usePlayer();
let initializationPromise = null;
let unsubscribeProgress = null;
let unsubscribeEnded = null;
let unsubscribeSourceStarted = null;
let historyRevision = 0;

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
  const current = ++historyRevision;
  state.isReading = false;
  try {
    const entries = await window.Utawakui.recordRecentPlayback(
      trackId,
      currentSourceContext(),
    );
    if (current === historyRevision) state.entries = entries;
    // Main counted this same event; mirror it instead of refetching the map.
    if (state.playCounts) {
      state.playCounts = {
        ...state.playCounts,
        [trackId]: (state.playCounts[trackId] ?? 0) + 1,
      };
    }
    if (current === historyRevision) state.updateError = null;
  } catch {
    if (current === historyRevision)
      state.updateError = t('librarySettings.history.updateFailed');
  }
}

// Sidebar order follows the start of playback, not the 10 s qualification.
async function recordSourceUse(sourceId) {
  if (typeof window === 'undefined' || !window.Utawakui) return;
  try {
    await window.Utawakui.recordPlaybackSourceUse(sourceId);
    // Ordering only needs relative recency; mirror instead of refetching.
    state.sourceRecency = {
      ...state.sourceRecency,
      [sourceId]: new Date().toISOString(),
    };
  } catch {
    // An unsaved use only leaves the sidebar order unchanged.
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
  unsubscribeSourceStarted ??= onSourceStarted(recordSourceUse);
}

function initialize() {
  if (initializationPromise) return initializationPromise;
  const current = ++historyRevision;
  state.isReading = true;
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
    const sourceRecencyRequest = bridge?.getPlaybackSourceRecency
      ? Promise.resolve().then(() => bridge.getPlaybackSourceRecency())
      : null;
    sourceRecencyRequest?.catch(() => {});
    await initializeLibrary();
    if (bridge) {
      try {
        const entries = await historyRequest;
        if (current === historyRevision) {
          state.entries = entries;
          state.readError = null;
        }
      } catch {
        if (current === historyRevision)
          state.readError = t('librarySettings.history.readFailed');
      }
    }
    try {
      // Unknown counts stay null so the column hides instead of showing zeros.
      if (playCountsRequest) state.playCounts = await playCountsRequest;
    } catch {
      state.playCounts = null;
    }
    try {
      // Unreadable recency keeps the default sidebar order.
      if (sourceRecencyRequest) {
        const recency = await sourceRecencyRequest;
        if (recency && typeof recency === 'object') {
          state.sourceRecency = { ...recency, ...state.sourceRecency };
        }
      }
    } catch {
      // Keep the default order.
    }
    state.isInitialized = true;
    if (current === historyRevision) state.isReading = false;
  })();
  return initializationPromise;
}

async function refresh() {
  if (state.isReading || state.isClearing) return false;
  const current = ++historyRevision;
  state.isReading = true;
  try {
    const entries = await window.Utawakui.getRecentPlaybackHistory();
    if (current !== historyRevision) return false;
    if (!Array.isArray(entries))
      throw new TypeError('invalid playback history');
    state.entries = entries;
    state.readError = null;
    return true;
  } catch {
    if (current === historyRevision)
      state.readError = t('librarySettings.history.readFailed');
    return false;
  } finally {
    if (current === historyRevision) state.isReading = false;
  }
}

async function clear() {
  if (state.isClearing) return false;
  const current = ++historyRevision;
  state.isReading = false;
  state.isClearing = true;
  const notifications = useAppNotifications();
  try {
    const entries = await window.Utawakui.clearRecentPlaybackHistory();
    if (!Array.isArray(entries))
      throw new TypeError('invalid playback history');
    if (current === historyRevision) {
      state.entries = entries;
      state.readError = null;
      state.updateError = null;
    }
    state.sourceRecency = {};
    notifications.notify({
      key: NOTIFICATION_KEYS.PLAYBACK_HISTORY_CLEAR,
      title: t('librarySettings.history.cleared'),
      message: t('librarySettings.history.clearedMessage'),
    });
    return true;
  } catch {
    notifications.notify({
      key: NOTIFICATION_KEYS.PLAYBACK_HISTORY_CLEAR,
      tone: 'danger',
      title: t('librarySettings.history.notCleared'),
      message: t('librarySettings.history.retry'),
    });
    return false;
  } finally {
    state.isClearing = false;
  }
}

function playCountOf(trackId) {
  return state.playCounts ? (state.playCounts[trackId] ?? 0) : null;
}

function dispose() {
  unsubscribeProgress?.();
  unsubscribeEnded?.();
  unsubscribeSourceStarted?.();
  unsubscribeProgress = null;
  unsubscribeEnded = null;
  unsubscribeSourceStarted = null;
  qualificationTracker.reset();
}

if (import.meta.hot) import.meta.hot.dispose(dispose);

export function usePlaybackHistory() {
  return {
    state: readonly(state),
    recentItems,
    playCountOf,
    initialize,
    refresh,
    clear,
    dispose,
  };
}
