import { computed, reactive, readonly, watch } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import OUTPUT_CONTRACT_VALUES from '../../shared/outputContractValues.json';
import OUTPUT_RUNTIME_VALUES from '../../shared/outputRuntimeValues.json';
import { createLatestAsyncPublisher } from '../utils/latestAsyncPublisher.js';
import { isOutputPortConflict } from '../utils/outputRuntimeError.js';
import { buildOutputSlotPayload } from '../utils/outputSlotPayload.js';
import { projectOutputSnapshot } from '../utils/outputSnapshot.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useFeatureGates } from './useFeatureGates.js';
import { useLibrary } from './useLibrary.js';
import { useLyrics } from './useLyrics.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlayer } from './usePlayer.js';
import { usePlaylists } from './usePlaylists.js';

const EMPTY_STATUS = Object.freeze({
  running: false,
  host: OUTPUT_RUNTIME_VALUES.host,
  port: OUTPUT_RUNTIME_VALUES.defaultPort,
  revision: 0,
  httpUrl: null,
  wsUrl: null,
  clients: 0,
  bootId: null,
  sourceEpoch: null,
  desired: {
    running: false,
    port: OUTPUT_RUNTIME_VALUES.defaultPort,
    displayDelayMs: OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs,
  },
  observed: {
    serviceLifecycle: 'stopped',
    sourceSynchronization: 'unavailable',
    unavailableReason: 'renderer_not_connected',
    clients: 0,
  },
  effective: { host: null, port: null, sourceEpoch: null },
  error: null,
});
const PROJECTION_TIMESTAMP = '1970-01-01T00:00:00.000Z';

const { state: playerState } = usePlayer();
const { state: queueState, upcomingTracks } = usePlaybackQueue();
const { initialize: initializeLibrary } = useLibrary();
const { initialize: initializePlaylists } = usePlaylists();
const {
  state: lyricsState,
  selectedTrack: lyricsTrack,
  selectedSource: lyricsSource,
  lyricLines,
  activeLineIndex,
  initialize: initializeLyrics,
} = useLyrics();
const { requireFeatureGate } = useFeatureGateAccess();
const { isFeatureEnabled } = useFeatureGates();

const state = reactive({
  status: { ...EMPTY_STATUS },
  settings: {
    autoStart: true,
    port: OUTPUT_RUNTIME_VALUES.defaultPort,
    displayDelayMs: OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs,
  },
  suggestedPorts: [],
  slots: {},
  slotsLoaded: false,
  isStarting: false,
  isStopping: false,
  isLoadingSlots: false,
  isSavingSlot: false,
  isLoadingSettings: false,
  isSavingSettings: false,
  error: '',
});

let initializationPromise = null;
let sourceEpoch = createSourceEpoch();
let nextRevision = 0;
let handshakeComplete = false;
let sourcesSettled = false;
let fullPublishQueue = Promise.resolve();

function createSourceEpoch() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `epoch-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function bridgeMethod(name) {
  const method =
    typeof window !== 'undefined' ? window.Utawakui?.[name] : undefined;
  if (typeof method !== 'function') {
    throw new Error('輸出功能需要重新啟動應用程式才能載入新版橋接 API。');
  }
  return method;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function applyStatus(value = {}) {
  state.status = {
    ...EMPTY_STATUS,
    ...value,
    desired: { ...EMPTY_STATUS.desired, ...value.desired },
    observed: { ...EMPTY_STATUS.observed, ...value.observed },
    effective: { ...EMPTY_STATUS.effective, ...value.effective },
    running: value.running === true,
  };
}

function applySlots(document = {}) {
  state.slots =
    typeof document.slots === 'object' && document.slots !== null
      ? { ...document.slots }
      : {};
  state.slotsLoaded = true;
}

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
    output: {
      displayDelayMs: state.settings.displayDelayMs,
    },
  };
}

const projectedState = computed(() =>
  projectOutputSnapshot(projectionInput(), {
    revision: 0,
    generatedAt: PROJECTION_TIMESTAMP,
  }),
);

const continuityKey = computed(
  () =>
    `${playerState.track?.id ?? ''}\0${playerState.track?.url ?? ''}\0${
      playerState.continuityRevision ?? 0
    }`,
);

function createEnvelope(kind, baseSnapshot) {
  nextRevision += 1;
  const payload = {
    ...baseSnapshot,
    revision: nextRevision,
    generatedAt: new Date().toISOString(),
  };
  return {
    contractVersion: OUTPUT_CONTRACT_VALUES.projectionEnvelopeVersion,
    bootId: state.status.bootId,
    sourceEpoch,
    kind,
    revision: nextRevision,
    payload,
  };
}

async function sendEnvelope(kind, snapshot) {
  const accepted = await bridgeMethod('publishOutputSnapshot')(
    createEnvelope(kind, snapshot),
  );
  if (!accepted) await refreshStatus();
  return accepted;
}

const publisher = createLatestAsyncPublisher(
  async (snapshot) => sendEnvelope('update', snapshot),
  {
    onError: (error) => {
      state.error = `輸出狀態更新失敗：${errorMessage(error)}`;
    },
  },
);

function publishFull(snapshot, { newEpoch = false } = {}) {
  const task = fullPublishQueue.then(async () => {
    handshakeComplete = false;
    await publisher.whenIdle();
    if (newEpoch) sourceEpoch = createSourceEpoch();
    nextRevision = 0;
    const accepted = await sendEnvelope('full', snapshot);
    handshakeComplete = accepted;
    return accepted;
  });
  fullPublishQueue = task.catch(() => undefined);
  return task;
}

watch(
  [continuityKey, projectedState],
  ([nextContinuity, snapshot], [previousContinuity]) => {
    if (!sourcesSettled || !isFeatureEnabled(FEATURE_IDS.PUBLIC_OUTPUT_FLOW)) {
      return;
    }
    if (nextContinuity !== previousContinuity) {
      publishFull(snapshot, { newEpoch: true }).catch((error) => {
        state.error = `輸出狀態更新失敗：${errorMessage(error)}`;
      });
      return;
    }
    if (handshakeComplete) publisher.request(snapshot);
  },
);

async function refreshStatus() {
  try {
    const status = await bridgeMethod('getOutputStatus')();
    applyStatus(status);
    const statusError = status.error?.message ?? '';
    state.error = statusError ? `輸出服務啟動失敗：${statusError}` : '';
    if (isOutputPortConflict(statusError)) await suggestPorts();
    else state.suggestedPorts = [];
    return state.status;
  } catch (error) {
    state.error = errorMessage(error);
    state.suggestedPorts = [];
    return state.status;
  }
}

async function refreshSettings() {
  state.isLoadingSettings = true;
  try {
    const settings = await bridgeMethod('getOutputSettings')();
    state.settings = {
      autoStart: settings.autoStart === true,
      port: Number.isSafeInteger(settings.port)
        ? settings.port
        : OUTPUT_RUNTIME_VALUES.defaultPort,
      displayDelayMs: Number.isSafeInteger(settings.displayDelayMs)
        ? settings.displayDelayMs
        : OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs,
    };
    state.error = '';
    return state.settings;
  } catch (error) {
    state.error = `讀取輸出設定失敗：${errorMessage(error)}`;
    return state.settings;
  } finally {
    state.isLoadingSettings = false;
  }
}

async function suggestPorts() {
  try {
    const ports = await bridgeMethod('suggestOutputPorts')();
    state.suggestedPorts = Array.isArray(ports) ? ports : [];
    return state.suggestedPorts;
  } catch {
    state.suggestedPorts = [];
    return state.suggestedPorts;
  }
}

async function updateSettings(settings) {
  state.isSavingSettings = true;
  try {
    const result = await bridgeMethod('updateOutputSettings')({
      autoStart: settings.autoStart === true,
      port: Number(settings.port),
      displayDelayMs: Number(settings.displayDelayMs),
    });
    state.settings = { ...result.settings };
    applyStatus(result.status);
    state.suggestedPorts = [];
    state.error = '';
    return true;
  } catch (error) {
    const message = errorMessage(error);
    state.error = `保存輸出設定失敗：${message}`;
    if (isOutputPortConflict(message)) await suggestPorts();
    else state.suggestedPorts = [];
    return false;
  } finally {
    state.isSavingSettings = false;
  }
}

async function start() {
  const enabled = await requireFeatureGate(FEATURE_IDS.PUBLIC_OUTPUT_FLOW, {
    source: 'output',
    operation: 'start',
    message: '請先到設定啟用對外輸出，再建立 OBS Browser Source。',
  });
  if (!enabled) return false;

  state.isStarting = true;
  try {
    applyStatus(await bridgeMethod('startOutput')());
    state.error = '';
    state.suggestedPorts = [];
    if (!handshakeComplete) await publishFull(projectedState.value);
    return true;
  } catch (error) {
    const message = errorMessage(error);
    state.error = `啟動輸出失敗：${message}`;
    if (isOutputPortConflict(message)) await suggestPorts();
    else state.suggestedPorts = [];
    return false;
  } finally {
    state.isStarting = false;
  }
}

async function stop() {
  state.isStopping = true;
  try {
    applyStatus(await bridgeMethod('stopOutput')());
    state.error = '';
    state.suggestedPorts = [];
    return true;
  } catch (error) {
    state.error = `停止輸出失敗：${errorMessage(error)}`;
    return false;
  } finally {
    state.isStopping = false;
  }
}

async function loadSlots(seedSlots = {}) {
  if (state.isLoadingSlots) return;
  state.isLoadingSlots = true;
  try {
    let document = await bridgeMethod('listOutputSlots')();
    for (const [kind, seedSlot] of Object.entries(seedSlots)) {
      if (document.slots?.[kind]) continue;
      const payload = buildOutputSlotPayload(seedSlot);
      if (payload) {
        document = await bridgeMethod('upsertOutputSlot')(kind, payload);
      }
    }
    applySlots(document);
    state.error = '';
  } catch (error) {
    state.error = `讀取輸出設定失敗：${errorMessage(error)}`;
  } finally {
    state.isLoadingSlots = false;
  }
}

async function saveOutputSlot(kind, changes, seedSlot = null) {
  const slot = state.slots[kind] ?? seedSlot;
  const payload = buildOutputSlotPayload(slot, changes);
  if (!payload) return false;

  state.isSavingSlot = true;
  try {
    const document = await bridgeMethod('upsertOutputSlot')(kind, payload);
    applySlots(document);
    state.error = '';
    return true;
  } catch (error) {
    state.error = `保存 ${kind} 輸出設定失敗：${errorMessage(error)}`;
    return false;
  } finally {
    state.isSavingSlot = false;
  }
}

function saveTemplateSelection(kind, templateId, seedSlot = null) {
  return saveOutputSlot(kind, { templateId }, seedSlot);
}

function saveSlotSettings(kind, settings, seedSlot = null) {
  return saveOutputSlot(kind, { settings }, seedSlot);
}

function initialize() {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    try {
      await refreshSettings();
      applyStatus(await bridgeMethod('connectOutputSource')());
      await Promise.all([
        initializeLibrary(),
        initializePlaylists(),
        initializeLyrics(),
      ]);
      sourcesSettled = true;
      if (isFeatureEnabled(FEATURE_IDS.PUBLIC_OUTPUT_FLOW)) {
        await publishFull(projectedState.value);
      }
      return true;
    } catch (error) {
      sourcesSettled = false;
      state.error = `輸出初始化失敗：${errorMessage(error)}`;
      return false;
    }
  })();
  return initializationPromise;
}

export function useOutputRuntime() {
  return {
    state: readonly(state),
    initialize,
    refreshStatus,
    refreshSettings,
    updateSettings,
    start,
    stop,
    loadSlots,
    saveOutputSlot,
    saveSlotSettings,
    saveTemplateSelection,
  };
}
