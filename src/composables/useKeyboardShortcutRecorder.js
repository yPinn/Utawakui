import { nextTick, onMounted, onUnmounted, reactive, readonly } from 'vue';
import { shortcutChordFromEvent } from '../../shared/keyboardShortcutContract.mjs';
import { shortcutConflictMessage } from '../utils/keyboardShortcutPresentation.js';

export function useKeyboardShortcutRecorder({
  settings,
  focusCommand = () => {},
}) {
  const state = reactive({
    command: null,
    candidate: null,
    capturing: false,
    saving: false,
    error: '',
  });
  let token = null,
    serial = 0,
    disposed = false;
  const view = globalThis.window,
    document = globalThis.document;
  function reset() {
    serial++;
    settings.finishRecording(token);
    token = null;
    Object.assign(state, {
      command: null,
      candidate: null,
      capturing: false,
      saving: false,
      error: '',
    });
  }
  function restoreFocus(command) {
    const request = serial;
    nextTick(() => {
      if (!disposed && serial === request) focusCommand(command);
    });
  }
  function cancel({ focus = true } = {}) {
    if (!state.command || state.saving) return;
    const command = state.command;
    reset();
    if (focus) restoreFocus(command);
  }
  function begin(command) {
    if (disposed || state.saving) return false;
    if (state.command) reset();
    token = settings.beginRecording(command);
    if (!token) return false;
    serial++;
    Object.assign(state, {
      command,
      candidate: null,
      capturing: true,
      error: '',
    });
    return true;
  }
  function capture(event) {
    if (!state.command || !state.capturing || state.saving) return;
    if (event.key === 'Tab') {
      cancel({ focus: false });
      return;
    }
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.repeat || event.defaultPrevented) return;
    const chord = shortcutChordFromEvent(event);
    event.preventDefault();
    if (['Control', 'Alt', 'Shift'].includes(event.key)) return;
    if (!chord) {
      state.error = '這組按鍵未開放，請改用其他組合。';
      return;
    }
    try {
      settings.configurationFor(state.command, { mode: 'custom', chord });
      state.candidate = chord;
      state.capturing = false;
      state.error = '';
    } catch (error) {
      state.error = shortcutConflictMessage(error, state.command);
    }
  }
  async function apply() {
    if (!state.command || !state.candidate || state.saving) return false;
    const command = state.command,
      candidate = state.candidate,
      request = serial;
    state.saving = true;
    try {
      const saved = await settings.saveBinding(command, {
        mode: 'custom',
        chord: candidate,
      });
      if (disposed || request !== serial) return saved;
      if (saved) {
        reset();
        restoreFocus(command);
      }
      return saved;
    } catch {
      if (!disposed && request === serial)
        state.error = '快捷鍵尚未確認儲存，請重試或取消。';
      return false;
    } finally {
      if (request === serial) state.saving = false;
    }
  }
  const blur = () => cancel({ focus: false });
  const hidden = () => {
    if (document?.hidden) blur();
  };
  const escape = (event) => {
    if (state.command && !state.saving && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  };
  onMounted(() => {
    view?.addEventListener('blur', blur);
    view?.addEventListener('keydown', escape, true);
    document?.addEventListener?.('visibilitychange', hidden);
  });
  onUnmounted(() => {
    disposed = true;
    reset();
    view?.removeEventListener('blur', blur);
    view?.removeEventListener('keydown', escape, true);
    document?.removeEventListener?.('visibilitychange', hidden);
  });
  return { state: readonly(state), begin, capture, apply, cancel };
}
