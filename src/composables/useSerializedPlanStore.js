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
    throw new Error(invalidResponseMessage);
  }

  function recordOperationError(error, operation) {
    state.validationError = null;
    state.error = recordError(error, {
      ...errorPresentation,
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
