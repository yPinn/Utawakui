import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKeyboardShortcutSettingsStore } from './keyboardShortcutSettings.js';
import { defaultShortcutConfiguration } from '../../shared/keyboardShortcutContract.mjs';

const tempRoot = path.resolve('.tmp');
const directories = [];
function setup() {
  fs.mkdirSync(tempRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(tempRoot, 'shortcut-settings-'));
  directories.push(directory);
  return {
    directory,
    file: path.join(directory, 'keyboard-shortcuts.json'),
    store: createKeyboardShortcutSettingsStore({
      userDataDirectory: directory,
    }),
  };
}
const config = () => ({
  ...defaultShortcutConfiguration(),
  bindings: defaultShortcutConfiguration().bindings.map((b) =>
    b.command === 'player.play-pause'
      ? {
          ...b,
          app: {
            mode: 'custom',
            chord: { key: 'j', ctrl: true, alt: false, shift: false },
          },
        }
      : b,
  ),
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    if (!directory.startsWith(tempRoot + path.sep))
      throw Error('Unexpected test directory');
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('machine shortcut settings persistence', () => {
  it('reads missing defaults without writing, then persists across new owners with a CAS revision', () => {
    const f = setup(),
      initial = f.store.get();
    expect(initial).toEqual({
      status: 'ready',
      revision: null,
      configuration: defaultShortcutConfiguration(),
    });
    expect(fs.existsSync(f.file)).toBe(false);
    const saved = f.store.set({
      expectedRevision: null,
      configuration: config(),
    });
    expect(saved.status).toBe('ready');
    expect(saved.revision).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      createKeyboardShortcutSettingsStore({
        userDataDirectory: f.directory,
      }).get(),
    ).toEqual(saved);
  });
  it('rejects stale writers and A-B-A revisions without altering the committed bytes', () => {
    const f = setup(),
      first = f.store.set({ expectedRevision: null, configuration: config() });
    const second = f.store.set({
      expectedRevision: first.revision,
      configuration: defaultShortcutConfiguration(),
    });
    const third = f.store.set({
      expectedRevision: second.revision,
      configuration: config(),
    });
    expect(third.revision).not.toBe(first.revision);
    const bytes = fs.readFileSync(f.file);
    expect(
      f.store.set({
        expectedRevision: first.revision,
        configuration: defaultShortcutConfiguration(),
      }),
    ).toEqual({ status: 'conflict' });
    expect(fs.readFileSync(f.file)).toEqual(bytes);
  });
  it.each(['bad-json', 'future', 'oversized', 'invalid-config', 'global'])(
    'preserves %s bytes and refuses edits',
    (kind) => {
      const f = setup();
      const saved = f.store.set({
        expectedRevision: null,
        configuration: config(),
      });
      const disk = JSON.parse(fs.readFileSync(f.file, 'utf8'));
      let text = JSON.stringify(disk);
      if (kind === 'bad-json') text = '{private';
      if (kind === 'future')
        text = JSON.stringify({ ...disk, schemaVersion: 100 });
      if (kind === 'oversized') text = ' '.repeat(17000);
      if (kind === 'invalid-config')
        text = JSON.stringify({ ...disk, configuration: { schemaVersion: 1 } });
      if (kind === 'global')
        text = JSON.stringify({
          ...disk,
          configuration: { ...disk.configuration, globalEnabled: true },
        });
      fs.writeFileSync(f.file, text);
      const bytes = fs.readFileSync(f.file);
      expect(['invalid', 'unsupported']).toContain(f.store.get().status);
      expect(['invalid', 'unsupported']).toContain(
        f.store.set({
          expectedRevision: saved.revision,
          configuration: config(),
        }).status,
      );
      expect(fs.readFileSync(f.file)).toEqual(bytes);
    },
  );
  it('rejects unsupported commands, fields, global activation and fixed/wildcard conflicts before writing', () => {
    const f = setup();
    const collision = config();
    collision.bindings[0].app.chord.key = 'M';
    collision.bindings[0].app.chord.ctrl = false;
    collision.bindings[0].app.chord.shift = true;
    for (const input of [
      { expectedRevision: null, configuration: collision },
      {
        expectedRevision: null,
        configuration: { ...config(), globalEnabled: true },
      },
      { expectedRevision: null, configuration: config(), path: 'private' },
      { expectedRevision: 'arbitrary', configuration: config() },
      { expectedRevision: null, configuration: { schemaVersion: 2 } },
    ])
      expect(f.store.set(input).status).toBe('invalid-intent');
    expect(fs.readdirSync(f.directory)).toEqual([]);
  });
  it('preserves the old file on rename failure and removes only its own staging files', () => {
    const f = setup(),
      saved = f.store.set({ expectedRevision: null, configuration: config() }),
      bytes = fs.readFileSync(f.file);
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(Error('private'), { code: 'EPERM' });
    });
    expect(() =>
      f.store.set({
        expectedRevision: saved.revision,
        configuration: defaultShortcutConfiguration(),
      }),
    ).toThrow('private');
    expect(fs.readFileSync(f.file)).toEqual(bytes);
    expect(fs.readdirSync(f.directory)).toEqual(['keyboard-shortcuts.json']);
  });
  it('refuses a redirected or non-file target without following or replacing it', () => {
    const f = setup();
    fs.mkdirSync(f.file);
    expect(f.store.get().status).toBe('invalid');
    expect(
      f.store.set({ expectedRevision: null, configuration: config() }).status,
    ).toBe('invalid');
    vi.spyOn(fs, 'lstatSync').mockReturnValue({
      isSymbolicLink: () => true,
      isFile: () => true,
      size: 10,
    });
    expect(f.store.get().status).toBe('invalid');
  });
});
