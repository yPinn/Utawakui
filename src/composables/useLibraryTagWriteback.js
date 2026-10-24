import { reactive, readonly } from 'vue';

const MESSAGES = {
  busy: '音源正在使用中，請停止播放、預覽或處理後再試。',
  unsupported: '這組音檔標籤目前無法安全回寫，曲庫校對資訊仍保留。',
  conflict: '資料或音檔已變更，請重新開啟預覽。',
  stale: '曲庫已切換，請重新檢查。',
  expired: '預覽已失效，請重新建立。',
  'verification-failed': '檔案保留驗證未通過，原音檔未被替換。',
  'insufficient-space': '備份與回寫所需空間不足。',
  limit: '已達本次檔案或備份上限，音檔尚未同步。',
  'recovery-required': '上次音檔寫入尚未完成，請先恢復。',
  'recovery-conflict': '恢復資料與現有檔案有衝突，請保留備份並檢查。',
  'invalid-intent': '請檢查所選欄位與主要發行。',
};
export function useLibraryTagWriteback({
  bridge = globalThis.window?.Utawakui,
} = {}) {
  const state = reactive({
    busy: false,
    options: null,
    preview: null,
    error: '',
    message: '',
    needsRecovery: false,
    phase: null,
    cancelling: false,
  });
  let generation = 0,
    trackId = null,
    selection = {};
  function reset() {
    generation++;
    state.options = null;
    state.preview = null;
    state.error = '';
    state.message = '';
    state.needsRecovery = false;
  }
  function accept(value, status) {
    if (value?.status === status) return true;
    if (value?.status === 'cancelled') {
      state.message = '已取消音檔回寫，原音檔未變更。';
      return false;
    }
    state.needsRecovery = ['recovery-required', 'recovery-conflict'].includes(
      value?.status,
    );
    state.error =
      MESSAGES[value?.status] ?? '目前無法同步音檔，已儲存的曲庫資訊會保留。';
    return false;
  }
  async function run(work) {
    if (state.busy) return false;
    const token = generation;
    state.busy = true;
    state.error = '';
    state.message = '';
    try {
      return await work(token);
    } catch {
      if (token === generation)
        state.error = '目前無法同步音檔，已儲存的曲庫資訊會保留。';
      return false;
    } finally {
      state.busy = false;
      state.cancelling = false;
    }
  }
  async function load(id, release) {
    if (state.busy) return false;
    reset();
    trackId = id;
    selection = release
      ? { collectionId: release.collectionId, position: release.position }
      : {};
    return run(async (token) => {
      const v = await bridge.getLibraryTagOptions({ trackId, ...selection });
      if (token !== generation || !accept(v, 'ready')) return false;
      state.options = v;
      return true;
    });
  }
  function preview(fields) {
    return run(async (token) => {
      const v = await bridge.previewLibraryTags({
        trackId,
        ...selection,
        fields,
      });
      if (token !== generation || !accept(v, 'ready')) return false;
      state.preview = v;
      return true;
    });
  }
  function commit() {
    return run(async (token) => {
      const v = await observe(token, () =>
        bridge.commitLibraryTags({
          previewId: state.preview.previewId,
        }),
      );
      if (token !== generation || !accept(v, 'saved')) return false;
      state.preview = null;
      state.message = '已同步音檔資訊，原音檔已備份。';
      return true;
    });
  }
  function restore(receiptId) {
    return run(async (token) => {
      const v = await observe(token, () =>
        bridge.restoreLibraryTags({ receiptId }),
      );
      if (token !== generation || !accept(v, 'saved')) return false;
      state.preview = null;
      state.message = '已還原音檔，曲庫校對資訊仍保留。';
      return true;
    });
  }
  function recover() {
    return run(async (token) => {
      const v = await bridge.recoverLibraryTags();
      if (token !== generation || !accept(v, 'ready')) return false;
      state.needsRecovery = false;
      state.message = '已恢復音檔寫入，請重新開啟預覽。';
      return true;
    });
  }
  async function observe(token, work) {
    state.phase = 'preparing';
    const dispose = bridge.onLibraryTagProgress?.((value) => {
      if (token === generation && value.trackId === trackId)
        state.phase = value.phase;
    });
    try {
      return await work();
    } finally {
      dispose?.();
      state.phase = null;
    }
  }
  async function cancel() {
    if (!state.busy || state.cancelling || state.phase === 'committing')
      return false;
    state.cancelling = true;
    try {
      await bridge.cancelLibraryTags();
      return true;
    } catch {
      state.cancelling = false;
      state.error = '目前無法停止回寫，請稍候。';
      return false;
    }
  }
  return {
    state: readonly(state),
    load,
    preview,
    commit,
    restore,
    recover,
    cancel,
    reset,
    back() {
      if (!state.busy) state.preview = null;
    },
  };
}
