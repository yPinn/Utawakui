import { reactive, readonly } from 'vue';

const sessions = new WeakMap();
const unavailable = {};
const MESSAGES = {
  busy: '音源正在使用中，請停止播放、預覽或處理後再恢復。',
  conflict: '資料已變更，請重新檢查後再確認。',
  stale: '曲庫位置已變更，請重新檢查。',
  expired: '這份預覽已失效，請重新檢查。',
  'source-missing': '參考資料未提供這個欄位，請保留目前值或手動輸入。',
  'invalid-intent': '欄位內容不完整或不合法，請檢查後再試。',
  'recovery-required': '上次寫入尚未完成，請先恢復未完成操作。',
  'recovery-conflict':
    '未完成操作涉及的資料已被修改，請保留現有檔案並檢查備份。',
  'asset-conflict': '兩張作品的頁面物件有衝突，請先整理後重新檢查。',
  'asset-limit': '合併後的頁面物件超過上限，請先整理後重新檢查。',
  limit: '本次資料超過可處理上限，請縮小範圍後再試。',
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
      state.message = '已停止檢查。';
      return false;
    }
    state.needsRecovery =
      value?.status === 'recovery-required' ||
      value?.status === 'recovery-conflict';
    state.error = MESSAGES[value?.status] ?? '目前無法完成操作，請稍後再試。';
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
      state.error ||= '目前無法完成操作，請稍後再試。';
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
      if (success) state.message = '已儲存到曲庫。';
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
      if (success) state.message = '已復原發行合併。';
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
      state.error = '目前無法停止，請稍後再試。';
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
