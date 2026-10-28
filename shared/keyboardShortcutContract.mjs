// Product intents only. Neither this contract nor its configuration registers
// accelerators, executes commands, or owns persistence.
const chord = (key, ctrl = false) =>
  Object.freeze({ key, ctrl, alt: false, shift: false });

export const SHORTCUT_COMMANDS = Object.freeze(
  [
    ['player.play-pause', '播放／暫停'],
    ['player.previous', '上一首'],
    ['player.next', '下一首'],
    ['player.transpose-up', '移調 +1', chord('arrowup', true)],
    ['player.transpose-down', '移調 −1', chord('arrowdown', true)],
    ['lyrics.offset-up', '歌詞偏移 +0.1 秒'],
    ['lyrics.offset-down', '歌詞偏移 −0.1 秒'],
  ].map(([id, label, defaultApp = null]) =>
    Object.freeze({ id, label, defaultApp }),
  ),
);

const COMMAND_IDS = new Set(SHORTCUT_COMMANDS.map(({ id }) => id));
const KEY_ALIASES = new Map([
  ['up', 'arrowup'],
  ['down', 'arrowdown'],
  ['left', 'arrowleft'],
  ['right', 'arrowright'],
  [' ', 'space'],
  ['spacebar', 'space'],
]);
const SUPPORTED_KEY =
  /^(?:[a-z0-9]|arrow(?:up|down|left|right)|home|end|pageup|pagedown|space|f1[0-2])$/u;
const RESERVED_CTRL_LETTERS = new Set('acfhlnoprstvwxyz');

function exactObject(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

export function normalizeShortcutChord(value, scope = 'app') {
  if (
    !['app', 'global'].includes(scope) ||
    !exactObject(value, ['key', 'ctrl', 'alt', 'shift']) ||
    typeof value.key !== 'string' ||
    value.key.length > 12 ||
    !/^[\x20-\x7e]+$/u.test(value.key) ||
    !['ctrl', 'alt', 'shift'].every((key) => typeof value[key] === 'boolean')
  ) {
    throw new TypeError('Invalid shortcut chord');
  }
  const lower = value.key.toLowerCase();
  const key = KEY_ALIASES.get(lower) ?? lower;
  const { ctrl, alt, shift } = value;
  if (
    !SUPPORTED_KEY.test(key) ||
    (ctrl && alt) ||
    (ctrl && RESERVED_CTRL_LETTERS.has(key)) ||
    (alt && key === 'space') ||
    (scope === 'global' && !ctrl && !alt)
  ) {
    throw new TypeError('Unsupported shortcut chord');
  }
  return Object.freeze({ key, ctrl, alt, shift });
}

function normalizeAppBinding(value) {
  if (
    exactObject(value, ['mode']) &&
    ['default', 'disabled'].includes(value.mode)
  ) {
    return Object.freeze({ mode: value.mode });
  }
  if (exactObject(value, ['mode', 'chord']) && value.mode === 'custom') {
    return Object.freeze({
      mode: 'custom',
      chord: normalizeShortcutChord(value.chord),
    });
  }
  throw new TypeError('Invalid App shortcut binding');
}

export function normalizeShortcutConfiguration(value) {
  if (
    !exactObject(value, ['schemaVersion', 'globalEnabled', 'bindings']) ||
    value.schemaVersion !== 1 ||
    typeof value.globalEnabled !== 'boolean' ||
    !Array.isArray(value.bindings) ||
    value.bindings.length > SHORTCUT_COMMANDS.length
  ) {
    throw new TypeError('Invalid shortcut configuration');
  }
  const supplied = new Map();
  for (const binding of value.bindings) {
    if (
      !exactObject(binding, ['command', 'app', 'global']) ||
      !COMMAND_IDS.has(binding.command) ||
      supplied.has(binding.command)
    ) {
      throw new TypeError('Invalid shortcut command');
    }
    supplied.set(
      binding.command,
      Object.freeze({
        command: binding.command,
        app: normalizeAppBinding(binding.app),
        global:
          binding.global === null
            ? null
            : normalizeShortcutChord(binding.global, 'global'),
      }),
    );
  }
  return Object.freeze({
    schemaVersion: 1,
    globalEnabled: value.globalEnabled,
    bindings: Object.freeze(
      SHORTCUT_COMMANDS.map(
        ({ id }) =>
          supplied.get(id) ??
          Object.freeze({
            command: id,
            app: Object.freeze({ mode: 'default' }),
            global: null,
          }),
      ),
    ),
  });
}

export function defaultShortcutConfiguration() {
  return normalizeShortcutConfiguration({
    schemaVersion: 1,
    globalEnabled: false,
    bindings: [],
  });
}

// Trusted legacy inventory may use shift:null to match either Shift state.
// Custom chords never have wildcards or Meta; do not normalize legacy policy.
export function shortcutChordsOverlap(a, b) {
  return (
    a.key === b.key &&
    Boolean(a.ctrl) === Boolean(b.ctrl) &&
    Boolean(a.alt) === Boolean(b.alt) &&
    Boolean(a.meta) === Boolean(b.meta) &&
    (a.shift === null || b.shift === null || a.shift === b.shift)
  );
}

export function validateShortcutConfiguration(value, reservedBindings = []) {
  const normalized = normalizeShortcutConfiguration(value);
  const entries = [];
  for (const [index, binding] of normalized.bindings.entries()) {
    const app =
      binding.app.mode === 'default'
        ? SHORTCUT_COMMANDS[index].defaultApp
        : binding.app.mode === 'custom'
          ? binding.app.chord
          : null;
    if (app) entries.push({ command: binding.command, chord: app });
    // Desired global mappings conflict even while global dispatch is disabled.
    if (binding.global) {
      entries.push({ command: binding.command, chord: binding.global });
    }
  }
  const fixed = reservedBindings.filter(({ id }) => !COMMAND_IDS.has(id));
  for (const [index, entry] of entries.entries()) {
    const fixedConflict = fixed.find((binding) =>
      shortcutChordsOverlap(entry.chord, binding),
    );
    const otherConflict = entries
      .slice(index + 1)
      .find(
        (other) =>
          entry.command !== other.command &&
          shortcutChordsOverlap(entry.chord, other.chord),
      );
    if (fixedConflict || otherConflict) {
      const error = new TypeError('Shortcut conflict');
      error.code = 'shortcut-conflict';
      error.commands = Object.freeze([
        entry.command,
        fixedConflict?.id ?? otherConflict.command,
      ]);
      throw error;
    }
  }
  return normalized;
}

export function shortcutChordFromEvent(event, scope = 'app') {
  if (
    !event ||
    (event.type !== undefined && event.type !== 'keydown') ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.getModifierState?.('AltGraph') ||
    event.repeat ||
    event.defaultPrevented ||
    event.metaKey ||
    event.location === 3
  ) {
    return null;
  }
  try {
    return normalizeShortcutChord(
      {
        key: event.key,
        ctrl: Boolean(event.ctrlKey),
        alt: Boolean(event.altKey),
        shift: Boolean(event.shiftKey),
      },
      scope,
    );
  } catch {
    return null;
  }
}
