import { describe, expect, it } from 'vitest';
import {
  SHORTCUT_COMMANDS,
  defaultShortcutConfiguration,
  normalizeShortcutChord,
  normalizeShortcutConfiguration,
  validateShortcutConfiguration,
  shortcutChordFromEvent,
  shortcutChordsOverlap,
} from './keyboardShortcutContract.mjs';
const chord = (key, extra = {}) => ({
  key,
  ctrl: false,
  alt: false,
  shift: false,
  ...extra,
});
const config = (bindings = [], extra = {}) => ({
  schemaVersion: 1,
  globalEnabled: false,
  bindings,
  ...extra,
});
const row = (command, app, global = null) => ({ command, app, global });
const custom = (value) => ({ mode: 'custom', chord: value });

describe('bounded shortcut configuration', () => {
  it('extends the original seven commands with three master-volume commands without assigning new transport keys', () => {
    expect(SHORTCUT_COMMANDS.map((c) => c.id)).toEqual([
      'player.play-pause',
      'player.previous',
      'player.next',
      'player.transpose-up',
      'player.transpose-down',
      'lyrics.offset-up',
      'lyrics.offset-down',
      'player.volume-up',
      'player.volume-down',
      'player.mute',
    ]);
    const result = defaultShortcutConfiguration();
    expect(result.globalEnabled).toBe(false);
    expect(result.bindings).toHaveLength(10);
    expect(
      result.bindings.every(
        (r) => r.app.mode === 'default' && r.global === null,
      ),
    ).toBe(true);
    expect(
      SHORTCUT_COMMANDS.filter((c) => c.defaultApp).map(
        (c) => c.defaultApp.key,
      ),
    ).toEqual(['arrowup', 'arrowdown', 'arrowup', 'arrowdown', 'm']);
  });
  it('reads an old seven-row configuration without rewriting it or changing its effective defaults', () => {
    const input = config(
      SHORTCUT_COMMANDS.slice(0, 7).map(({ id }) =>
        row(id, { mode: 'default' }),
      ),
    );
    const before = JSON.stringify(input);
    const output = normalizeShortcutConfiguration(input);
    expect(output.bindings).toHaveLength(10);
    expect(
      output.bindings
        .slice(7)
        .every(({ app, global }) => app.mode === 'default' && global === null),
    ).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('reserves both Shift states of legacy volume and mute until the owning command is disabled or replaced', () => {
    for (const key of ['m', 'arrowup', 'arrowdown']) {
      const command =
        key === 'm'
          ? 'player.mute'
          : key === 'arrowup'
            ? 'player.volume-up'
            : 'player.volume-down';
      const claim = row(
        'player.play-pause',
        custom(chord(key, { shift: true })),
      );
      expect(() => validateShortcutConfiguration(config([claim]))).toThrow(
        'Shortcut conflict',
      );
      expect(() =>
        validateShortcutConfiguration(
          config([claim, row(command, { mode: 'disabled' })]),
        ),
      ).not.toThrow();
      expect(() =>
        validateShortcutConfiguration(
          config([claim, row(command, custom(chord('j', { alt: true })))]),
        ),
      ).not.toThrow();
    }
  });
  it('normalizes logical aliases and requires every modifier explicitly', () => {
    expect(normalizeShortcutChord(chord('UP', { ctrl: true }))).toEqual(
      chord('arrowup', { ctrl: true }),
    );
    expect(normalizeShortcutChord(chord('Spacebar'))).toEqual(chord('space'));
    expect(
      normalizeShortcutChord(chord('J', { ctrl: true, shift: true })),
    ).toEqual(chord('j', { ctrl: true, shift: true }));
    expect(() => normalizeShortcutChord({ key: 'j', ctrl: true })).toThrow();
    expect(() => normalizeShortcutChord(chord('j', { shift: null }))).toThrow();
    expect(() => normalizeShortcutChord(chord('j', { meta: true }))).toThrow();
  });
  it.each([
    'Ctrl+J',
    'F1',
    'F4',
    'F8',
    'F9',
    'Enter',
    'Tab',
    'Escape',
    'Dead',
    'Process',
    'Unidentified',
    'é',
    'K',
    'Numpad1',
    'MediaPlayPause',
  ])('rejects unsupported or reserved key %s', (key) => {
    expect(() => normalizeShortcutChord(chord(key))).toThrow();
  });
  it.each([
    chord('c', { ctrl: true }),
    chord('z', { ctrl: true, shift: true }),
    chord('space', { alt: true }),
    chord('j', { ctrl: true, alt: true }),
  ])('rejects system/editing/AltGr-related chord %j', (value) =>
    expect(() => normalizeShortcutChord(value)).toThrow(),
  );
  it('requires Ctrl or Alt globally, while App Space is only an explicit custom assignment', () => {
    expect(() =>
      normalizeShortcutChord(chord('j', { shift: true }), 'global'),
    ).toThrow();
    expect(normalizeShortcutChord(chord('j', { alt: true }), 'global')).toEqual(
      chord('j', { alt: true }),
    );
    const result = normalizeShortcutConfiguration(
      config([row('player.play-pause', custom(chord(' ')))]),
    );
    expect(result.bindings[0].app).toEqual(custom(chord('space')));
  });
  it.each([
    { schemaVersion: 2, globalEnabled: false, bindings: [] },
    config([], { path: 'private' }),
    config([], { globalEnabled: 'true' }),
    config([row('arbitrary-ipc', { mode: 'default' })]),
    config([
      row('player.next', { mode: 'default' }),
      row('player.next', { mode: 'disabled' }),
    ]),
    config(
      Array.from({ length: 8 }, () => row('player.next', { mode: 'default' })),
    ),
    config([row('player.next', { mode: 'default', chord: chord('j') })]),
    config([
      {
        command: 'player.next',
        app: { mode: 'default' },
        global: null,
        url: 'private',
      },
    ]),
  ])('rejects unknown, duplicate or excessive configuration %j', (value) =>
    expect(() => normalizeShortcutConfiguration(value)).toThrow(),
  );
  it('copies and freezes a validated configuration without mutating input or reusing caller objects', () => {
    const input = config([
        row('player.next', custom(chord('j', { ctrl: true }))),
      ]),
      before = JSON.stringify(input);
    const result = normalizeShortcutConfiguration(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.bindings[2].app.chord).not.toBe(input.bindings[0].app.chord);
    expect(Object.isFrozen(result.bindings[2].app.chord)).toBe(true);
    expect(Object.isFrozen(result.bindings)).toBe(true);
  });
  it('supports only the declared logical key subset in both scopes', () => {
    for (const key of [
      'a',
      '1',
      'home',
      'end',
      'pageup',
      'pagedown',
      'left',
      'right',
      'F10',
      'F11',
      'F12',
    ]) {
      expect(normalizeShortcutChord(chord(key)).key).toBeTruthy();
      expect(
        normalizeShortcutChord(chord(key, { alt: true }), 'global').alt,
      ).toBe(true);
    }
    expect(() => normalizeShortcutChord(chord('j'), 'arbitrary')).toThrow();
    for (const value of [
      null,
      [],
      {},
      'Ctrl+J',
      chord('x'.repeat(100)),
      chord(1),
      chord('j', { ctrl: 1 }),
    ])
      expect(() => normalizeShortcutChord(value)).toThrow();
  });
});

describe('same/cross-scope and wildcard conflicts', () => {
  it('rejects duplicate App or global mappings and cross-scope different commands even while global is off', () => {
    const j = chord('j', { ctrl: true });
    expect(() =>
      validateShortcutConfiguration(
        config([
          row('player.next', custom(j)),
          row('player.previous', custom(j)),
        ]),
      ),
    ).toThrow('conflict');
    expect(() =>
      validateShortcutConfiguration(
        config([
          row('player.next', { mode: 'default' }, j),
          row('player.previous', { mode: 'default' }, j),
        ]),
      ),
    ).toThrow('conflict');
    expect(() =>
      validateShortcutConfiguration(
        config([
          row('player.next', custom(j)),
          row('player.previous', { mode: 'default' }, j),
        ]),
      ),
    ).toThrow('conflict');
    expect(
      validateShortcutConfiguration(config([row('player.next', custom(j), j)]))
        .bindings[2].global,
    ).toEqual(j);
  });
  it('detects legacy Shift wildcards and preserves fixed bindings while permitting a command to replace its own original key', () => {
    const reserved = [
      { id: 'player.mute', ...chord('m'), shift: null },
      { id: 'player.transpose-up', ...chord('arrowup', { ctrl: true }) },
    ];
    for (const shift of [false, true])
      expect(() =>
        validateShortcutConfiguration(
          config([row('player.next', custom(chord('m', { shift })))]),
          reserved,
        ),
      ).toThrow('conflict');
    expect(
      validateShortcutConfiguration(config(), reserved).bindings,
    ).toHaveLength(10);
    expect(() =>
      validateShortcutConfiguration(
        config([row('player.next', custom(chord('up', { ctrl: true })))]),
        reserved,
      ),
    ).toThrow('conflict');
    expect(
      validateShortcutConfiguration(
        config([
          row('player.transpose-up', { mode: 'disabled' }),
          row('player.next', custom(chord('up', { ctrl: true }))),
        ]),
        reserved,
      ),
    ).toBeTruthy();
  });
  it('reports only bounded command identities for the conflicting pair', () => {
    try {
      validateShortcutConfiguration(
        config([row('player.next', custom(chord('m')))]),
        [{ id: 'player.mute', ...chord('m'), shift: null }],
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'shortcut-conflict',
        commands: ['player.next', 'player.mute'],
      });
      expect(Object.isFrozen(error.commands)).toBe(true);
    }
  });
  it('uses exact modifiers and a symmetric Shift overlap without treating Meta as a custom chord', () => {
    const a = chord('j', { ctrl: true });
    expect(shortcutChordsOverlap(a, { ...a, meta: true })).toBe(false);
    expect(shortcutChordsOverlap(a, { ...a, alt: true })).toBe(false);
    expect(shortcutChordsOverlap(a, { ...a, shift: true })).toBe(false);
    expect(shortcutChordsOverlap(a, { ...a, shift: null })).toBe(true);
    expect(shortcutChordsOverlap({ ...a, shift: null }, a)).toBe(true);
  });
});

it('records only complete supported keydown chords, respecting IME, AltGr, repeat, handled input and numpad exclusion', () => {
  const event = {
    key: 'J',
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  };
  expect(shortcutChordFromEvent(event)).toEqual(chord('j', { ctrl: true }));
  for (const change of [
    { key: 'Control' },
    { isComposing: true },
    { keyCode: 229 },
    { repeat: true },
    { defaultPrevented: true },
    { location: 3 },
    { type: 'keyup' },
    { metaKey: true },
    { getModifierState: () => true },
  ])
    expect(shortcutChordFromEvent({ ...event, ...change })).toBeNull();
  expect(shortcutChordFromEvent(null)).toBeNull();
});
