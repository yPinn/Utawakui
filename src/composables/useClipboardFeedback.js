import { readonly, shallowRef } from 'vue';

const MAX_COPY_LENGTH = 1024;
const IDLE_STATE = Object.freeze({ tone: 'idle', message: '' });

export function useClipboardFeedback({
  writeText = null,
  scheduleReset = (callback) => globalThis.setTimeout(callback, 1800),
  cancelReset = (timer) => globalThis.clearTimeout(timer),
} = {}) {
  const state = shallowRef(IDLE_STATE);
  let resetTimer = null;

  function clearPendingReset() {
    if (resetTimer === null) return;
    cancelReset(resetTimer);
    resetTimer = null;
  }

  function resetLater() {
    resetTimer = scheduleReset(() => {
      resetTimer = null;
      state.value = IDLE_STATE;
    });
  }

  async function copy(value, label, messages = {}) {
    const successMessage = messages.successMessage ?? `已複製 ${label}`;
    const errorMessage =
      messages.errorMessage ?? `無法複製${label}，請手動選取文字`;
    clearPendingReset();
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value.length > MAX_COPY_LENGTH
    ) {
      state.value = {
        tone: 'error',
        message: errorMessage,
      };
      resetLater();
      return false;
    }

    try {
      if (typeof writeText !== 'function') {
        throw new Error('clipboard action unavailable');
      }
      await writeText(value);
      state.value = { tone: 'success', message: successMessage };
      resetLater();
      return true;
    } catch {
      state.value = {
        tone: 'error',
        message: errorMessage,
      };
      resetLater();
      return false;
    }
  }

  function dispose() {
    clearPendingReset();
    state.value = IDLE_STATE;
  }

  return { state: readonly(state), copy, dispose };
}
