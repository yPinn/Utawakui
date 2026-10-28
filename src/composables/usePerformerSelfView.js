import {
  computed,
  effectScope,
  reactive,
  readonly,
  shallowRef,
  watch,
} from 'vue';
import { NOTIFICATION_KEYS } from '../constants/notificationKeys.js';
import { alignReadings, detectLyricsScript } from '../utils/lyrics.js';
import { createLatestAsyncPublisher } from '../utils/latestAsyncPublisher.js';
import {
  applyPerformerLyricsOffsetIntent,
  applyPerformerControlIntent,
} from '../utils/performerOffsetIntent.js';
import { useLyricsDisplay } from './useLyricsDisplay.js';
import { projectPerformerSnapshot } from '../utils/performerSnapshot.js';
import { useAppNotifications } from './useAppNotifications.js';
import { useLyrics } from './useLyrics.js';
import { useLyricsReading } from './useLyricsReading.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlayer } from './usePlayer.js';

const PROJECTION_TIMESTAMP = '1970-01-01T00:00:00.000Z';

const { state: playerState, play, pause, samplePlaybackClock } = usePlayer();
const { state: queueState, upcomingTracks } = usePlaybackQueue();
const {
  state: lyricsState,
  selectedTrack: lyricsTrack,
  selectedSource: lyricsSource,
  lyricLines,
  activeLineIndex,
  localLyricsFrame,
  adjustOffset,
  resetOffset,
  retryOffsetSave,
} = useLyrics();
const {
  variant: readingVariant,
  getDoc: getReadingDoc,
  loadReading,
} = useLyricsReading();
const notifications = useAppNotifications();
let errorOperation = null;

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
let unsubscribeLyricsOffsetIntent = null;
let unsubscribeControlIntent = null;
let readingDisplayScope = null;
const readingDisplay = shallowRef(null);
let stopProjectionWatch = null;
let stopReadingWatch = null;
const publishedContexts = new Map();
const MAX_PUBLISHED_CONTEXTS = 12;

function bridgeMethod(name) {
  const method =
    typeof window !== 'undefined' ? window.Utawakui?.[name] : undefined;
  if (typeof method !== 'function') {
    throw new Error('表演者畫面需要重新啟動應用程式才能載入新版橋接 API。');
  }
  return method;
}

function reportPerformerError(error, operation, message) {
  errorOperation = operation;
  return notifications.notifyFailure({
    key: NOTIFICATION_KEYS.PERFORMER_VIEW,
    title: '表演者畫面操作未完成',
    message,
    error,
    code: `PERFORMER_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
    source: 'performer',
    operation,
    context: { retryable: true },
    actionLabel: '重試',
    action: toggle,
  });
}

function clearPerformerError(operation) {
  if (operation && errorOperation !== operation) return;
  state.error = '';
  errorOperation = null;
  notifications.clear(NOTIFICATION_KEYS.PERFORMER_VIEW);
}

function applyStatus(status = {}) {
  state.open = status.open === true;
  state.fullScreen = status.fullScreen === true;
  state.alwaysOnTop = status.alwaysOnTop === true;
  if (!state.open) {
    readingDisplayScope?.stop();
    readingDisplayScope = null;
    readingDisplay.value = null;
  }
}

const availableReadingVariants = computed(() => {
  const script = detectLyricsScript(
    lyricLines.value.map((line) => line.text).join(''),
  );
  return script === 'ja'
    ? ['off', 'furigana', 'romaji']
    : script === 'ko'
      ? ['off', 'romaji']
      : [];
});

function selectReadingVariant(variant) {
  if (!readingDisplayScope) {
    readingDisplayScope = effectScope(true);
    readingDisplay.value = readingDisplayScope.run(() =>
      useLyricsDisplay({ lyrics: useLyrics(), reading: useLyricsReading() }),
    );
  }
  return readingDisplay.value.selectReadingVariant(variant);
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
      wordFrame: localLyricsFrame?.value,
      offsetSeconds: lyricsState.offsetSeconds,
      offsetSave: lyricsState.offsetSave,
    },
    readings: {
      variant: readingVariant?.value,
      lines: alignedReadings.value,
      availableVariants: availableReadingVariants.value,
      preparing:
        readingDisplay.value?.isPreparingReading.value === true ||
        readingDisplay.value?.isGeneratingReading.value === true,
      error: readingDisplay.value?.readingError.value ?? '',
    },
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
  const input = projectionInput(),
    sample = samplePlaybackClock?.();
  const matched = sample?.trackId && sample.trackId === input.player.track?.id;
  if (matched)
    input.player = {
      ...input.player,
      currentTime: sample.positionMs / 1000,
      tempoRate: sample.rate,
      playbackPhase: sample.phase,
    };
  const snapshot = projectPerformerSnapshot(input, {
    revision,
    generatedAt: matched ? sample.sampledAt : new Date().toISOString(),
  });
  publishedContexts.set(revision, currentLyricsContext());
  while (publishedContexts.size > MAX_PUBLISHED_CONTEXTS) {
    publishedContexts.delete(publishedContexts.keys().next().value);
  }
  return snapshot;
}

function currentLyricsContext() {
  return {
    playerTrackId: playerState.track?.id ?? null,
    lyricsTrackId: lyricsTrack.value?.id ?? null,
    sourceFilename: lyricsSource.value?.filename ?? null,
  };
}

function handleLyricsOffsetIntent(intent) {
  return applyPerformerLyricsOffsetIntent(intent, {
    getPublishedContext: (publishedRevision) =>
      publishedContexts.get(publishedRevision) ?? null,
    getCurrentContext: currentLyricsContext,
    adjustOffset,
    resetOffset,
    retryOffsetSave,
  });
}

function handleControlIntent(intent) {
  if (!state.open) return Promise.resolve(false);
  return applyPerformerControlIntent(intent, {
    getPublishedContext: (revision) => publishedContexts.get(revision) ?? null,
    getCurrentContext: currentLyricsContext,
    play,
    pause,
    canSelectReadingVariant: (variant) =>
      availableReadingVariants.value.includes(variant),
    selectReadingVariant,
  }).catch((error) => {
    reportPerformerError(error, 'control', '提詞器操作未完成，請再試一次。');
    return false;
  });
}

const publisher = createLatestAsyncPublisher(
  (snapshot) => bridgeMethod('publishPerformerSnapshot')(snapshot),
  {
    // Every projection change republishes; only the first failure of a
    // streak is recorded and shown, and the next success withdraws it.
    onError: (error) => {
      if (errorOperation === 'publish') return;
      state.error = reportPerformerError(error, 'publish', '請再試一次。');
    },
    onSuccess: () => clearPerformerError('publish'),
  },
);

async function refreshStatus() {
  try {
    applyStatus(await bridgeMethod('getPerformerViewStatus')());
    clearPerformerError('status');
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
    clearPerformerError();
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

async function close() {
  state.isOpening = true;
  try {
    applyStatus(await bridgeMethod('closePerformerView')());
    clearPerformerError();
    return true;
  } catch (error) {
    state.error = reportPerformerError(
      error,
      'close',
      '目前無法關閉表演者畫面，請再試一次。',
    );
    return false;
  } finally {
    state.isOpening = false;
  }
}

async function toggle() {
  return state.open ? close() : open();
}

async function initialize() {
  if (initialized) return;
  initialized = true;

  await refreshStatus();
  if (typeof window.Utawakui?.onPerformerViewStatus === 'function') {
    unsubscribeStatus = window.Utawakui.onPerformerViewStatus(applyStatus);
  }
  if (typeof window.Utawakui?.onPerformerLyricsOffsetIntent === 'function') {
    unsubscribeLyricsOffsetIntent =
      window.Utawakui.onPerformerLyricsOffsetIntent(handleLyricsOffsetIntent);
  }
  if (typeof window.Utawakui?.onPerformerControlIntent === 'function') {
    unsubscribeControlIntent =
      window.Utawakui.onPerformerControlIntent(handleControlIntent);
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
    unsubscribeLyricsOffsetIntent?.();
    unsubscribeControlIntent?.();
    readingDisplayScope?.stop();
    stopProjectionWatch?.();
    stopReadingWatch?.();
  });
}

export function usePerformerSelfView() {
  return {
    state: readonly(state),
    initialize,
    open,
    close,
    toggle,
    refreshStatus,
  };
}
