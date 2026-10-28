import { computed, reactive, readonly, shallowRef } from 'vue';
import {
  defaultShortcutConfiguration,
  SHORTCUT_COMMANDS,
  validateShortcutConfiguration,
} from '../../shared/keyboardShortcutContract.mjs';
import { LEGACY_KEYBOARD_BINDINGS } from '../../shared/keyboardBindingDefinitions.mjs';

const sessions = new WeakMap(),
  owners = new Set();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const commands = new Set(SHORTCUT_COMMANDS.map(({ id }) => id));
const messages = {
  invalid: '快捷鍵設定已損壞，原檔已保留。',
  unsupported: '快捷鍵設定格式尚未支援，原檔已保留。',
  conflict: '快捷鍵已在其他操作中變更，請重新讀取。',
};
function boundedWait(work) {
  let timer;
  return Promise.race([
    Promise.resolve().then(work),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Error('Shortcut settings timeout')),
        10000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
function validate(configuration) {
  const value = validateShortcutConfiguration(
    configuration,
    LEGACY_KEYBOARD_BINDINGS,
  );
  if (
    value.globalEnabled ||
    value.bindings.some((binding) => binding.global !== null)
  )
    throw TypeError('Unsupported global shortcuts');
  return value;
}
function snapshot(reply) {
  if (
    reply?.status !== 'ready' ||
    !(
      reply.revision === null ||
      (typeof reply.revision === 'string' &&
        /^[a-f0-9]{64}$/u.test(reply.revision))
    )
  )
    throw Error('Invalid shortcut snapshot');
  const configuration = validate(reply.configuration);
  if (
    reply.revision === null &&
    !same(configuration, defaultShortcutConfiguration())
  )
    throw Error('Unconfirmed missing preferences');
  return { revision: reply.revision, configuration };
}

// One machine preference owner. Active bindings change only after confirmed IO.
// Library changes do not reset this owner, and recording never crosses IPC.
export function useKeyboardShortcutSettings({
  bridge = globalThis.window?.Utawakui,
} = {}) {
  if (bridge && sessions.has(bridge)) return sessions.get(bridge);
  const configuration = shallowRef(defaultShortcutConfiguration());
  const state = reactive({
    loaded: false,
    reading: false,
    busy: false,
    status: 'loading',
    readError: '',
    saveError: '',
    recordingCommand: null,
  });
  let revision = null,
    serial = 0,
    disposed = false,
    initialization = null,
    recordingToken = null;
  const canEdit = computed(() => state.loaded && !state.reading && !state.busy);
  const isRecording = computed(() => Boolean(state.recordingCommand));
  const isDefault = computed(() =>
    same(configuration.value, defaultShortcutConfiguration()),
  );
  function failRead(status) {
    configuration.value = defaultShortcutConfiguration();
    state.loaded = false;
    state.status = status;
    state.readError = messages[status] ?? '無法讀取快捷鍵，請重新讀取。';
  }
  async function refresh() {
    if (disposed || state.busy || state.reading) return false;
    const request = ++serial;
    state.reading = true;
    try {
      const reply = await boundedWait(() => bridge.getKeyboardShortcuts());
      if (disposed || request !== serial) return false;
      if (reply?.status !== 'ready') {
        failRead(reply?.status);
        return false;
      }
      const saved = snapshot(reply);
      revision = saved.revision;
      configuration.value = saved.configuration;
      Object.assign(state, {
        loaded: true,
        status: 'ready',
        readError: '',
        saveError: '',
      });
      return true;
    } catch {
      if (!disposed && request === serial) failRead('unavailable');
      return false;
    } finally {
      if (request === serial) state.reading = false;
    }
  }
  function configurationFor(command, app) {
    if (!commands.has(command)) throw TypeError('Unknown shortcut command');
    return validate({
      ...configuration.value,
      bindings: configuration.value.bindings.map((binding) =>
        binding.command === command ? { ...binding, app } : binding,
      ),
    });
  }
  async function save(next) {
    if (disposed || !canEdit.value) return false;
    let candidate;
    try {
      candidate = validate(next);
    } catch {
      state.saveError = '這組快捷鍵無法使用，請重新設定。';
      return false;
    }
    const request = ++serial;
    state.busy = true;
    try {
      const reply = await boundedWait(() =>
        bridge.setKeyboardShortcuts({
          expectedRevision: revision,
          configuration: candidate,
        }),
      );
      if (disposed || request !== serial) return false;
      if (reply?.status !== 'ready') {
        if (['invalid', 'unsupported', 'conflict'].includes(reply?.status))
          failRead(reply.status);
        state.saveError =
          messages[reply?.status] ?? '快捷鍵尚未確認儲存，請重新讀取後再試。';
        return false;
      }
      const saved = snapshot(reply);
      if (
        saved.revision === null ||
        saved.revision === revision ||
        !same(saved.configuration, candidate)
      )
        throw Error('Unconfirmed shortcut write');
      revision = saved.revision;
      configuration.value = saved.configuration;
      Object.assign(state, {
        loaded: true,
        status: 'ready',
        readError: '',
        saveError: '',
      });
      return true;
    } catch {
      if (!disposed && request === serial)
        state.saveError = '快捷鍵尚未確認儲存，請重新讀取後再試。';
      return false;
    } finally {
      if (request === serial) state.busy = false;
    }
  }
  const owner = {
    configuration: readonly(configuration),
    state: readonly(state),
    canEdit,
    isRecording,
    isDefault,
    initialize: () => (initialization ??= refresh()),
    refresh,
    save,
    configurationFor,
    async saveBinding(command, app) {
      try {
        return await save(configurationFor(command, app));
      } catch {
        state.saveError = '這組快捷鍵無法使用，請重新設定。';
        return false;
      }
    },
    restoreAll: () => save(defaultShortcutConfiguration()),
    beginRecording(command) {
      if (disposed || !canEdit.value || !commands.has(command)) return null;
      state.recordingCommand = command;
      recordingToken = Symbol('shortcut-recording');
      return recordingToken;
    },
    finishRecording(token) {
      if (token && token === recordingToken) {
        recordingToken = null;
        state.recordingCommand = null;
      }
    },
    dispose() {
      disposed = true;
      serial++;
      recordingToken = null;
      Object.assign(state, {
        loaded: false,
        reading: false,
        busy: false,
        recordingCommand: null,
      });
      if (bridge && sessions.get(bridge) === owner) sessions.delete(bridge);
      owners.delete(owner);
    },
  };
  if (bridge) sessions.set(bridge, owner);
  owners.add(owner);
  return owner;
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    for (const owner of [...owners]) owner.dispose();
  });
