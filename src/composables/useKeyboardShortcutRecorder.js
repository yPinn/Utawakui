import { nextTick, onMounted, onUnmounted, reactive, readonly } from 'vue';
import { shortcutChordFromEvent } from '../../shared/keyboardShortcutContract.mjs';
import { shortcutConflictMessage } from '../utils/keyboardShortcutPresentation.js';
import { t } from '../utils/i18n.js';

export function useKeyboardShortcutRecorder({
  settings,
  focusCommand = () => {},
}) {
  const state = reactive({
    command: null,
    scope: 'app',
    candidate: null,
    capturing: false,
    saving: false,
    error: '',
    testing: false,
    tested: false,
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
      testing: false,
      tested: false,
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
  function begin(command, scope = 'app') {
    if (disposed || state.saving) return false;
    if (!['app', 'global'].includes(scope)) return false;
    if (state.command) reset();
    token = settings.beginRecording(command, scope);
    if (!token) return false;
    serial++;
    Object.assign(state, {
      command,
      scope,
      candidate: null,
      capturing: true,
      error: '',
    });
    return true;
  }
  function capture(event) {
    if (!state.command || !state.capturing || state.saving || state.testing)
      return;
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
      state.error = t('shortcuts.errors.recordUnusable');
      return;
    }
    try {
      settings.configurationFor(
        state.command,
        state.scope === 'global' ? chord : { mode: 'custom', chord },
        state.scope,
      );
      state.candidate = chord;
      state.capturing = false;
      state.error = '';
    } catch (error) {
      state.error = shortcutConflictMessage(error, state.command);
    }
  }
  async function test() {
    if (
      state.scope !== 'global' ||
      !state.command ||
      !state.candidate ||
      state.testing ||
      state.saving
    )
      return false;
    const request = serial;
    state.testing = true;
    state.tested = false;
    state.error = '';
    try {
      const tested = await settings.testBinding(state.command, state.candidate);
      if (disposed || request !== serial) return false;
      state.tested = tested;
      if (!tested)
        state.error =
          settings.state?.testError || t('shortcuts.errors.testFailed');
      return tested;
    } catch {
      if (!disposed && request === serial)
        state.error = t('shortcuts.errors.testFailed');
      return false;
    } finally {
      if (request === serial) state.testing = false;
    }
  }
  async function apply() {
    if (
      !state.command ||
      !state.candidate ||
      state.saving ||
      state.testing ||
      (state.scope === 'global' && !state.tested)
    )
      return false;
    const command = state.command,
      candidate = state.candidate,
      request = serial;
    state.saving = true;
    try {
      const saved =
        state.scope === 'global'
          ? await settings.saveBinding(command, candidate, 'global')
          : await settings.saveBinding(command, {
              mode: 'custom',
              chord: candidate,
            });
      if (disposed || request !== serial) return saved;
      if (saved) {
        reset();
        restoreFocus(command);
      } else if (state.scope === 'global') state.tested = false;
      return saved;
    } catch {
      if (!disposed && request === serial)
        state.error = t('shortcuts.errors.recordUnconfirmed');
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
  return { state: readonly(state), begin, capture, test, apply, cancel };
}
