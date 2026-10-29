import { computed, reactive, readonly, shallowRef } from 'vue';
import {
  defaultShortcutConfiguration,
  SHORTCUT_COMMANDS,
  validateShortcutConfiguration,
} from '../../shared/keyboardShortcutContract.mjs';
import { LEGACY_KEYBOARD_BINDINGS } from '../../shared/keyboardBindingDefinitions.mjs';
import { shortcutRuntimePresentation } from '../utils/keyboardShortcutSettingsPresentation.js';

const sessions = new WeakMap(),
  owners = new Set();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const commands = new Set(SHORTCUT_COMMANDS.map(({ id }) => id));
const messages = {
  invalid: '快捷鍵設定已損壞，原檔已保留。',
  unsupported: '快捷鍵設定格式尚未支援，原檔已保留。',
  conflict: '快捷鍵已在其他操作中變更，請重新讀取。',
};
const operationMessages = {
  occupied: '這組按鍵已被其他程式使用，請換一組或重試。',
  'keys-held': '請放開所有按鍵，再試一次。',
  busy: '快捷鍵正在處理，請稍後再試。',
  degraded: '背景快捷鍵已暫停，請重新讀取快捷鍵後再試。',
  unsupported: '這項背景快捷鍵尚未開放。',
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
function validate(configuration, globalCommands = []) {
  const value = validateShortcutConfiguration(
    configuration,
    LEGACY_KEYBOARD_BINDINGS,
  );
  if (
    (value.globalEnabled && !globalCommands.length) ||
    value.bindings.some(
      (binding) =>
        binding.global !== null && !globalCommands.includes(binding.command),
    )
  )
    throw TypeError('Unsupported global shortcuts');
  return value;
}
function snapshot(reply, globalCommands) {
  if (
    reply?.status !== 'ready' ||
    !(
      reply.revision === null ||
      (typeof reply.revision === 'string' &&
        /^[a-f0-9]{64}$/u.test(reply.revision))
    )
  )
    throw Error('Invalid shortcut snapshot');
  const configuration = validate(reply.configuration, globalCommands);
  if (
    reply.revision === null &&
    !same(configuration, defaultShortcutConfiguration())
  )
    throw Error('Unconfirmed missing preferences');
  return { revision: reply.revision, configuration };
}

// One machine preference owner. Active bindings change only after confirmed IO.
// Library changes do not reset this owner, and recording never crosses IPC.
export function createKeyboardShortcutSettings({
  bridge = globalThis.window?.Utawakui,
  globalCommands = [],
} = {}) {
  const eligible = Object.freeze(
    [...new Set(globalCommands)].filter((id) => commands.has(id)),
  );
  const configuration = shallowRef(defaultShortcutConfiguration());
  const runtimePresentation = shallowRef(null);
  const runtime = shallowRef(null);
  const state = reactive({
    loaded: false,
    reading: false,
    busy: false,
    status: 'loading',
    readError: '',
    saveError: '',
    recordingCommand: null,
    runtimeReading: false,
    runtimeError: '',
    testError: '',
    testing: false,
  });
  let revision = null,
    serial = 0,
    disposed = false,
    initialization = null,
    recordingToken = null;
  let runtimeSerial = 0;
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
      const saved = snapshot(reply, eligible);
      if (reply.runtime) acceptRuntime(reply.runtime);
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
  async function refreshRuntime() {
    if (disposed || state.runtimeReading || state.busy) return false;
    const request = ++runtimeSerial;
    state.runtimeReading = true;
    state.runtimeError = '';
    runtimePresentation.value = null;
    runtime.value = null;
    try {
      const reply = await boundedWait(() =>
        bridge.getKeyboardShortcutRuntime(),
      );
      if (disposed || request !== runtimeSerial) return false;
      acceptRuntime(reply);
      return true;
    } catch {
      if (!disposed && request === runtimeSerial)
        state.runtimeError = '無法讀取背景快捷鍵狀態，請重新讀取。';
      return false;
    } finally {
      if (request === runtimeSerial) state.runtimeReading = false;
    }
  }
  function acceptRuntime(reply) {
    runtimePresentation.value = shortcutRuntimePresentation(reply);
    runtime.value = {
      state: reply.state,
      busy: reply.busy,
      eligibleCommands: [...reply.eligibleCommands],
      active: reply.active.map(({ command, chord }) => ({
        command,
        chord: { ...chord },
      })),
      sessionDisabled: reply.sessionDisabled === true,
    };
    state.runtimeError = '';
  }
  const hasGlobalSettings = computed(
    () =>
      eligible.length > 0 &&
      eligible.some((id) => runtime.value?.eligibleCommands.includes(id)),
  );
  // Stopping uses confirmed local preferences and Main's own gate/CAS. Losing
  // the read-only runtime projection must never remove this escape route.
  const canStopGlobal = computed(
    () =>
      eligible.length > 0 && canEdit.value && configuration.value.globalEnabled,
  );
  function canConfigure(command, scope = 'app') {
    return Boolean(
      commands.has(command) &&
      canEdit.value &&
      (scope === 'app' ||
        (scope === 'global' &&
          eligible.includes(command) &&
          runtime.value?.eligibleCommands.includes(command) &&
          !runtime.value.busy &&
          !state.runtimeReading &&
          !state.runtimeError)),
    );
  }
  function configurationFor(command, binding, scope = 'app') {
    if (!commands.has(command)) throw TypeError('Unknown shortcut command');
    if (
      !['app', 'global'].includes(scope) ||
      (scope === 'global' && !eligible.includes(command))
    )
      throw TypeError('Unsupported shortcut scope');
    return validate(
      {
        ...configuration.value,
        bindings: configuration.value.bindings.map((item) =>
          item.command === command ? { ...item, [scope]: binding } : item,
        ),
      },
      eligible,
    );
  }
  async function save(next, { enable = false } = {}) {
    if (disposed || !canEdit.value) return false;
    let candidate;
    try {
      candidate = validate(next, eligible);
    } catch {
      state.saveError = '這組快捷鍵無法使用，請重新設定。';
      return false;
    }
    const request = ++serial;
    runtimeSerial++;
    state.runtimeReading = false;
    state.busy = true;
    try {
      const reply = await boundedWait(() =>
        (enable ? bridge.enableKeyboardShortcuts : bridge.setKeyboardShortcuts)(
          {
            expectedRevision: revision,
            configuration: candidate,
          },
        ),
      );
      if (disposed || request !== serial) return false;
      if (reply?.runtime) {
        try {
          acceptRuntime(reply.runtime);
        } catch {
          runtime.value = null;
          runtimePresentation.value = null;
          state.runtimeError = '無法讀取背景快捷鍵狀態，請重新讀取。';
        }
      }
      if (reply?.status !== 'ready') {
        if (['invalid', 'unsupported', 'conflict'].includes(reply?.status))
          failRead(reply.status);
        state.saveError =
          operationMessages[reply?.status] ??
          messages[reply?.status] ??
          '快捷鍵尚未確認儲存，請重新讀取後再試。';
        return false;
      }
      const saved = snapshot(reply, eligible);
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
      if (!disposed && request === serial) {
        state.saveError = '快捷鍵尚未確認儲存，請重新讀取後再試。';
        if (eligible.length && !candidate.globalEnabled) {
          try {
            const reply = await boundedWait(() =>
              bridge.getKeyboardShortcutRuntime(),
            );
            if (!disposed && request === serial) acceptRuntime(reply);
          } catch {
            if (!disposed && request === serial) {
              runtime.value = null;
              runtimePresentation.value = null;
              state.runtimeError = '無法讀取背景快捷鍵狀態，請重新讀取。';
            }
          }
        }
      }
      return false;
    } finally {
      if (request === serial) state.busy = false;
    }
  }
  async function testBinding(command, chord) {
    if (disposed || !canConfigure(command, 'global')) return false;
    let candidate;
    try {
      candidate = validate(
        { ...configurationFor(command, chord, 'global'), globalEnabled: true },
        eligible,
      );
    } catch {
      state.testError = '這組快捷鍵無法使用，請重新設定。';
      return false;
    }
    const request = ++serial;
    state.busy = state.testing = true;
    state.testError = '';
    state.saveError = '';
    try {
      const reply = await boundedWait(() =>
        bridge.testKeyboardShortcuts({
          expectedRevision: revision,
          configuration: candidate,
        }),
      );
      if (disposed || request !== serial) return false;
      acceptRuntime(reply?.runtime);
      if (
        reply?.status === 'tested' &&
        !['degraded', 'blocked', 'suspended', 'disposed'].includes(
          runtime.value.state,
        ) &&
        !runtime.value.busy
      )
        return true;
      if (['conflict', 'invalid'].includes(reply?.status))
        failRead(reply.status);
      state.testError =
        operationMessages[reply?.status] ??
        messages[reply?.status] ??
        '無法確認按鍵是否可用，請重試。';
      return false;
    } catch {
      if (!disposed && request === serial) {
        state.testError = '無法確認按鍵是否可用，請重新讀取後再試。';
        runtime.value = null;
        runtimePresentation.value = null;
        state.runtimeError = '無法讀取背景快捷鍵狀態，請重新讀取。';
      }
      return false;
    } finally {
      if (request === serial) state.busy = state.testing = false;
    }
  }
  const owner = {
    configuration: readonly(configuration),
    runtimePresentation: readonly(runtimePresentation),
    runtime: readonly(runtime),
    hasGlobalSettings,
    canStopGlobal,
    canConfigure,
    state: readonly(state),
    canEdit,
    isRecording,
    isDefault,
    initialize: () => (initialization ??= refresh()),
    refresh,
    refreshRuntime,
    save,
    configurationFor,
    testBinding,
    async saveBinding(command, binding, scope = 'app') {
      if (!canConfigure(command, scope)) return false;
      try {
        const next = configurationFor(command, binding, scope);
        return await save(
          runtime.value?.sessionDisabled
            ? { ...next, globalEnabled: false }
            : next,
        );
      } catch {
        state.saveError = '這組快捷鍵無法使用，請重新設定。';
        return false;
      }
    },
    restoreAll: () => save(defaultShortcutConfiguration()),
    setGlobalEnabled(enabled) {
      if (
        typeof enabled !== 'boolean' ||
        (enabled
          ? !hasGlobalSettings.value ||
            state.runtimeError ||
            state.runtimeReading
          : !canStopGlobal.value)
      )
        return Promise.resolve(false);
      return save(
        { ...configuration.value, globalEnabled: enabled },
        { enable: enabled },
      );
    },
    beginRecording(command, scope = 'app') {
      if (disposed || !canConfigure(command, scope)) return null;
      state.testError = state.saveError = '';
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
      runtimeSerial++;
      runtimePresentation.value = null;
      runtime.value = null;
      recordingToken = null;
      Object.assign(state, {
        loaded: false,
        reading: false,
        busy: false,
        recordingCommand: null,
        runtimeReading: false,
        testing: false,
      });
      if (bridge && sessions.get(bridge) === owner) sessions.delete(bridge);
      owners.delete(owner);
    },
  };
  owners.add(owner);
  return owner;
}
// Production is deliberately App-only. No renderer argument, runtime reply or
// environment flag can grant the isolated factory's background capabilities.
export function useKeyboardShortcutSettings({
  bridge = globalThis.window?.Utawakui,
} = {}) {
  if (bridge && sessions.has(bridge)) return sessions.get(bridge);
  const owner = createKeyboardShortcutSettings({ bridge });
  if (bridge) sessions.set(bridge, owner);
  return owner;
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    for (const owner of [...owners]) owner.dispose();
  });
