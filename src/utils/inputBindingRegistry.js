import {
  defineKeyboardBinding as define,
  LEGACY_KEYBOARD_BINDINGS,
} from '../../shared/keyboardBindingDefinitions.mjs';
import { APP_DESTINATIONS } from './appDestinationRegistry.js';
import {
  SHORTCUT_COMMANDS,
  shortcutChordFromEvent,
  shortcutChordsOverlap,
  validateShortcutConfiguration,
} from '../../shared/keyboardShortcutContract.mjs';
import { isShortcutInputBlocked } from './shortcutInputContext.js';
import { t } from './i18n.js';
import {
  shortcutBindingLabel,
  shortcutCommandLabel,
} from './keyboardShortcutPresentation.js';

// App-level keyboard bindings. Widget conventions (roving arrows, Enter-to-submit,
// Escape-to-dismiss) stay with their components; see docs/contracts/input-bindings.md.
//
// editable: 'ignore' skips the binding while typing in an editable field; 'allow'
// fires regardless of focus. shift: null ignores Shift, true/false requires it.
// Modifiers must match exactly, so Alt and Meta combinations stay reserved unless
// a binding declares them. noRepeat drops key auto-repeat; skipIfHandled yields to
// a component that already handled (preventDefault) the same event.

function viewBinding(id, label, key, view, devOnly = false) {
  return {
    id,
    label,
    key,
    view,
    editable: 'allow',
    preventDefault: true,
    devOnly,
  };
}

export function createKeyboardBindings({
  internalViewShortcuts = {},
  shortcutConfiguration,
} = {}) {
  const destinations = APP_DESTINATIONS.map((destination) =>
    viewBinding(
      `view.${destination.id}`,
      t('shortcuts.bindings.goTo', { destination: destination.label }),
      destination.shortcut,
      destination.id,
    ),
  );
  // F4 stays unassigned (ADR 0023); F5-F8 are dev-only workbenches.
  // F9 belongs to the Settings record in APP_DESTINATIONS.
  const internal = Object.entries(internalViewShortcuts).map(([key, view]) =>
    viewBinding(
      `view.internal.${view}`,
      t('shortcuts.bindings.internalView', { view }),
      key,
      view,
      true,
    ),
  );

  const baseline = [
    ...destinations,
    ...internal,
    ...LEGACY_KEYBOARD_BINDINGS.map((binding) => ({
      ...binding,
      label: shortcutBindingLabel(binding.id),
    })),
  ].map(define);
  if (shortcutConfiguration === undefined) return Object.freeze(baseline);
  const configuration = validateShortcutConfiguration(
    shortcutConfiguration,
    baseline,
  );
  const replacements = new Map(
    configuration.bindings.map((binding) => [binding.command, binding.app]),
  );
  const bindings = baseline.filter((binding) => {
    const replacement = replacements.get(binding.id);
    return !replacement || replacement.mode === 'default';
  });
  for (const [index, binding] of configuration.bindings.entries()) {
    if (binding.app.mode !== 'custom') continue;
    bindings.push(
      define({
        id: binding.command,
        label: shortcutCommandLabel(SHORTCUT_COMMANDS[index].id),
        ...binding.app.chord,
        custom: true,
        preventDefault: true,
        noRepeat: true,
        skipIfHandled: true,
      }),
    );
  }
  // Desired global chords are validated, never registered or dispatched here.
  return Object.freeze(bindings);
}

export function resolveKeyboardBinding(event, bindings, context = {}) {
  const key = event.key.toLowerCase();
  const ctrl = Boolean(event.ctrlKey);
  const alt = Boolean(event.altKey);
  const meta = Boolean(event.metaKey);
  const shift = Boolean(event.shiftKey);
  const customChord = bindings.some((binding) => binding.custom)
    ? shortcutChordFromEvent(event)
    : null;
  const customBlocked = !customChord || isShortcutInputBlocked(event, context);

  return (
    bindings.find((binding) =>
      binding.custom
        ? !customBlocked && shortcutChordsOverlap(binding, customChord)
        : binding.key === key &&
          binding.ctrl === ctrl &&
          binding.alt === alt &&
          binding.meta === meta &&
          (binding.shift === null || binding.shift === shift),
    ) ?? null
  );
}

// Mouse back／forward buttons (button 3／4) share the history actions.
export function createPointerBindings() {
  return Object.freeze([
    Object.freeze({
      id: 'history.back.mouse',
      label: shortcutBindingLabel('history.back.mouse'),
      button: 3,
      history: 'back',
    }),
    Object.freeze({
      id: 'history.forward.mouse',
      label: shortcutBindingLabel('history.forward.mouse'),
      button: 4,
      history: 'forward',
    }),
  ]);
}

export function resolvePointerBinding(event, bindings) {
  return bindings.find((binding) => binding.button === event.button) ?? null;
}
