import { reactive, readonly } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import OUTPUT_RUNTIME_VALUES from '../../shared/outputRuntimeValues.json';
import { isOutputPortConflict } from '../utils/outputRuntimeError.js';
import { buildOutputSlotPayload } from '../utils/outputSlotPayload.js';
import { useOutputProjectionPublisher } from './output/useOutputProjectionPublisher.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useFeatureGates } from './useFeatureGates.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useLibrary } from './useLibrary.js';
import { useLyrics } from './useLyrics.js';
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
const { initialize: initializeLibrary } = useLibrary();
const { initialize: initializePlaylists } = usePlaylists();
const { initialize: initializeLyrics } = useLyrics();
const { requireFeatureGate } = useFeatureGateAccess();
const {
  state: featureGateState,
  isFeatureEnabled,
  refreshConfirmations,
} = useFeatureGates();
const { recordError } = useAppDiagnostics();

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

function bridgeMethod(name) {
  const method =
    typeof window !== 'undefined' ? window.Utawakui?.[name] : undefined;
  if (typeof method !== 'function') {
    throw new Error('輸出功能需要重新啟動應用程式才能載入新版橋接 API。');
  }
  return method;
}

function technicalErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function reportOutputError(error, operation, message) {
  return recordError(error, {
    code: `OUTPUT_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
    title: '輸出操作未完成',
    message,
    source: 'output',
    operation,
    context: { retryable: true },
  }).message;
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

async function surfaceStatusError(
  status,
  { operation, message, clearWhenHealthy = true },
) {
  const statusError = status?.error?.message ?? '';
  if (statusError) {
    state.error = reportOutputError(new Error(statusError), operation, message);
    if (isOutputPortConflict(statusError)) await suggestPorts();
    else state.suggestedPorts = [];
    return true;
  }

  if (clearWhenHealthy) state.error = '';
  state.suggestedPorts = [];
  return false;
}

function applySlots(document = {}) {
  state.slots =
    typeof document.slots === 'object' && document.slots !== null
      ? { ...document.slots }
      : {};
  state.slotsLoaded = true;
}

const projectionPublisher = useOutputProjectionPublisher({
  getBootId: () => state.status.bootId,
  getDisplayDelayMs: () => state.settings.displayDelayMs,
  isOutputEnabled: () => isFeatureEnabled(FEATURE_IDS.PUBLIC_OUTPUT_FLOW),
  publishSnapshot: (envelope) =>
    bridgeMethod('publishOutputSnapshot')(envelope),
  refreshStatus,
  reportPublishError: (error) => {
    state.error = reportOutputError(
      error,
      'publish',
      '輸出畫面未更新，請再試一次。',
    );
  },
});

async function refreshStatus() {
  try {
    const status = await bridgeMethod('getOutputStatus')();
    applyStatus(status);
    await surfaceStatusError(status, {
      operation: 'status',
      message: '輸出服務未啟動，請檢查連接埠後再試一次。',
    });
    return state.status;
  } catch (error) {
    state.error = reportOutputError(
      error,
      'status',
      '目前無法讀取輸出狀態，請再試一次。',
    );
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
    state.error = reportOutputError(
      error,
      'load-settings',
      '目前無法讀取輸出設定，請再試一次。',
    );
    return state.settings;
  } finally {
    state.isLoadingSettings = false;
  }
}

async function refreshProjection() {
  const initiallyEnabled = isFeatureEnabled(FEATURE_IDS.PUBLIC_OUTPUT_FLOW);
  if (!state.status.running || !initiallyEnabled) {
    return false;
  }
  const initialized = await initialize();
  const enabledAfterInitialize = isFeatureEnabled(
    FEATURE_IDS.PUBLIC_OUTPUT_FLOW,
  );
  if (!initialized || !state.status.running || !enabledAfterInitialize) {
    return false;
  }
  return projectionPublisher.publishCurrentProjection({
    forceContent: true,
  });
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
    const technicalMessage = technicalErrorMessage(error);
    state.error = reportOutputError(
      error,
      'save-settings',
      '輸出設定未儲存，請再試一次。',
    );
    if (isOutputPortConflict(technicalMessage)) await suggestPorts();
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
    message: '請先到設定啟用對外輸出，再啟動 Browser Source 輸出。',
  });
  if (!enabled) return false;

  state.isStarting = true;
  try {
    applyStatus(await bridgeMethod('startOutput')());
    state.error = '';
    state.suggestedPorts = [];
    if (!projectionPublisher.isHandshakeComplete()) {
      await projectionPublisher.publishCurrentProjection();
    }
    return true;
  } catch (error) {
    const technicalMessage = technicalErrorMessage(error);
    state.error = reportOutputError(
      error,
      'start',
      '輸出服務未啟動，請再試一次。',
    );
    if (isOutputPortConflict(technicalMessage)) await suggestPorts();
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
    state.error = reportOutputError(
      error,
      'stop',
      '輸出服務未停止，請再試一次。',
    );
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
    state.error = reportOutputError(
      error,
      'load-slots',
      '目前無法讀取輸出設定，請再試一次。',
    );
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
    state.error = reportOutputError(
      error,
      'save-slot',
      '輸出樣式未儲存，請再試一次。',
    );
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
      await Promise.all([refreshSettings(), refreshConfirmations()]);
      if (featureGateState.error) {
        projectionPublisher.setSourcesReady(false);
        state.error = featureGateState.error;
        return false;
      }
      const initialStatus = await bridgeMethod('connectOutputSource')();
      applyStatus(initialStatus);
      await surfaceStatusError(initialStatus, {
        operation: 'automatic-start',
        message: '輸出服務未啟動，請檢查連接埠後再試一次。',
        clearWhenHealthy: false,
      });
      await Promise.all([
        initializeLibrary(),
        initializePlaylists(),
        initializeLyrics(),
      ]);
      void projectionPublisher.refreshCurrentMusicStructure();
      projectionPublisher.setSourcesReady(true);
      if (isFeatureEnabled(FEATURE_IDS.PUBLIC_OUTPUT_FLOW)) {
        await projectionPublisher.publishCurrentProjection();
      }
      return true;
    } catch (error) {
      projectionPublisher.setSourcesReady(false);
      state.error = reportOutputError(
        error,
        'initialize',
        '輸出初始化未完成，請再試一次。',
      );
      return false;
    }
  })();
  return initializationPromise;
}

export function useOutputRuntime() {
  return {
    state: readonly(state),
    initialize,
    refreshProjection,
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
