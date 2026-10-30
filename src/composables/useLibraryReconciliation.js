import { reactive, readonly } from 'vue';
import { t } from '../utils/i18n.js';

const sessions = new WeakMap();
const unavailable = {};
const MESSAGES = {
  busy: t('reconciliation.messages.busy'),
  conflict: t('reconciliation.messages.conflict'),
  stale: t('reconciliation.messages.stale'),
  expired: t('reconciliation.messages.expired'),
  'source-missing': t('reconciliation.messages.sourceMissing'),
  'invalid-intent': t('reconciliation.messages.invalidIntent'),
  'recovery-required': t('reconciliation.messages.recoveryRequired'),
  'recovery-conflict': t('reconciliation.messages.recoveryConflict'),
  'asset-conflict': t('reconciliation.messages.assetConflict'),
  'asset-limit': t('reconciliation.messages.assetLimit'),
  limit: t('reconciliation.messages.limit'),
};

function createSession(bridge) {
  const state = reactive({
    open: false,
    busy: false,
    scanning: false,
    cancelling: false,
    progress: null,
    page: null,
    preview: null,
    selectedItem: null,
    kind: 'all',
    error: '',
    message: '',
    needsRecovery: false,
  });
  let disposeProgress,
    disposeScope,
    currentEpoch = null,
    requestEpoch = null,
    generation = 0;
  function stale() {
    generation++;
    state.page = null;
    state.preview = null;
    state.progress = null;
    state.error = MESSAGES.stale;
  }
  function accepts(value, requestGeneration) {
    if (requestGeneration !== generation) return false;
    requestEpoch ??= value?.libraryEpoch;
    if (
      currentEpoch !== null &&
      requestEpoch !== undefined &&
      currentEpoch !== requestEpoch
    ) {
      stale();
      return false;
    }
    return true;
  }
  function check(value, statuses) {
    if (statuses.includes(value?.status)) return true;
    if (value?.status === 'cancelled') {
      state.message = t('reconciliation.messages.stopped');
      return false;
    }
    state.needsRecovery =
      value?.status === 'recovery-required' ||
      value?.status === 'recovery-conflict';
    state.error =
      MESSAGES[value?.status] ?? t('reconciliation.messages.failed');
    return false;
  }
  async function run(work) {
    if (state.busy) return false;
    state.busy = true;
    state.error = '';
    state.message = '';
    try {
      return await work(generation);
    } catch {
      state.error ||= t('reconciliation.messages.failed');
      return false;
    } finally {
      state.busy = false;
      state.scanning = false;
      state.cancelling = false;
    }
  }
  async function readPage(offset = 0, kind = state.kind) {
    return run(async (token) => {
      if (!state.page) return false;
      const value = await bridge.getLibraryReconciliationPage({
        scanId: state.page.scanId,
        offset,
        limit: 25,
        kind,
      });
      if (!accepts(value, token) || !check(value, ['ready'])) return false;
      state.page = value;
      state.kind = kind;
      return true;
    });
  }
  async function loadScan(token) {
    state.scanning = true;
    state.page = null;
    state.preview = null;
    state.selectedItem = null;
    state.progress = null;
    requestEpoch = null;
    state.needsRecovery = false;
    const value = await bridge.scanLibraryReconciliation();
    if (!accepts(value, token) || !check(value, ['ready'])) return false;
    state.page = value;
    state.kind = 'all';
    return true;
  }
  function scan() {
    return run(loadScan);
  }
  function open() {
    state.open = true;
    if (!disposeProgress)
      disposeProgress = bridge.onLibraryReconciliationProgress?.((value) => {
        if (state.scanning && accepts(value, generation))
          state.progress = value;
      });
    if (!disposeScope)
      disposeScope = bridge.onReleaseOrganizationChanged?.((value) => {
        currentEpoch = value.libraryEpoch;
        if (
          requestEpoch !== null &&
          requestEpoch !== undefined &&
          currentEpoch !== requestEpoch
        )
          stale();
      });
    return scan();
  }
  function close() {
    if (state.busy) return;
    generation++;
    state.open = false;
    state.preview = null;
    state.selectedItem = null;
    disposeProgress?.();
    disposeScope?.();
    disposeProgress = null;
    disposeScope = null;
    currentEpoch = null;
    requestEpoch = null;
  }
  function preview(item) {
    return run(async (token) => {
      const value = await bridge.previewLibraryReconciliation({
        scanId: state.page.scanId,
        itemId: item.itemId,
      });
      if (!accepts(value, token) || !check(value, ['ready'])) return false;
      state.preview = value;
      state.selectedItem = item;
      return true;
    });
  }
  function back() {
    if (!state.busy) {
      state.preview = null;
      state.selectedItem = null;
      state.error = '';
    }
  }
  function commit(edits) {
    return run(async (token) => {
      const value = await bridge.commitLibraryReconciliation({
        previewId: state.preview.previewId,
        ...edits,
      });
      if (!accepts(value, token) || !check(value, ['saved'])) return false;
      const success = await loadScan(token);
      if (success) state.message = t('reconciliation.messages.saved');
      return success;
    });
  }
  function decide(item, action) {
    return run(async (token) => {
      const value = await bridge.decideLibraryReconciliation({
        scanId: state.page.scanId,
        itemId: item.itemId,
        action,
      });
      if (!accepts(value, token) || !check(value, ['saved'])) return false;
      return loadScan(token);
    });
  }
  function undo(mergeId) {
    return run(async (token) => {
      const value = await bridge.undoLibraryReconciliation({
        mergeId,
        libraryEpoch: state.page.libraryEpoch,
      });
      if (!accepts(value, token) || !check(value, ['saved'])) return false;
      const success = await loadScan(token);
      if (success) state.message = t('reconciliation.messages.undone');
      return success;
    });
  }
  async function cancel() {
    if (!state.scanning || state.cancelling) return false;
    state.cancelling = true;
    try {
      await bridge.cancelLibraryReconciliation();
      return true;
    } catch {
      state.cancelling = false;
      state.error = t('reconciliation.messages.stopFailed');
      return false;
    }
  }
  function recover() {
    return run(async (token) => {
      const value = await bridge.recoverLibraryReconciliation();
      if (!accepts(value, token)) return false;
      if (!value || typeof value.recovered !== 'boolean') {
        check(value, []);
        return false;
      }
      return loadScan(token);
    });
  }
  return {
    state: readonly(state),
    open,
    close,
    scan,
    page: readPage,
    preview,
    back,
    commit,
    decide,
    undo,
    cancel,
    recover,
    async tagsSaved(message) {
      const loaded = await scan();
      if (loaded) state.message = message;
      return loaded;
    },
  };
}

export function useLibraryReconciliation(options = {}) {
  const bridge =
    options.bridge ??
    (typeof window !== 'undefined' ? window.Utawakui : null) ??
    unavailable;
  if (!sessions.has(bridge)) sessions.set(bridge, createSession(bridge));
  return sessions.get(bridge);
}
