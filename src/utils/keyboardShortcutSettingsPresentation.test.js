import { expect, it } from 'vitest';
import { defaultShortcutConfiguration } from '../../shared/keyboardShortcutContract.mjs';
import {
  shortcutSettingsRows,
  SHORTCUT_REFERENCE_SECTIONS,
} from './keyboardShortcutSettingsPresentation.js';
import {
  createKeyboardBindings,
  resolveKeyboardBinding,
} from './inputBindingRegistry.js';

it('never displays failed reads or disabled bindings as active, and distinguishes legacy from custom scope', () => {
  const configuration = structuredClone(defaultShortcutConfiguration());
  let rows = shortcutSettingsRows(configuration, 'audio', false);
  expect(
    rows.every((row) => row.keys.length === 0 && row.status === '尚未讀取'),
  ).toBe(true);
  configuration.bindings.find((b) => b.command === 'player.mute').app = {
    mode: 'disabled',
  };
  configuration.bindings.find((b) => b.command === 'player.volume-up').app = {
    mode: 'custom',
    chord: { key: 'j', ctrl: true, alt: false, shift: false },
  };
  rows = shortcutSettingsRows(configuration, 'audio', true);
  expect(rows[0]).toMatchObject({ keys: ['Ctrl', 'J'], status: '自訂' });
  expect(rows[0].scope).toContain('按鈕、選單、滑桿');
  expect(rows[1].scope).toContain('Shift');
  expect(rows[2]).toMatchObject({ keys: [], status: '已停用' });
  expect(shortcutSettingsRows(configuration, 'reference', true)).toEqual([]);
  expect(shortcutSettingsRows(configuration, 'unknown', true)).toEqual([]);
  expect(
    SHORTCUT_REFERENCE_SECTIONS[0].rows.some(({ chords }) =>
      chords.some((keys) => keys.join('') === 'F9'),
    ),
  ).toBe(true);
});

it('separates concise descriptions and reference context from structured key groups', () => {
  for (const category of ['playback', 'audio', 'lyrics']) {
    const rows = shortcutSettingsRows(
      defaultShortcutConfiguration(),
      category,
      true,
    );
    expect(rows.every((row) => row.guidance.length <= 24)).toBe(true);
    expect(
      rows.every(
        (row) =>
          !row.guidance.includes('長按') && !row.guidance.includes('互動控制'),
      ),
    ).toBe(true);
  }
  const rows = SHORTCUT_REFERENCE_SECTIONS.flatMap((section) => section.rows);
  expect(
    rows.every(
      (row) =>
        typeof row.context === 'string' &&
        typeof row.action === 'string' &&
        Array.isArray(row.chords),
    ),
  ).toBe(true);
  expect(
    rows.every((row) => !/(?:Ctrl|Shift|Enter|Esc|←|→)/u.test(row.context)),
  ).toBe(true);
  expect(
    rows
      .map(({ context, action, note }) => [context, action, note].join(' '))
      .join(' '),
  ).not.toMatch(/(?:SMTC|Folder|Dock|runtime|浮層|主播放器|內部工作台)/u);
  expect(
    SHORTCUT_REFERENCE_SECTIONS.find(({ id }) => id === 'practice').guidance,
  ).toContain('歌詞編輯 → 編輯 → 調整對時');
  expect(
    rows.every((row) =>
      row.chords.every(
        (chord) =>
          chord.length > 0 && chord.every((key) => !key.includes(' + ')),
      ),
    ),
  ).toBe(true);
});

it('replaces or disables each legacy volume binding rather than adding a second handler, releasing its Shift wildcard', () => {
  const event = (key, shiftKey = false) => ({
    key,
    shiftKey,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  });
  for (const [command, key] of [
    ['player.volume-up', 'ArrowUp'],
    ['player.volume-down', 'ArrowDown'],
    ['player.mute', 'm'],
  ]) {
    const configuration = structuredClone(defaultShortcutConfiguration());
    const row = configuration.bindings.find((b) => b.command === command);
    expect(
      resolveKeyboardBinding(
        event(key, true),
        createKeyboardBindings({ shortcutConfiguration: configuration }),
      )?.id,
    ).toBe(command);
    row.app = { mode: 'disabled' };
    expect(
      resolveKeyboardBinding(
        event(key),
        createKeyboardBindings({ shortcutConfiguration: configuration }),
      ),
    ).toBeNull();
    expect(
      resolveKeyboardBinding(
        event(key, true),
        createKeyboardBindings({ shortcutConfiguration: configuration }),
      ),
    ).toBeNull();
    row.app = {
      mode: 'custom',
      chord: { key: 'j', ctrl: false, alt: false, shift: false },
    };
    const bindings = createKeyboardBindings({
      shortcutConfiguration: configuration,
    });
    expect(bindings.filter((b) => b.id === command)).toHaveLength(1);
    expect(resolveKeyboardBinding(event(key), bindings)).toBeNull();
    expect(resolveKeyboardBinding(event('j'), bindings)?.id).toBe(command);
    expect(resolveKeyboardBinding(event('j', true), bindings)).toBeNull();
  }
});
