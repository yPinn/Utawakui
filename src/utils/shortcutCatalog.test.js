import { describe, expect, it } from 'vitest';
import { SHORTCUT_COMMANDS } from '../../shared/keyboardShortcutContract.mjs';
import { LEGACY_KEYBOARD_BINDINGS } from '../../shared/keyboardBindingDefinitions.mjs';
import {
  createKeyboardBindings,
  createPointerBindings,
} from './inputBindingRegistry.js';
import {
  shortcutBindingLabel,
  shortcutCatalogKey,
  shortcutCommandLabel,
} from './keyboardShortcutPresentation.js';
import { SHORTCUT_REFERENCE_SECTIONS } from './keyboardShortcutSettingsPresentation.js';

// Labels resolve through ids at runtime, so the static catalog test can't see them.
const resolved = (text) =>
  typeof text === 'string' && text && !text.startsWith('shortcuts.');

describe('shortcut catalog coverage', () => {
  it('maps dotted and dashed ids to camelCase keys', () => {
    expect(shortcutCatalogKey('history.back.browser-key')).toBe(
      'historyBackBrowserKey',
    );
  });

  it('resolves every command and fixed binding label', () => {
    for (const { id } of SHORTCUT_COMMANDS)
      expect(resolved(shortcutCommandLabel(id)), id).toBe(true);
    for (const { id } of LEGACY_KEYBOARD_BINDINGS)
      expect(resolved(shortcutBindingLabel(id)), id).toBe(true);
    for (const binding of [
      ...createKeyboardBindings(),
      ...createPointerBindings(),
    ])
      expect(resolved(binding.label), binding.id).toBe(true);
  });

  it('resolves every reference row', () => {
    for (const section of SHORTCUT_REFERENCE_SECTIONS)
      for (const row of section.rows) {
        expect(resolved(row.context), section.id).toBe(true);
        expect(resolved(row.action), row.context).toBe(true);
        if (row.note) expect(resolved(row.note), row.action).toBe(true);
      }
  });
});
