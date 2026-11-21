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
import { withMergedArtist } from '../utils/artistPage.js';
import { trackDisplayTitle } from '../utils/trackTitlePresentation.js';
import { useArtistIndex } from './useArtistIndex.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useAppNotifications } from './useAppNotifications.js';
import { useLibrary } from './useLibrary.js';
import { useLyrics } from './useLyrics.js';
import { useLyricsReading } from './useLyricsReading.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlaybackHistory } from './usePlaybackHistory.js';
import { useAppRightDock } from './useAppRightDock.js';
import { usePerformanceSessionPlayback } from './usePerformanceSessionPlayback.js';
import outputValues from '../../shared/outputContractValues.json';
import outputTemplates from '../../shared/outputTemplateValues.json';
import { projectCompanionOutputSlot } from '../../shared/companionOutput.mjs';
import { usePlayer } from './usePlayer.js';
import { t } from '../utils/i18n.js';

const PROJECTION_TIMESTAMP = '1970-01-01T00:00:00.000Z';

const { state: playerState, play, pause, samplePlaybackClock } = usePlayer();
const {
  state: queueState,
  upcomingTracks,
  queuedTracks,
  sourceUpcomingTracks,
} = usePlaybackQueue();
const dock = useAppRightDock();
const arrangement = usePerformanceSessionPlayback();
const { recentItems } = usePlaybackHistory();
const { state: artistIndexState } = useArtistIndex();
const { tracksById } = useLibrary();
function presentTrack(track) {
  if (!track) return track;
  const title = trackDisplayTitle(track, tracksById.value);
  return { ...withMergedArtist(track, artistIndexState.index), title };
}
const {
  state: lyricsState,
  selectedTrack: lyricsTrack,
  selectedSource: lyricsSource,
  lyricLines,
  activeLineIndex,
  localLyricsFrame,
  lyricsTextProcessing,
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
const companionOutput = shallowRef(null);
const latestSnapshot = shallowRef(null);
let errorOperation = null;

const state = reactive({
  open: false,
  fullScreen: false,
  alwaysOnTop: false,
  remoteReaders: 0,
  isOpening: false,
  error: '',
});

// The desktop prompter and paired phones read the same published snapshot.
function isPublishing() {
  return state.open || state.remoteReaders > 0;
}

const canProjectOutput = computed(
  () => state.remoteReaders > 0 && companionOutput.value?.isEnabled() === true,
);
const companionOutputSlots = computed(() => {
  if (!canProjectOutput.value) return null;
  const { state: outputState } = companionOutput.value.runtime;
  if (!outputState.slotsLoaded) return null;
  const slots = outputTemplates.slots.map(({ id }) =>
    projectCompanionOutputSlot(outputState.slots[id]),
  );
  return slots.every(Boolean) ? slots : null;
});

let initialized = false;
let revision = 0;
let unsubscribeStatus = null;
let unsubscribeLyricsOffsetIntent = null;
let unsubscribeControlIntent = null;
let readingDisplayScope = null;
const readingDisplay = shallowRef(null);
let stopProjectionWatch = null;
let stopOutputWatch = null;
let stopReadingWatch = null;
const publishedContexts = new Map();
const MAX_PUBLISHED_CONTEXTS = 12;

function bridgeMethod(name) {
  const method =
    typeof window !== 'undefined' ? window.Utawakui?.[name] : undefined;
  if (typeof method !== 'function') {
    throw new Error(t('performer.selfView.restart'));
  }
  return method;
}

function reportPerformerError(error, operation, message) {
  errorOperation = operation;
  return notifications.notifyFailure({
    key: NOTIFICATION_KEYS.PERFORMER_VIEW,
    title: t('performer.selfView.failedTitle'),
    message,
    error,
    code: `PERFORMER_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
    source: 'performer',
    operation,
    context: { retryable: true },
    actionLabel: t('performer.selfView.retry'),
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
  const wasPublishing = isPublishing();
  const wasConnected = state.remoteReaders > 0;
  state.open = status.open === true;
  state.fullScreen = status.fullScreen === true;
  state.alwaysOnTop = status.alwaysOnTop === true;
  state.remoteReaders = Number.isSafeInteger(status.remoteReaders)
    ? Math.max(0, status.remoteReaders)
    : 0;
  const connected = state.remoteReaders > 0;
  if (connected !== wasConnected) {
    notifications.notify({
      key: NOTIFICATION_KEYS.COMPANION_CONNECTION,
      title: t(
        connected
          ? 'companion.desktop.connected'
          : 'companion.desktop.disconnected',
      ),
      tone: connected ? 'success' : 'info',
      lifecycle: 'transient',
    });
  }
  if (!wasPublishing && isPublishing()) publisher.request(currentSnapshot());
  if (!isPublishing()) {
    clearPerformerError('publish');
    latestSnapshot.value = null;
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

function displayedArrangement() {
  if (dock.queueVariant.value !== 'arrangement') return [];
  if (dock.arrangementTab.value === 'history')
    return arrangement.historyItems.value.filter(
      ({ progress }) => progress === 'completed',
    );
  return [
    arrangement.currentItem.value,
    ...arrangement.pendingItems.value,
  ].filter(Boolean);
}

function projectionInput() {
  return {
    queueView: {
      tab: dock.queueTab.value,
      variant: dock.queueVariant.value,
      arrangementTab: dock.arrangementTab.value,
      arrangement: displayedArrangement()
        .slice(0, outputValues.maxQueueItems)
        .map((row) => ({
          id: row.itemId,
          title: row.displayTitle,
          artist: row.displayArtist,
          current: row.itemId === arrangement.currentItem.value?.itemId,
        })),
      recent: recentItems.value
        .slice(0, outputValues.maxQueueItems)
        .map(({ track }) => presentTrack(track)),
    },
    player: { ...playerState, track: presentTrack(playerState.track) },
    queue: {
      historyEntries: (queueState.historyEntries ?? []).map((entry) => ({
        ...entry,
        track: presentTrack(entry?.track),
      })),
      currentTrack: presentTrack(queueState.currentTrack),
      upcomingTracks: (upcomingTracks.value ?? []).map(presentTrack),
      manualQueueCount: queuedTracks?.value.length ?? 0,
      sourceName: queueState.sourceName,
    },
    lyrics: {
      trackId: lyricsTrack.value?.id ?? null,
      source: lyricsSource.value,
      lines: lyricLines.value,
      activeLineIndex: activeLineIndex.value,
      wordFrame: localLyricsFrame?.value,
      vocalRoles: lyricsTextProcessing?.lineRoles.value,
      offsetSeconds:
        lyricsState.playbackOffsetSeconds ?? lyricsState.offsetSeconds,
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

const projectedState = computed(() => ({
  ...projectPerformerSnapshot(projectionInput(), {
    revision: 0,
    generatedAt: PROJECTION_TIMESTAMP,
  }),
  outputSlots: companionOutputSlots.value,
}));

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
  const outputSlots = companionOutputSlots.value;
  if (outputSlots) snapshot.outputSlots = outputSlots;
  if (import.meta.env.DEV && matched) {
    const track = playerState.track;
    const recipeId = track.separation?.selectedRecipeId;
    const applied = playerState.audioControlApplication?.applied;
    const application = playerState.audioControlApplication;
    const controls =
      applied ??
      (application?.lanes?.monitor === 'applied'
        ? application.requested
        : null) ??
      (sample.phase === 'playing' ? null : playerState);
    snapshot.singAlong = {
      playbackRevision: sample.playbackRevision,
      continuityRevision: sample.continuityRevision,
      monitorPitchDelayMs: playerState.monitorPitchDelayMs ?? 0,
      guide:
        track.usesSeparatedAudio && recipeId
          ? {
              recipeId,
              completedAtMs:
                Date.parse(track.separation.results?.[recipeId]?.completedAt) ||
                0,
            }
          : null,
      semitones: controls
        ? (controls.transposeSemitones ?? 0) + (controls.pitchCents ?? 0) / 100
        : null,
    };
  }
  publishedContexts.set(revision, {
    ...currentLyricsContext(),
    outputSlots,
    upcoming: snapshot.state.queue.items.filter(
      ({ state }) => state === 'queued',
    ),
    manualQueueCount: snapshot.manualQueueCount,
    manualIds: queuedTracks?.value.map(({ id }) => id) ?? [],
    recentKeys: recentItems.value
      .slice(0, outputValues.maxQueueItems)
      .map(({ key }) => key),
  });
  while (publishedContexts.size > MAX_PUBLISHED_CONTEXTS) {
    publishedContexts.delete(publishedContexts.keys().next().value);
  }
  latestSnapshot.value = snapshot;
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

// True only for a revision this window published for the same track and
// lyrics source that are current now.
function matchesPublishedContext(publishedRevision, trackId) {
  const published = publishedContexts.get(publishedRevision);
  if (!published || published.playerTrackId !== trackId) return false;
  const current = currentLyricsContext();
  return (
    published.playerTrackId === current.playerTrackId &&
    published.lyricsTrackId === current.lyricsTrackId &&
    published.sourceFilename === current.sourceFilename
  );
}

function handleControlIntent(intent) {
  if (!isPublishing()) return Promise.resolve(false);
  return applyPerformerControlIntent(intent, {
    getPublishedContext: (revision) => publishedContexts.get(revision) ?? null,
    getCurrentContext: currentLyricsContext,
    play,
    pause,
    canSelectReadingVariant: (variant) =>
      availableReadingVariants.value.includes(variant),
    selectReadingVariant,
  }).catch((error) => {
    reportPerformerError(
      error,
      'control',
      t('performer.selfView.controlFailed'),
    );
    return false;
  });
}

function publishedQueueContext(revision, trackId) {
  const published = publishedContexts.get(revision);
  if (
    !published ||
    (published.playerTrackId ?? '') !== trackId ||
    (playerState.track?.id ?? '') !== trackId
  )
    return null;
  return published;
}

function applyOutputOption({ revision, trackId, outputChange }) {
  if (!canProjectOutput.value) return 'unavailable';
  const context = publishedContexts.get(revision);
  if (!context || (context.playerTrackId ?? '') !== trackId) return 'stale';
  const slot = context.outputSlots?.find(
    ({ templateId }) => templateId === outputChange.templateId,
  );
  return companionOutput.value.runtime.applyCompanionOutputOption(
    slot,
    outputChange,
  );
}

function resolvePublishedQueueSelection(revision, trackId, queueIndex) {
  const published = publishedQueueContext(revision, trackId);
  if (!published) return null;
  const target = published.upcoming[queueIndex]?.track;
  if (!target) return null;
  const source = queueIndex >= published.manualQueueCount;
  const tracks = source ? sourceUpcomingTracks.value : queuedTracks.value;
  const track = tracks.find(({ id }) => id === target.id);
  return track ? { track, source } : null;
}

function resolvePublishedRecentSelection(revision, trackId, index) {
  const key = publishedQueueContext(revision, trackId)?.recentKeys[index];
  return key ? recentItems.value.find((item) => item.key === key)?.track : null;
}

const publisher = createLatestAsyncPublisher(
  (snapshot) => bridgeMethod('publishPerformerSnapshot')(snapshot),
  {
    // Every projection change republishes; only the first failure of a
    // streak is recorded and shown, and the next success withdraws it.
    onError: (error) => {
      if (!isPublishing() || errorOperation === 'publish') return;
      state.error = reportPerformerError(
        error,
        'publish',
        t('performer.selfView.tryAgain'),
      );
    },
    onSuccess: () => {
      if (errorOperation === 'publish' && isPublishing()) {
        useAppDiagnostics().recordError(null, {
          code: 'PERFORMER_PUBLISH_RECOVERED',
          severity: 'info',
          source: 'performer',
          operation: 'publish',
          diagnosticMessage: 'Performer updates resumed',
          context: { status: 'recovered' },
        });
      }
      clearPerformerError('publish');
    },
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
      t('performer.selfView.readFailed'),
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
      t('performer.selfView.openFailed'),
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
      t('performer.selfView.closeFailed'),
    );
    return false;
  } finally {
    state.isOpening = false;
  }
}

async function toggle() {
  return state.open ? close() : open();
}

async function initialize({ output } = {}) {
  if (initialized) return;
  initialized = true;
  companionOutput.value = output ?? null;

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
    if (isPublishing()) publisher.request(currentSnapshot());
  });
  stopOutputWatch = watch(
    canProjectOutput,
    (enabled) => {
      if (!enabled) return;
      const { runtime } = companionOutput.value;
      if (!runtime.state.slotsLoaded) void runtime.loadSlots();
    },
    { immediate: true },
  );
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
    stopOutputWatch?.();
    stopReadingWatch?.();
  });
}

export function usePerformerSelfView() {
  return {
    state: readonly(state),
    latestSnapshot: readonly(latestSnapshot),
    initialize,
    applyOutputOption,
    open,
    close,
    toggle,
    refreshStatus,
    matchesPublishedContext,
    resolvePublishedQueueSelection,
    publishedQueueContext,
    resolvePublishedRecentSelection,
    applyControlIntent: handleControlIntent,
  };
}
