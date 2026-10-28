import {
  normalizeShortcutChord,
  SHORTCUT_COMMANDS,
} from '../../shared/keyboardShortcutContract.mjs';
import { LEGACY_KEYBOARD_BINDINGS } from '../../shared/keyboardBindingDefinitions.mjs';

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
    return '未設定';
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
    const label = [...SHORTCUT_COMMANDS, ...LEGACY_KEYBOARD_BINDINGS].find(
      (item) => item.id === other,
    )?.label;
    return label
      ? `這組按鍵已用於「${label}」，請換一組。`
      : '這組快捷鍵已被使用，請改用其他組合。';
  }
  return '無法使用這組按鍵，請換一組。';
}
