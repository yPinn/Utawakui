import { describe, expect, it } from 'vitest';
import {
  LEGACY_KEYBOARD_BINDINGS,
  defineKeyboardBinding,
} from './keyboardBindingDefinitions.mjs';
import {
  defaultShortcutConfiguration,
  SHORTCUT_COMMANDS,
  validateShortcutConfiguration,
} from './keyboardShortcutContract.mjs';

describe('shared legacy keyboard policy', () => {
  it('shares immutable fully specified legacy reservations without changing Shift or repeat policy', () => {
    expect(Object.isFrozen(LEGACY_KEYBOARD_BINDINGS)).toBe(true);
    expect(LEGACY_KEYBOARD_BINDINGS.every(Object.isFrozen)).toBe(true);
    const mute = LEGACY_KEYBOARD_BINDINGS.find((b) => b.id === 'player.mute');
    expect(mute).toMatchObject({
      key: 'm',
      ctrl: false,
      alt: false,
      meta: false,
      shift: null,
      noRepeat: false,
    });
    expect(
      LEGACY_KEYBOARD_BINDINGS.find((b) => b.id === 'player.transpose-up'),
    ).toMatchObject({
      key: 'arrowup',
      ctrl: true,
      shift: false,
      noRepeat: false,
    });
    for (const command of SHORTCUT_COMMANDS.filter(
      (value) => value.defaultApp,
    )) {
      expect(
        LEGACY_KEYBOARD_BINDINGS.find((binding) => binding.id === command.id),
      ).toMatchObject(command.defaultApp);
    }
    expect(
      validateShortcutConfiguration(
        defaultShortcutConfiguration(),
        LEGACY_KEYBOARD_BINDINGS,
      ),
    ).toBeTruthy();
  });
  it('fills only absent policy fields for destination and other fixed bindings', () => {
    expect(
      defineKeyboardBinding({
        id: 'view.test',
        key: 'f2',
        editable: 'allow',
        preventDefault: true,
      }),
    ).toMatchObject({
      editable: 'allow',
      preventDefault: true,
      shift: null,
      history: null,
    });
  });
});
