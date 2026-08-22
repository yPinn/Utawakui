import { computed, reactive, readonly, watch } from 'vue';
import { alignReadings } from '../utils/lyrics.js';
import { createLatestAsyncPublisher } from '../utils/latestAsyncPublisher.js';
import { projectPerformerSnapshot } from '../utils/performerSnapshot.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useLyrics } from './useLyrics.js';
import { useLyricsReading } from './useLyricsReading.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlayer } from './usePlayer.js';

const PROJECTION_TIMESTAMP = '1970-01-01T00:00:00.000Z';

const { state: playerState } = usePlayer();
const { state: queueState, upcomingTracks } = usePlaybackQueue();
const {
  state: lyricsState,
  selectedTrack: lyricsTrack,
  selectedSource: lyricsSource,
  lyricLines,
  activeLineIndex,
} = useLyrics();
const { getDoc: getReadingDoc, loadReading } = useLyricsReading();
const { recordError } = useAppDiagnostics();

const state = reactive({
  open: false,
  fullScreen: false,
  alwaysOnTop: false,
  isOpening: false,
  error: '',
});

let initialized = false;
let revision = 0;
let unsubscribeStatus = null;
let stopProjectionWatch = null;
let stopReadingWatch = null;

function bridgeMethod(name) {
  const method =
    typeof window !== 'undefined' ? window.Utawakui?.[name] : undefined;
  if (typeof method !== 'function') {
    throw new Error('表演者畫面需要重新啟動應用程式才能載入新版橋接 API。');
  }
  return method;
}

function reportPerformerError(error, operation, message) {
  return recordError(error, {
    code: `PERFORMER_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
    title: '表演者畫面未完成',
    message,
    source: 'performer',
    operation,
    context: { retryable: true },
  }).message;
}

function applyStatus(status = {}) {
  state.open = status.open === true;
  state.fullScreen = status.fullScreen === true;
  state.alwaysOnTop = status.alwaysOnTop === true;
}

const alignedReadings = computed(() => {
  const track = lyricsTrack.value;
  const source = lyricsSource.value;
  if (!track || !source) return lyricLines.value.map(() => null);
  return alignReadings(
    lyricLines.value,
    getReadingDoc(track.id, source.filename),
  );
});

function projectionInput() {
  return {
    player: playerState,
    queue: {
      historyEntries: queueState.historyEntries,
      currentTrack: queueState.currentTrack,
      upcomingTracks: upcomingTracks.value,
      sourceName: queueState.sourceName,
    },
    lyrics: {
      trackId: lyricsTrack.value?.id ?? null,
      source: lyricsSource.value,
      lines: lyricLines.value,
      activeLineIndex: activeLineIndex.value,
      offsetSeconds: lyricsState.offsetSeconds,
    },
    readings: { lines: alignedReadings.value },
  };
}

const projectedState = computed(() =>
  projectPerformerSnapshot(projectionInput(), {
    revision: 0,
    generatedAt: PROJECTION_TIMESTAMP,
  }),
);

function currentSnapshot() {
  revision += 1;
  return {
    ...projectedState.value,
    state: {
      ...projectedState.value.state,
      revision,
      generatedAt: new Date().toISOString(),
    },
  };
}

const publisher = createLatestAsyncPublisher(
  (snapshot) => bridgeMethod('publishPerformerSnapshot')(snapshot),
  {
    onError: (error) => {
      state.error = reportPerformerError(
        error,
        'publish',
        '表演者畫面未更新，請再試一次。',
      );
    },
  },
);

async function refreshStatus() {
  try {
    applyStatus(await bridgeMethod('getPerformerViewStatus')());
    return state.open;
  } catch (error) {
    state.error = reportPerformerError(
      error,
      'status',
      '目前無法讀取表演者畫面狀態。',
    );
    return false;
  }
}

async function open() {
  state.isOpening = true;
  try {
    applyStatus(await bridgeMethod('openPerformerView')(currentSnapshot()));
    state.error = '';
    return true;
  } catch (error) {
    state.error = reportPerformerError(
      error,
      'open',
      '目前無法開啟表演者畫面，請再試一次。',
    );
    return false;
  } finally {
    state.isOpening = false;
  }
}

async function initialize() {
  if (initialized) return;
  initialized = true;

  await refreshStatus();
  if (typeof window.Utawakui?.onPerformerViewStatus === 'function') {
    unsubscribeStatus = window.Utawakui.onPerformerViewStatus(applyStatus);
  }
  stopProjectionWatch = watch(projectedState, () => {
    if (state.open) publisher.request(currentSnapshot());
  });
  stopReadingWatch = watch(
    () => [lyricsTrack.value?.id, lyricsSource.value?.filename],
    ([trackId, filename]) => {
      if (trackId && filename) loadReading(trackId, filename);
    },
    { immediate: true },
  );
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeStatus?.();
    stopProjectionWatch?.();
    stopReadingWatch?.();
  });
}

export function usePerformerSelfView() {
  return {
    state: readonly(state),
    initialize,
    open,
    refreshStatus,
  };
}
