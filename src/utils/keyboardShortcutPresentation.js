import {
  normalizeShortcutChord,
  SHORTCUT_COMMANDS,
} from '../../shared/keyboardShortcutContract.mjs';
import { LEGACY_KEYBOARD_BINDINGS } from '../../shared/keyboardBindingDefinitions.mjs';
import { catalogKey, t } from './i18n.js';

const labels = {
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  space: 'Space',
  home: 'Home',
  end: 'End',
  pageup: 'Page Up',
  pagedown: 'Page Down',
};
export function formatShortcutChord(value) {
  let chord;
  try {
    chord = normalizeShortcutChord(value);
  } catch {
    return t('shortcuts.unset');
  }
  return [
    chord.ctrl ? 'Ctrl' : null,
    chord.alt ? 'Alt' : null,
    chord.shift ? 'Shift' : null,
    labels[chord.key] ?? chord.key.toUpperCase(),
  ]
    .filter(Boolean)
    .join(' + ');
}
export function shortcutConflictMessage(error, command) {
  if (error?.code === 'shortcut-conflict') {
    const other = error.commands?.find((id) => id !== command);
    const label = SHORTCUT_COMMANDS.some((item) => item.id === other)
      ? shortcutCommandLabel(other)
      : LEGACY_KEYBOARD_BINDINGS.some((item) => item.id === other)
        ? shortcutBindingLabel(other)
        : '';
    return label
      ? t('shortcuts.conflict.named', { command: label })
      : t('shortcuts.conflict.generic');
  }
  return t('shortcuts.conflict.invalid');
}

// Shared contracts carry ids only, never display copy.
export const shortcutCatalogKey = catalogKey;

export function shortcutCommandLabel(id) {
  return t(`shortcuts.commands.${shortcutCatalogKey(id)}.label`);
}

export function shortcutBindingLabel(id) {
  return t(`shortcuts.bindings.${shortcutCatalogKey(id)}`);
}
