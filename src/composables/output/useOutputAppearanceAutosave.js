import { computed, onScopeDispose, readonly, shallowRef } from 'vue';

export const OUTPUT_APPEARANCE_AUTOSAVE_DELAY_MS = 350;

export function useOutputAppearanceAutosave(options = {}) {
  const { save, delayMs = OUTPUT_APPEARANCE_AUTOSAVE_DELAY_MS } = options;
  const status = shallowRef('saved');
  const canRetry = computed(() => status.value === 'error');
  let timer = null;
  let pendingSnapshot = null;
  let pendingSnapshotKey = null;
  let failedSnapshot = null;
  let activeSnapshotKey = null;
  let workerPromise = null;
  let disposed = false;

  function clearPendingTimer() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  async function processQueue() {
    while (pendingSnapshot && !disposed) {
      const snapshot = pendingSnapshot;
      activeSnapshotKey = pendingSnapshotKey;
      pendingSnapshot = null;
      pendingSnapshotKey = null;
      status.value = 'saving';

      let succeeded;
      try {
        succeeded = (await save(snapshot)) === true;
      } catch {
        succeeded = false;
      }
      activeSnapshotKey = null;

      if (disposed) return succeeded;

      if (!succeeded) {
        failedSnapshot = pendingSnapshot ?? snapshot;
        pendingSnapshot = null;
        pendingSnapshotKey = null;
        status.value = 'error';
        return false;
      }
    }

    if (!disposed) status.value = 'saved';
    return true;
  }

  function startWorker() {
    if (workerPromise) return workerPromise;
    workerPromise = processQueue().finally(() => {
      workerPromise = null;
      if (pendingSnapshot && !disposed) {
        void startWorker();
      }
    });
    return workerPromise;
  }

  function schedule(snapshot, scheduleOptions = {}) {
    if (disposed || !snapshot) return Promise.resolve(false);
    const snapshotKey = JSON.stringify(snapshot);
    if (workerPromise && snapshotKey === activeSnapshotKey) {
      pendingSnapshot = null;
      pendingSnapshotKey = null;
      failedSnapshot = null;
      clearPendingTimer();
      return workerPromise;
    }
    pendingSnapshot = snapshot;
    pendingSnapshotKey = snapshotKey;
    failedSnapshot = null;
    clearPendingTimer();

    if (workerPromise) return workerPromise;
    if (scheduleOptions.immediate === true) return startWorker();

    status.value = 'pending';
    timer = setTimeout(() => {
      timer = null;
      void startWorker();
    }, delayMs);
    return Promise.resolve(true);
  }

  function flush() {
    clearPendingTimer();
    if (workerPromise) return workerPromise;
    if (pendingSnapshot) return startWorker();
    return Promise.resolve(status.value !== 'error');
  }

  function retry() {
    if (!failedSnapshot || disposed) {
      return Promise.resolve(status.value !== 'error');
    }
    pendingSnapshot = failedSnapshot;
    pendingSnapshotKey = JSON.stringify(failedSnapshot);
    failedSnapshot = null;
    return startWorker();
  }

  onScopeDispose(() => {
    disposed = true;
    clearPendingTimer();
    pendingSnapshot = null;
    pendingSnapshotKey = null;
    failedSnapshot = null;
  });

  return {
    status: readonly(status),
    canRetry,
    schedule,
    flush,
    retry,
  };
}
