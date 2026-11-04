import { reactive, readonly } from 'vue';
import {
  INITIAL_OUTPUT_STATUS,
  useOutputRuntimeStatus,
} from './output/useOutputRuntimeStatus.js';
import { FEATURE_IDS } from '../constants/featureGates.js';
import OUTPUT_RUNTIME_VALUES from '../../shared/outputRuntimeValues.json';
import { isOutputPortConflict } from '../utils/outputRuntimeError.js';
import { buildOutputSlotPayload } from '../utils/outputSlotPayload.js';
import { createOutputPreferencesController } from './output/useOutputPreferences.js';
import { useOutputProjectionPublisher } from './output/useOutputProjectionPublisher.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useFeatureGates } from './useFeatureGates.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useLibrary } from './useLibrary.js';
import { useLyrics } from './useLyrics.js';
import { usePlaylists } from './usePlaylists.js';
import { t } from '../utils/i18n.js';

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
  status: { ...INITIAL_OUTPUT_STATUS },
  settings: {
    autoStart: true,
    port: OUTPUT_RUNTIME_VALUES.defaultPort,
    displayDelayMs: OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs,
  },
  suggestedPorts: [],
  slots: {},
  preferences: { recentColors: [], savedColors: [] },
  slotsLoaded: false,
  isStarting: false,
  isStopping: false,
  isOpeningWindow: false,
  isLoadingSlots: false,
  isSavingSlot: false,
  isLoadingSettings: false,
  isSavingSettings: false,
  preferenceError: '',
  error: '',
  errors: {},
});

let initializationPromise = null;

function bridgeMethod(name) {
  const method =
    typeof window !== 'undefined' ? window.Utawakui?.[name] : undefined;
  if (typeof method !== 'function') {
    throw new Error(t('outputPanel.runtime.restart'));
  }
  return method;
}

function technicalErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

const {
  reportOutputError,
  clearOutputFailure,
  applyStatus,
  surfaceStatusError,
} = useOutputRuntimeStatus({ state, recordError, suggestPorts });

const preferencesController = createOutputPreferencesController({
  getRecentColors: () => state.preferences.recentColors,
  setRecentColors: (recentColors) => {
    state.preferences = { ...state.preferences, recentColors };
  },
  getSavedColors: () => state.preferences.savedColors,
  setSavedColors: (savedColors) => {
    state.preferences = { ...state.preferences, savedColors };
  },
  setError: (message) => {
    state.preferenceError = message;
  },
  persistRecentColors: (recentColors) =>
    bridgeMethod('updateOutputRecentColors')(recentColors),
  persistSavedColors: (savedColors) =>
    bridgeMethod('updateOutputSavedColors')(savedColors),
  reportError: (error, preference) =>
    reportOutputError(
      error,
      preference === 'saved' ? 'save-color-palette' : 'save-color-history',
      preference === 'saved'
        ? t('outputPanel.runtime.savedColorsNotSaved')
        : t('outputPanel.runtime.recentColorsNotSaved'),
    ),
});

function applySlots(document = {}) {
  state.slots =
    typeof document.slots === 'object' && document.slots !== null
      ? { ...document.slots }
      : {};
  preferencesController.apply(document);
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
      t('outputPanel.runtime.displayNotUpdated'),
    );
  },
});

async function refreshStatus() {
  try {
    const status = await bridgeMethod('getOutputStatus')();
    applyStatus(status);
    clearOutputFailure('status');
    await surfaceStatusError(status, {
      operation: 'status',
      message: t('outputPanel.runtime.notStartedCheckPort'),
    });
    return state.status;
  } catch (error) {
    state.error = reportOutputError(
      error,
      'status',
      t('outputPanel.runtime.statusReadFailed'),
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
    clearOutputFailure('load-settings');
    return state.settings;
  } catch (error) {
    state.error = reportOutputError(
      error,
      'load-settings',
      t('outputPanel.runtime.settingsReadFailed'),
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
    clearOutputFailure('save-settings');
    clearOutputFailure('load-settings');
    await surfaceStatusError(result.status, {
      operation: 'save-settings',
      message: t('outputPanel.runtime.serviceFault'),
    });
    return true;
  } catch (error) {
    const technicalMessage = technicalErrorMessage(error);
    state.error = reportOutputError(
      error,
      'save-settings',
      t('outputPanel.runtime.settingsNotSaved'),
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
    message: t('outputPanel.runtime.enableToStart'),
  });
  if (!enabled) return false;

  state.isStarting = true;
  try {
    applyStatus(await bridgeMethod('startOutput')());
    clearOutputFailure('start');
    state.error = '';
    if (
      await surfaceStatusError(state.status, {
        operation: 'start',
        message: t('outputPanel.runtime.notStartedPort'),
      })
    )
      return false;
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
      t('outputPanel.runtime.notStarted'),
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
    clearOutputFailure('stop');
    state.error = '';
    if (
      await surfaceStatusError(state.status, {
        operation: 'stop',
        message: t('outputPanel.runtime.notStopped'),
      })
    )
      return false;
    state.suggestedPorts = [];
    return true;
  } catch (error) {
    state.error = reportOutputError(
      error,
      'stop',
      t('outputPanel.runtime.notStopped'),
    );
    return false;
  } finally {
    state.isStopping = false;
  }
}

async function openWindow(kind) {
  if (state.isOpeningWindow) return false;
  const enabled = await requireFeatureGate(FEATURE_IDS.PUBLIC_OUTPUT_FLOW, {
    source: 'output',
    operation: 'open-window',
    message: t('outputPanel.runtime.enableToOpen'),
  });
  if (!enabled || state.isOpeningWindow) return false;
  state.isOpeningWindow = true;
  try {
    const result = await bridgeMethod('openOutputWindow')(kind);
    clearOutputFailure('open-window');
    state.error = '';
    return Boolean(result);
  } catch (error) {
    state.error = reportOutputError(
      error,
      'open-window',
      t('outputPanel.runtime.windowNotOpened'),
    );
    return false;
  } finally {
    state.isOpeningWindow = false;
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
      t('outputPanel.runtime.settingsReadFailed'),
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
      t('outputPanel.runtime.styleNotSaved'),
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
        message: t('outputPanel.runtime.notStartedCheckPort'),
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
        t('outputPanel.runtime.initFailed'),
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
    openWindow,
    loadSlots,
    saveOutputSlot,
    saveRecentColor: preferencesController.saveRecentColor,
    toggleSavedColor: preferencesController.toggleSavedColor,
    saveSlotSettings,
    saveTemplateSelection,
  };
}
