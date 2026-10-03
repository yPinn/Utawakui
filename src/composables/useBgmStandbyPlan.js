import { computed, reactive, readonly } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';

const DEFAULT_DIM_DB = -12;

export const BGM_STANDBY_DEFAULT_SETTINGS = Object.freeze({
  volume: 0.25,
  isMuted: false,
  loop: true,
  fadeInSeconds: 1,
  fadeOutSeconds: 0.6,
  dimDb: DEFAULT_DIM_DB,
  dimAttackMs: 100,
  dimReleaseMs: 600,
  preRollSeconds: 0.75,
  postRollSeconds: 1,
});

function createEmptyPlan() {
  return {
    version: 3,
    updatedAt: null,
    trackIds: [],
    currentTrackId: null,
    positionSeconds: 0,
    settings: { ...BGM_STANDBY_DEFAULT_SETTINGS },
    items: [],
  };
}

const state = reactive({
  plan: createEmptyPlan(),
  isLoading: false,
  isSaving: false,
  isInitialized: false,
  error: null,
  validationError: null,
});
const { recordError } = useAppDiagnostics();

let pending = Promise.resolve();
let activeSaves = 0;
let initializationPromise = null;
let unsubscribeLibraryUpdated = null;

const currentItem = computed(
  () =>
    state.plan.items.find(
      (item) => item.trackId === state.plan.currentTrackId,
    ) ?? null,
);

function hasBridge() {
  return (
    typeof window !== 'undefined' &&
    typeof window.Utawakui?.getBgmStandbyPlan === 'function'
  );
}

function applyResult(result) {
  if (result?.ok === true && result.plan) {
    state.plan = result.plan;
    state.error = null;
    state.validationError = null;
    return true;
  }
  if (result?.ok === false && result.error) {
    state.validationError = result.error;
    return false;
  }
  throw new Error('invalid BGM standby response');
}

function recordOperationError(error, operation) {
  state.validationError = null;
  state.error = recordError(error, {
    code: 'BGM_STANDBY_RENDERER_FAILED',
    title: 'BGM 未更新',
    message: 'BGM 未更新，請再試一次。',
    source: 'bgm-standby',
    operation,
    context: { retryable: true },
  }).message;
}

function enqueue(operation, { saving = true, name = 'mutate' } = {}) {
  if (!hasBridge()) return Promise.resolve(false);
  if (saving) {
    activeSaves += 1;
    state.isSaving = true;
  }

  const task = pending.then(async () => {
    try {
      return applyResult(await operation());
    } catch (error) {
      recordOperationError(error, name);
      return false;
    } finally {
      if (saving) {
        activeSaves -= 1;
        state.isSaving = activeSaves > 0;
      }
    }
  });
  pending = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function refresh() {
  if (!hasBridge()) {
    state.isLoading = false;
    return Promise.resolve(false);
  }
  state.isLoading = true;
  return enqueue(() => window.Utawakui.getBgmStandbyPlan(), {
    saving: false,
    name: 'get',
  }).finally(() => {
    state.isLoading = false;
  });
}

function initialize() {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    if (!hasBridge()) {
      state.isInitialized = true;
      return;
    }
    unsubscribeLibraryUpdated ??=
      window.Utawakui.onLibraryUpdated?.(() => refresh()) ?? null;
    await refresh();
    state.isInitialized = true;
  })();
  return initializationPromise;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => unsubscribeLibraryUpdated?.());
}

function setTrack(trackId) {
  return enqueue(() => window.Utawakui.setBgmStandbyTrack(trackId), {
    name: 'set-track',
  });
}

function updateSettings(settings) {
  return enqueue(() => window.Utawakui.updateBgmStandbySettings(settings), {
    name: 'update-settings',
  });
}

function updatePosition(trackId, positionSeconds) {
  return enqueue(
    () =>
      window.Utawakui.updateBgmStandbyPosition({
        trackId,
        positionSeconds,
      }),
    { name: 'update-position' },
  );
}

export function useBgmStandbyPlan() {
  return {
    state: readonly(state),
    currentItem,
    initialize,
    refresh,
    setTrack,
    updateSettings,
    updatePosition,
  };
}
