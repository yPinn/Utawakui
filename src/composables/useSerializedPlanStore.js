import { reactive } from 'vue';

// One main-owned plan document mirrored in the renderer. Every IPC call is
// serialized so responses apply in request order, and each returns either
// `{ ok: true, plan }` or a bounded validation error.
export function useSerializedPlanStore({
  createEmptyPlan,
  hasBridge,
  fetchPlan,
  invalidResponseMessage,
  errorPresentation,
  recordError,
}) {
  const state = reactive({
    plan: createEmptyPlan(),
    isLoading: false,
    isSaving: false,
    isInitialized: false,
    error: null,
    validationError: null,
  });

  let pending = Promise.resolve();
  let activeSaves = 0;
  let initializationPromise = null;
  let unsubscribeLibraryUpdated = null;
  let validationErrorOperation = null;

  function applyResult(result, onError, operation) {
    if (result?.ok === true && result.plan) {
      state.plan = result.plan;
      if (!onError) {
        state.error = null;
      }
      if (!onError || validationErrorOperation === operation) {
        state.validationError = null;
        validationErrorOperation = null;
      }
      return true;
    }
    if (result?.ok === false && result.error) {
      if (onError && !result.error.field) {
        onError(result.error.message);
        return false;
      }
      state.validationError = result.error;
      validationErrorOperation = operation;
      return false;
    }
    throw new Error(invalidResponseMessage);
  }

  function recordOperationError(error, operation, onError) {
    const message = recordError(error, {
      ...errorPresentation,
      operation,
      context: { retryable: true },
    }).message;
    if (onError) onError(message);
    else {
      state.validationError = null;
      validationErrorOperation = null;
      state.error = message;
    }
  }

  function enqueue(
    operation,
    { saving = true, name = 'mutate', onError = null } = {},
  ) {
    if (!hasBridge()) return Promise.resolve(false);
    if (saving) {
      activeSaves += 1;
      state.isSaving = true;
    }

    const task = pending.then(async () => {
      try {
        return applyResult(await operation(), onError, name);
      } catch (error) {
        recordOperationError(error, name, onError);
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
    return enqueue(fetchPlan, { saving: false, name: 'get' }).finally(() => {
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

  function dispose() {
    unsubscribeLibraryUpdated?.();
  }

  return { state, enqueue, refresh, initialize, dispose };
}
