import { reactive, readonly } from 'vue';
import { t } from '../utils/i18n.js';

const MESSAGES = {
  busy: t('tagWriteback.messages.busy'),
  unsupported: t('tagWriteback.messages.unsupported'),
  conflict: t('tagWriteback.messages.conflict'),
  stale: t('tagWriteback.messages.stale'),
  expired: t('tagWriteback.messages.expired'),
  'verification-failed': t('tagWriteback.messages.verificationFailed'),
  'insufficient-space': t('tagWriteback.messages.insufficientSpace'),
  limit: t('tagWriteback.messages.limit'),
  'recovery-required': t('tagWriteback.messages.recoveryRequired'),
  'recovery-conflict': t('tagWriteback.messages.recoveryConflict'),
  'invalid-intent': t('tagWriteback.messages.invalidIntent'),
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
      state.message = t('tagWriteback.messages.cancelled');
      return false;
    }
    state.needsRecovery = ['recovery-required', 'recovery-conflict'].includes(
      value?.status,
    );
    state.error = MESSAGES[value?.status] ?? t('tagWriteback.messages.failed');
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
      if (token === generation) state.error = t('tagWriteback.messages.failed');
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
      state.message = t('tagWriteback.messages.synced');
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
      state.message = t('tagWriteback.messages.restored');
      return true;
    });
  }
  function recover() {
    return run(async (token) => {
      const v = await bridge.recoverLibraryTags();
      if (token !== generation || !accept(v, 'ready')) return false;
      state.needsRecovery = false;
      state.message = t('tagWriteback.messages.recovered');
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
      state.error = t('tagWriteback.messages.stopFailed');
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
