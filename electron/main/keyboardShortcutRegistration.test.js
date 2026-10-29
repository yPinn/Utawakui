import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createKeyboardShortcutSettingsStore } from '../lib/keyboardShortcutSettings.js';
import { defaultShortcutConfiguration } from '../../shared/keyboardShortcutContract.mjs';
import {
  createKeyboardShortcutRegistration,
  shortcutAccelerator,
} from './keyboardShortcutRegistration.js';

const directories = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const p of directories.splice(0))
    fs.rmSync(p, { recursive: true, force: true });
});
function configuration(entries = [], enabled = true) {
  const base = defaultShortcutConfiguration();
  return {
    ...base,
    globalEnabled: enabled,
    bindings: base.bindings.map((b) => ({
      ...b,
      global: entries.find(([id]) => id === b.command)?.[1] ?? null,
    })),
  };
}
const chord = (key) => ({ key, ctrl: true, alt: false, shift: true });
function fixture({
  eligible = ['player.play-pause', 'player.next'],
  existing = [],
} = {}) {
  fs.mkdirSync('.tmp', { recursive: true });
  const directory = fs.mkdtempSync(path.resolve('.tmp', 'global-shortcut-'));
  directories.push(directory);
  const registered = new Map(existing.map((k) => [k, vi.fn()]));
  const globalShortcut = {
    register: vi.fn((key, callback) => {
      if (registered.has(key)) return false;
      registered.set(key, callback);
      return true;
    }),
    isRegistered: vi.fn((key) => registered.has(key)),
    unregister: vi.fn((key) => registered.delete(key)),
  };
  const store = createKeyboardShortcutSettingsStore({
    userDataDirectory: directory,
    globalCommands: eligible,
  });
  const onCommand = vi.fn(),
    onError = vi.fn();
  const manager = createKeyboardShortcutRegistration({
    store,
    globalShortcut,
    eligibleCommands: eligible,
    onCommand,
    onError,
    capabilityReason: 'repeat-unverified',
  });
  const set = async (cfg, revision = store.get().revision) =>
    await manager.set({ expectedRevision: revision, configuration: cfg });
  const file = path.join(directory, 'keyboard-shortcuts.json');
  return {
    directory,
    file,
    registered,
    globalShortcut,
    store,
    manager,
    onCommand,
    onError,
    set,
  };
}
it('trial stages without dispatch or persistence and restores only the previous registrations', async () => {
  const f = fixture();
  await f.set(configuration([['player.play-pause', chord('j')]]));
  const bytes = fs.readFileSync(f.file);
  f.globalShortcut.register.mockImplementation((key, callback) => {
    f.registered.set(key, callback);
    callback();
    return true;
  });
  const reply = await f.manager.test({
    expectedRevision: f.store.get().revision,
    configuration: configuration([
      ['player.play-pause', chord('j')],
      ['player.next', chord('u')],
    ]),
  });
  expect(reply.status).toBe('tested');
  expect(reply.runtime).toMatchObject({
    busy: false,
    state: 'active',
    pending: [],
  });
  expect(reply.runtime.active.map((b) => b.command)).toEqual([
    'player.play-pause',
  ]);
  expect([...f.registered.keys()]).toEqual(['Control+Shift+J']);
  expect(fs.readFileSync(f.file)).toEqual(bytes);
  expect(f.onCommand).not.toHaveBeenCalled();
});
it('trial rechecks CAS after async acquisition, always cleans up, and apply rechecks occupancy', async () => {
  const f = fixture();
  const cfg = configuration([['player.next', chord('j')]]);
  const input = { expectedRevision: null, configuration: cfg };
  expect((await f.manager.test(input)).status).toBe('tested');
  f.globalShortcut.register.mockReturnValue(false);
  expect((await f.manager.set(input)).status).toBe('occupied');
  expect(fs.existsSync(f.file)).toBe(false);
  f.globalShortcut.register.mockImplementation((key, callback) => {
    f.registered.set(key, callback);
    f.store.set({
      expectedRevision: null,
      configuration: configuration([], false),
    });
    return true;
  });
  expect((await f.manager.test(input)).status).toBe('conflict');
  expect(f.registered.size).toBe(0);
});
it('closed gate refuses trial without touching OS and release failure cannot report tested', async () => {
  const closed = fixture({ eligible: [] });
  expect(
    (
      await closed.manager.test({
        expectedRevision: null,
        configuration: configuration([['player.next', chord('j')]]),
      })
    ).status,
  ).not.toBe('tested');
  expect(closed.globalShortcut.register).not.toHaveBeenCalled();
  const f = fixture();
  f.globalShortcut.unregister.mockImplementation(() => {});
  const result = await f.manager.test({
    expectedRevision: null,
    configuration: configuration([['player.next', chord('j')]]),
  });
  expect(result.status).toBe('degraded');
  expect(result.runtime.active).toEqual([]);
  expect(result.runtime.held).toHaveLength(1);
  expect(fs.existsSync(f.file)).toBe(false);
});
it('explicit disable stops dispatch even when saving fails, and reading cannot silently reactivate', async () => {
  const f = fixture();
  const cfg = configuration([['player.next', chord('j')]]);
  await f.set(cfg);
  const bytes = fs.readFileSync(f.file);
  vi.spyOn(f.store, 'set').mockImplementation(() => {
    throw Error('private disk');
  });
  await expect(f.set({ ...cfg, globalEnabled: false })).rejects.toThrow(
    'private disk',
  );
  expect(f.manager.snapshot()).toMatchObject({
    active: [],
    held: [],
    state: 'disabled',
  });
  expect(fs.readFileSync(f.file)).toEqual(bytes);
  await f.manager.get();
  expect(f.manager.snapshot().active).toEqual([]);
  expect(f.registered.size).toBe(0);
  vi.restoreAllMocks();
  const preserved = await f.set(cfg);
  expect(preserved.status).toBe('ready');
  expect(preserved.runtime).toMatchObject({
    active: [],
    sessionDisabled: true,
  });
  const enabled = await f.manager.enable({
    expectedRevision: f.store.get().revision,
    configuration: cfg,
  });
  expect(enabled.status).toBe('ready');
  expect(enabled.runtime).toMatchObject({
    state: 'active',
    sessionDisabled: false,
  });
});
it('stops on a valid disable even when CAS is stale, and never rewrites the newer file', async () => {
  const f = fixture();
  const cfg = configuration([['player.next', chord('j')]]);
  await f.set(cfg);
  const bytes = fs.readFileSync(f.file);
  expect((await f.set({ ...cfg, globalEnabled: false }, null)).status).toBe(
    'conflict',
  );
  expect(f.manager.snapshot()).toMatchObject({
    active: [],
    held: [],
    sessionDisabled: true,
  });
  expect(fs.readFileSync(f.file)).toEqual(bytes);
  await f.manager.get();
  expect(f.registered.size).toBe(0);
});
it('revokes a validated stop before prepare read IO, while malformed stops cannot touch registrations', async () => {
  const f = fixture();
  const cfg = configuration([['player.next', chord('j')]]);
  await f.set(cfg);
  const callback = f.registered.get('Control+Shift+J');
  vi.spyOn(f.store, 'prepare').mockImplementation(() => {
    throw Error('read EACCES');
  });
  expect(
    (
      await f.manager.set({
        expectedRevision: null,
        configuration: { globalEnabled: false },
      })
    ).status,
  ).toBe('invalid-intent');
  expect(f.manager.snapshot().active).toHaveLength(1);
  await expect(f.set({ ...cfg, globalEnabled: false })).rejects.toThrow(
    'read EACCES',
  );
  expect(f.manager.snapshot()).toMatchObject({
    active: [],
    held: [],
    sessionDisabled: true,
  });
  callback();
  expect(f.onCommand).not.toHaveBeenCalled();
});
it('keeps trial busy, cleans a late acquisition on suspend, and never persists or replays', async () => {
  const f = fixture();
  const pending = Promise.withResolvers();
  f.globalShortcut.register.mockImplementation(async (key, callback) => {
    await pending.promise;
    f.registered.set(key, callback);
    callback();
    return true;
  });
  const input = {
    expectedRevision: null,
    configuration: configuration([['player.next', chord('j')]]),
  };
  const testing = f.manager.test(input);
  await vi.waitFor(() => expect(f.globalShortcut.register).toHaveBeenCalled());
  expect((await f.manager.set(input)).status).toBe('busy');
  const suspending = f.manager.suspend();
  pending.resolve();
  expect((await testing).status).toBe('unavailable');
  await suspending;
  expect(f.manager.snapshot()).toMatchObject({
    state: 'suspended',
    active: [],
    held: [],
    pending: [],
    busy: false,
  });
  expect(f.onCommand).not.toHaveBeenCalled();
  expect(fs.existsSync(f.file)).toBe(false);
});
it('derives bounded accelerators and never accepts arbitrary accelerator strings', () => {
  expect(shortcutAccelerator(chord('arrowup'))).toBe('Control+Shift+Up');
  expect(shortcutAccelerator({ ...chord('f11'), ctrl: false, alt: true })).toBe(
    'Alt+Shift+F11',
  );
  expect(() =>
    shortcutAccelerator({
      key: 'Ctrl+X',
      ctrl: true,
      alt: false,
      shift: false,
    }),
  ).toThrow();
});
it('defaults closed, rejects global intent before OS work, and does not create a file on refresh', async () => {
  const f = fixture({ eligible: [] });
  await f.manager.refresh();
  expect(f.manager.snapshot()).toMatchObject({
    state: 'disabled',
    eligibleCommands: [],
    active: [],
    held: [],
  });
  expect(
    (await f.set(configuration([['player.play-pause', chord('j')]]))).status,
  ).toBe('invalid-intent');
  expect(f.globalShortcut.register).not.toHaveBeenCalled();
  expect(fs.existsSync(f.file)).toBe(false);
});
it('stages callbacks, commits only after persistence, and retains a registration for mapping swaps', async () => {
  const f = fixture();
  await f.manager.refresh();
  const register = f.globalShortcut.register.getMockImplementation();
  f.globalShortcut.register.mockImplementation((key, callback) => {
    callback();
    return register(key, callback);
  });
  const a = await f.set(configuration([['player.play-pause', chord('j')]]));
  expect(a.status).toBe('ready');
  expect(f.onCommand).not.toHaveBeenCalled();
  const callback = f.registered.get('Control+Shift+J');
  callback();
  expect(f.onCommand).toHaveBeenLastCalledWith(
    expect.objectContaining({
      command: 'player.play-pause',
      generation: expect.any(Number),
      sequence: 1,
    }),
  );
  const generation = f.manager.snapshot().generation;
  await f.set(configuration([['player.next', chord('j')]]));
  expect(f.globalShortcut.register).toHaveBeenCalledTimes(1);
  expect(f.globalShortcut.unregister).not.toHaveBeenCalled();
  callback();
  expect(f.onCommand).toHaveBeenLastCalledWith(
    expect.objectContaining({ command: 'player.next', sequence: 2 }),
  );
  expect(f.manager.snapshot().generation).toBeGreaterThan(generation);
});
it('preserves an internal foreign registration instead of taking or removing it', async () => {
  const f = fixture({ existing: ['Control+Shift+J'] });
  expect(
    (await f.set(configuration([['player.next', chord('j')]]))).status,
  ).toBe('occupied');
  expect(f.registered.has('Control+Shift+J')).toBe(true);
  expect(f.globalShortcut.unregister).not.toHaveBeenCalled();
  expect(fs.existsSync(f.file)).toBe(false);
});
it('rolls back only newly acquired keys when a later external key is occupied', async () => {
  const f = fixture();
  const old = await f.set(configuration([['player.play-pause', chord('j')]]));
  const bytes = fs.readFileSync(f.file);
  const callback = f.registered.get('Control+Shift+J');
  f.globalShortcut.register.mockImplementation((key, cb) => {
    if (key === 'Control+Shift+B') return false;
    f.registered.set(key, cb);
    return true;
  });
  expect(
    (
      await f.set(
        configuration([
          ['player.play-pause', chord('k')],
          ['player.next', chord('b')],
        ]),
        old.revision,
      )
    ).status,
  ).toBe('occupied');
  expect([...f.registered.keys()]).toEqual(['Control+Shift+J']);
  expect(fs.readFileSync(f.file)).toEqual(bytes);
  callback();
  expect(f.onCommand).toHaveBeenCalledTimes(1);
});
it('rechecks CAS after staging and cleans new keys if another writer changed the file', async () => {
  const f = fixture();
  const old = await f.set(configuration([['player.play-pause', chord('j')]]));
  const register = f.globalShortcut.register.getMockImplementation();
  let newer;
  f.globalShortcut.register.mockImplementation((key, cb) => {
    newer = f.store.set({
      expectedRevision: old.revision,
      configuration: configuration([], false),
    });
    return register(key, cb);
  });
  expect(
    (await f.set(configuration([['player.next', chord('k')]]), old.revision))
      .status,
  ).toBe('conflict');
  expect(f.store.get().revision).toBe(newer.revision);
  expect(f.registered.has('Control+Shift+K')).toBe(false);
});
it('restores original mapping and bytes after pre-commit IO failure', async () => {
  const f = fixture();
  await f.set(configuration([['player.play-pause', chord('j')]]));
  const before = fs.readFileSync(f.file);
  const rename = fs.renameSync.bind(fs);
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (to === f.file) throw Error('private/path');
    return rename(from, to);
  });
  await expect(
    f.set(configuration([['player.next', chord('k')]])),
  ).rejects.toThrow('private/path');
  expect(fs.readFileSync(f.file)).toEqual(before);
  expect([...f.registered.keys()]).toEqual(['Control+Shift+J']);
});
it('reports a committed save separately from release failure and stops dispatch without unbounded registrations', async () => {
  const f = fixture();
  await f.set(configuration([['player.play-pause', chord('j')]]));
  const old = f.registered.get('Control+Shift+J');
  f.globalShortcut.unregister.mockImplementation(() => {});
  const saved = await f.set(configuration([['player.next', chord('k')]]));
  expect(saved.status).toBe('ready');
  expect(f.manager.snapshot()).toMatchObject({ state: 'degraded', active: [] });
  expect(f.manager.snapshot().held).toHaveLength(2);
  old();
  f.registered.get('Control+Shift+K')();
  expect(f.onCommand).not.toHaveBeenCalled();
  const calls = f.globalShortcut.register.mock.calls.length;
  expect(
    (await f.set(configuration([['player.next', chord('m')]]))).status,
  ).toBe('degraded');
  expect(f.globalShortcut.register).toHaveBeenCalledTimes(calls);
  f.globalShortcut.unregister.mockImplementation((k) => f.registered.delete(k));
  await f.manager.refresh();
  expect(f.manager.snapshot().state).toBe('active');
});
it('blocks startup registration failure without changing saved desired configuration', async () => {
  const f = fixture();
  f.store.set({
    expectedRevision: null,
    configuration: configuration([['player.next', chord('k')]]),
  });
  const bytes = fs.readFileSync(f.file);
  f.globalShortcut.register.mockReturnValue(false);
  await f.manager.refresh();
  expect(f.manager.snapshot()).toMatchObject({
    state: 'blocked',
    active: [],
    issues: [{ code: 'occupied', command: 'player.next' }],
  });
  expect(fs.readFileSync(f.file)).toEqual(bytes);
});
it('revokes old callbacks on disable, suspend, resume and dispose, leaving foreign keys alone', async () => {
  const f = fixture({ existing: ['Alt+F12'] });
  await f.set(configuration([['player.play-pause', chord('j')]]));
  const old = f.registered.get('Control+Shift+J');
  await f.set(configuration([], false));
  old();
  expect(f.onCommand).not.toHaveBeenCalled();
  await f.set(configuration([['player.next', chord('k')]]));
  const stale = f.registered.get('Control+Shift+K');
  await f.manager.suspend();
  stale();
  expect(f.manager.snapshot().state).toBe('suspended');
  await f.manager.refresh();
  stale();
  expect(f.onCommand).not.toHaveBeenCalled();
  await f.manager.dispose();
  await f.manager.dispose();
  expect(f.manager.snapshot().state).toBe('disposed');
  expect([...f.registered.keys()]).toEqual(['Alt+F12']);
  expect((await f.manager.set({})).status).toBe('unavailable');
});
it('rejects invalid intents and stale revisions without registering, even with a corrupt saved file', async () => {
  const f = fixture();
  expect((await f.manager.set({ path: 'private' })).status).toBe(
    'invalid-intent',
  );
  await f.set(configuration([], false));
  f.globalShortcut.register.mockClear();
  expect(
    (await f.set(configuration([['player.next', chord('k')]]), null)).status,
  ).toBe('conflict');
  fs.writeFileSync(f.file, '{broken');
  expect((await f.set(configuration([], false), null)).status).toBe('invalid');
  expect(f.globalShortcut.register).not.toHaveBeenCalled();
});
it('does not confuse registration exceptions with external occupancy', async () => {
  const f = fixture();
  f.globalShortcut.register.mockImplementation(() => {
    throw Error('private register context');
  });
  expect(
    (await f.set(configuration([['player.next', chord('k')]]))).status,
  ).toBe('unavailable');
  expect(f.onError).toHaveBeenCalledWith(expect.any(Error), 'register');
  expect(f.registered.size).toBe(0);
  expect(JSON.stringify(f.manager.snapshot())).not.toContain('private');
});
it('tracks successful registration before a failed ownership confirmation so cleanup can release it', async () => {
  const f = fixture();
  let calls = 0;
  f.globalShortcut.isRegistered.mockImplementation((key) => {
    if (++calls === 2) throw Error('confirmation failed');
    return f.registered.has(key);
  });
  expect(
    (await f.set(configuration([['player.next', chord('k')]]))).status,
  ).toBe('unavailable');
  expect(f.registered.size).toBe(0);
  expect(f.manager.snapshot().held).toEqual([]);
  expect(fs.existsSync(f.file)).toBe(false);
});
it('rejects reentrant reads and writes without adding duplicate registrations', async () => {
  const f = fixture();
  const register = f.globalShortcut.register.getMockImplementation();
  f.globalShortcut.register.mockImplementation(async (key, callback) => {
    expect((await f.manager.set({})).status).toBe('busy');
    expect((await f.manager.get()).status).toBe('busy');
    await f.manager.refresh();
    return register(key, callback);
  });
  expect(
    (await f.set(configuration([['player.next', chord('k')]]))).status,
  ).toBe('ready');
  expect(f.globalShortcut.register).toHaveBeenCalledTimes(1);
});
it('stops dispatch when rollback cannot release a staged key, then repairs only on explicit refresh', async () => {
  const f = fixture();
  await f.set(configuration([['player.play-pause', chord('j')]]));
  const bytes = fs.readFileSync(f.file),
    old = f.registered.get('Control+Shift+J');
  f.globalShortcut.register.mockImplementation((key, callback) => {
    if (key === 'Control+Shift+B') return false;
    f.registered.set(key, callback);
    return true;
  });
  f.globalShortcut.unregister.mockImplementation(() => {
    throw Error('private cleanup context');
  });
  expect(
    (
      await f.set(
        configuration([
          ['player.play-pause', chord('k')],
          ['player.next', chord('b')],
        ]),
      )
    ).status,
  ).toBe('degraded');
  expect(f.manager.snapshot()).toMatchObject({ state: 'degraded', active: [] });
  expect(fs.readFileSync(f.file)).toEqual(bytes);
  old();
  expect(f.onCommand).not.toHaveBeenCalled();
  const calls = f.globalShortcut.register.mock.calls.length;
  await f.manager.refresh();
  expect(f.globalShortcut.register).toHaveBeenCalledTimes(calls);
  f.globalShortcut.unregister.mockImplementation((key) =>
    f.registered.delete(key),
  );
  await f.manager.refresh();
  expect(f.manager.snapshot().state).toBe('active');
});
it('reconciles an explicitly reread disk configuration and invalidates callbacks after read failure', async () => {
  const f = fixture();
  const saved = await f.set(configuration([['player.play-pause', chord('j')]]));
  const old = f.registered.get('Control+Shift+J');
  f.store.set({
    expectedRevision: saved.revision,
    configuration: configuration([], false),
  });
  expect(await f.manager.get()).toMatchObject({
    status: 'ready',
    runtime: { state: 'disabled', active: [] },
  });
  old();
  expect(f.onCommand).not.toHaveBeenCalled();
  await f.set(configuration([['player.next', chord('k')]]));
  vi.spyOn(f.store, 'get').mockImplementation(() => {
    throw Error('private read context');
  });
  expect(await f.manager.get()).toMatchObject({
    status: 'unavailable',
    runtime: { state: 'blocked', active: [], held: [] },
  });
  expect(f.onError).toHaveBeenCalledWith(expect.any(Error), 'refresh');
});
it('validates capability on disabled desired mappings and requires an explicit receiver for eligible commands', async () => {
  const f = fixture();
  expect(() =>
    createKeyboardShortcutRegistration({
      store: f.store,
      globalShortcut: f.globalShortcut,
      eligibleCommands: ['player.next'],
    }),
  ).toThrow('receiver');
  const closed = createKeyboardShortcutRegistration({
    store: f.store,
    globalShortcut: f.globalShortcut,
  });
  expect(
    (
      await closed.set({
        expectedRevision: null,
        configuration: configuration([['player.next', chord('k')]], false),
      })
    ).status,
  ).toBe('unsupported');
  f.store.set({
    expectedRevision: null,
    configuration: configuration([['player.next', chord('k')]]),
  });
  expect((await closed.refresh()).state).toBe('blocked');
  expect(f.globalShortcut.register).not.toHaveBeenCalled();
});
it('does not leak dispatch or diagnostics exceptions from an OS callback', async () => {
  const f = fixture();
  await f.set(configuration([['player.next', chord('k')]]));
  f.onCommand.mockImplementation(() => {
    throw Error('private dispatch context');
  });
  f.onError.mockImplementation(() => {
    throw Error('diagnostics failed');
  });
  expect(() => f.registered.get('Control+Shift+K')()).not.toThrow();
  expect(f.onError).toHaveBeenCalledWith(expect.any(Error), 'dispatch');
});
it('revalidates retained registration records and blocks dispatch if ownership was lost', async () => {
  const f = fixture();
  await f.set(configuration([['player.next', chord('k')]]));
  const old = f.registered.get('Control+Shift+K'),
    bytes = fs.readFileSync(f.file);
  f.registered.delete('Control+Shift+K');
  expect(
    (await f.set(configuration([['player.next', chord('k')]]))).status,
  ).toBe('unavailable');
  expect(f.manager.snapshot()).toMatchObject({
    state: 'blocked',
    active: [],
    held: [],
    issues: [{ code: 'registration-lost', command: 'player.next' }],
  });
  expect(fs.readFileSync(f.file)).toEqual(bytes);
  old();
  expect(f.onCommand).not.toHaveBeenCalled();
  await f.manager.refresh();
  expect(f.manager.snapshot().state).toBe('active');
  old();
  expect(f.onCommand).not.toHaveBeenCalled();
});
it('fails closed if retained ownership cannot be confirmed, without rewriting or losing the cleanup record', async () => {
  const f = fixture();
  await f.set(configuration([['player.next', chord('k')]]));
  const bytes = fs.readFileSync(f.file);
  f.globalShortcut.isRegistered.mockImplementation(() => {
    throw Error('private confirm context');
  });
  expect(
    (await f.set(configuration([['player.next', chord('k')]]))).status,
  ).toBe('unavailable');
  expect(f.manager.snapshot()).toMatchObject({ state: 'blocked', active: [] });
  expect(f.manager.snapshot().held).toHaveLength(1);
  expect(fs.readFileSync(f.file)).toEqual(bytes);
});

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
it('rearms a receiver with a new native epoch while retaining registrations and saved bytes', async () => {
  const f = fixture();
  f.globalShortcut.activate = vi.fn(async () => true);
  await f.set(configuration([['player.next', chord('k')]]));
  const bytes = fs.readFileSync(f.file),
    generation = f.manager.snapshot().generation;
  expect(await f.manager.rearm(generation - 1)).toBeNull();
  const armed = await f.manager.rearm(generation);
  expect(armed.generation).toBeGreaterThan(generation);
  expect(armed.busy).toBe(false);
  expect(fs.readFileSync(f.file)).toEqual(bytes);
  expect(f.globalShortcut.register).toHaveBeenCalledTimes(1);
  expect(f.globalShortcut.unregister).not.toHaveBeenCalled();
});
it('treats a native held-key refusal as expected without claiming or diagnosing a registration', async () => {
  const f = fixture();
  f.globalShortcut.register.mockRejectedValue(
    Object.assign(Error('held'), { code: 'KEYBOARD_SHORTCUT_KEYS_HELD' }),
  );
  expect(
    await f.set(configuration([['player.next', chord('k')]])),
  ).toMatchObject({ status: 'keys-held' });
  expect(f.onError).not.toHaveBeenCalled();
  expect(f.manager.snapshot().held).toEqual([]);
  expect(f.globalShortcut.unregister).not.toHaveBeenCalled();
});
it('waits for backend registration ACK, holds busy, suppresses staged callbacks and rechecks CAS', async () => {
  const f = fixture(),
    ack = deferred();
  f.globalShortcut.register.mockImplementation(async (key, callback) => {
    f.registered.set(key, callback);
    callback();
    await ack.promise;
    return true;
  });
  const pending = f.set(configuration([['player.next', chord('k')]]));
  await vi.waitFor(() =>
    expect(f.globalShortcut.register).toHaveBeenCalledTimes(1),
  );
  expect(f.manager.snapshot()).toMatchObject({
    busy: true,
    pending: [{ command: 'player.next' }],
    held: [],
  });
  expect(fs.existsSync(f.file)).toBe(false);
  expect(await f.manager.get()).toMatchObject({ status: 'busy' });
  expect(await f.set(configuration([], false))).toMatchObject({
    status: 'busy',
  });
  const external = f.store.set({
    expectedRevision: null,
    configuration: configuration([], false),
  });
  ack.resolve();
  expect(await pending).toMatchObject({ status: 'conflict' });
  expect(f.store.get().revision).toBe(external.revision);
  expect(f.registered.size).toBe(0);
  expect(f.onCommand).not.toHaveBeenCalled();
});
it('revokes immediately on suspend while a registration ACK is pending and releases its late acquisition', async () => {
  const f = fixture(),
    ack = deferred();
  f.globalShortcut.register.mockImplementation(async (key, callback) => {
    await ack.promise;
    f.registered.set(key, callback);
    return true;
  });
  const pending = f.set(configuration([['player.next', chord('k')]]));
  await vi.waitFor(() => expect(f.globalShortcut.register).toHaveBeenCalled());
  const stopped = f.manager.suspend();
  expect(f.manager.snapshot().state).toBe('suspended');
  ack.resolve();
  expect(await pending).toMatchObject({ status: 'unavailable' });
  await stopped;
  expect(f.manager.snapshot()).toMatchObject({
    state: 'suspended',
    held: [],
    active: [],
  });
  expect(fs.existsSync(f.file)).toBe(false);
  expect(f.registered.size).toBe(0);
});
it('fences delayed old notifications across a retained registration mapping change', async () => {
  const f = fixture();
  f.globalShortcut.activate = vi.fn(async () => true);
  await f.set(configuration([['player.play-pause', chord('j')]]));
  const callback = f.registered.get('Control+Shift+J');
  const oldGeneration = f.manager.snapshot().generation;
  const registrationToken = f.globalShortcut.register.mock.calls[0][2];
  callback({ generation: oldGeneration, registrationToken });
  expect(f.onCommand).toHaveBeenCalledTimes(1);
  await f.set(configuration([['player.next', chord('j')]]));
  callback({ generation: oldGeneration, registrationToken });
  callback();
  expect(f.onCommand).toHaveBeenCalledTimes(1);
  callback({ generation: f.manager.snapshot().generation, registrationToken });
  expect(f.onCommand).toHaveBeenLastCalledWith(
    expect.objectContaining({ command: 'player.next', sequence: 2 }),
  );
  expect(f.globalShortcut.register).toHaveBeenCalledTimes(1);
  expect(f.globalShortcut.unregister).not.toHaveBeenCalled();
});
it('keeps a committed save distinct from an activation failure', async () => {
  const f = fixture();
  f.globalShortcut.activate = vi.fn(async () => {
    throw Error('private activation failure');
  });
  const result = await f.set(configuration([['player.next', chord('k')]]));
  expect(result.status).toBe('ready');
  expect(f.store.get().revision).toBe(result.revision);
  expect(f.manager.snapshot()).toMatchObject({ state: 'degraded', active: [] });
  f.registered.get('Control+Shift+K')?.({
    generation: f.manager.snapshot().generation,
  });
  expect(f.onCommand).not.toHaveBeenCalled();
  expect(f.onError).toHaveBeenCalledWith(expect.any(Error), 'activate');
});

it('cleans a late register ACK after dispose and never overwrites disposed state', async () => {
  const f = fixture(),
    ack = deferred();
  const register = f.globalShortcut.register.getMockImplementation();
  f.globalShortcut.register.mockImplementation(async (...args) => {
    await ack.promise;
    return register(...args);
  });
  const pending = f.set(configuration([['player.next', chord('k')]]));
  await vi.waitFor(() => expect(f.globalShortcut.register).toHaveBeenCalled());
  const stopped = f.manager.dispose();
  expect(f.manager.snapshot()).toMatchObject({ state: 'disposed', active: [] });
  ack.resolve();
  expect(await pending).toMatchObject({ status: 'unavailable' });
  await stopped;
  expect(f.registered.size).toBe(0);
  expect(f.manager.snapshot()).toMatchObject({
    state: 'disposed',
    busy: false,
    pending: [],
    held: [],
  });
  expect(fs.existsSync(f.file)).toBe(false);
});
it('suspend during retained ownership confirmation prevents saving and restores only on explicit refresh', async () => {
  const f = fixture(),
    ack = deferred();
  await f.set(configuration([['player.play-pause', chord('j')]]));
  const bytes = fs.readFileSync(f.file),
    stale = f.registered.get('Control+Shift+J');
  f.globalShortcut.isRegistered.mockImplementationOnce(async () => {
    await ack.promise;
    return true;
  });
  const pending = f.set(configuration([['player.next', chord('j')]]));
  const stopped = f.manager.suspend();
  stale();
  ack.resolve();
  await pending;
  await stopped;
  expect(fs.readFileSync(f.file)).toEqual(bytes);
  expect(f.onCommand).not.toHaveBeenCalled();
  expect(f.manager.snapshot()).toMatchObject({ state: 'suspended', held: [] });
  await f.manager.refresh();
  expect(f.manager.snapshot()).toMatchObject({
    state: 'active',
    active: [{ command: 'player.play-pause' }],
  });
});
it('retains a completed save when suspend interrupts activation and cleans after its ACK', async () => {
  const f = fixture(),
    ack = deferred();
  f.globalShortcut.activate = vi.fn(async () => {
    await ack.promise;
    return true;
  });
  const pending = f.set(configuration([['player.next', chord('k')]]));
  await vi.waitFor(() => expect(f.globalShortcut.activate).toHaveBeenCalled());
  const revision = f.store.get().revision;
  expect(revision).not.toBeNull();
  const stopped = f.manager.suspend();
  ack.resolve();
  expect(await pending).toMatchObject({
    status: 'ready',
    revision,
    runtime: { state: 'suspended', active: [] },
  });
  await stopped;
  expect(f.manager.snapshot()).toMatchObject({ state: 'suspended', held: [] });
  expect(f.store.get().revision).toBe(revision);
});
it('keeps busy through asynchronous old-key release and reports release failure after saving', async () => {
  const f = fixture(),
    ack = deferred();
  await f.set(configuration([['player.play-pause', chord('j')]]));
  f.globalShortcut.unregister.mockImplementationOnce(async () => {
    await ack.promise;
  });
  const pending = f.set(configuration([['player.next', chord('k')]]));
  await vi.waitFor(() =>
    expect(f.globalShortcut.unregister).toHaveBeenCalled(),
  );
  expect(await f.manager.get()).toMatchObject({ status: 'busy' });
  expect(await f.set(configuration([], false))).toMatchObject({
    status: 'busy',
  });
  ack.resolve();
  expect(await pending).toMatchObject({
    status: 'ready',
    runtime: { state: 'degraded', active: [] },
  });
  expect(f.manager.snapshot().held).toHaveLength(2);
});
it('restores an old mapping under a fresh source activation after CAS rollback', async () => {
  const f = fixture();
  f.globalShortcut.activate = vi.fn(async () => true);
  const saved = await f.set(configuration([['player.play-pause', chord('j')]]));
  const oldGeneration = f.manager.snapshot().generation,
    callback = f.registered.get('Control+Shift+J');
  const registrationToken = f.globalShortcut.register.mock.calls[0][2];
  const register = f.globalShortcut.register.getMockImplementation();
  f.globalShortcut.register.mockImplementation(async (key, cb) => {
    f.store.set({
      expectedRevision: saved.revision,
      configuration: configuration([], false),
    });
    return register(key, cb);
  });
  expect(
    await f.set(configuration([['player.next', chord('k')]])),
  ).toMatchObject({ status: 'conflict' });
  callback({ generation: oldGeneration, registrationToken });
  expect(f.onCommand).not.toHaveBeenCalled();
  callback({ generation: f.manager.snapshot().generation, registrationToken });
  expect(f.onCommand).toHaveBeenLastCalledWith(
    expect.objectContaining({ command: 'player.play-pause' }),
  );
  expect(f.globalShortcut.activate).toHaveBeenCalledTimes(2);
});
it('retains uncertain ownership after rejected register ACK until cleanup is confirmed', async () => {
  const f = fixture();
  f.globalShortcut.register.mockImplementation(async (key, callback) => {
    f.registered.set(key, callback);
    throw Error('remote reply lost');
  });
  f.globalShortcut.unregister.mockRejectedValue(Error('release reply lost'));
  expect(
    await f.set(configuration([['player.next', chord('k')]])),
  ).toMatchObject({ status: 'degraded' });
  expect(f.manager.snapshot()).toMatchObject({
    active: [],
    held: [{ command: 'player.next' }],
    pending: [],
    busy: false,
  });
  expect(fs.existsSync(f.file)).toBe(false);
});
it('never takes a foreign internal registration created during the awaited precheck', async () => {
  const f = fixture(),
    foreign = vi.fn();
  f.globalShortcut.isRegistered.mockImplementationOnce(() => {
    queueMicrotask(() => f.registered.set('Control+Shift+K', foreign));
    return false;
  });
  expect(
    await f.set(configuration([['player.next', chord('k')]])),
  ).toMatchObject({ status: 'occupied' });
  expect(f.registered.get('Control+Shift+K')).toBe(foreign);
  expect(f.globalShortcut.unregister).not.toHaveBeenCalled();
  expect(f.manager.snapshot().held).toEqual([]);
});
it('returns terminal snapshots after releasing transaction busy, including refresh failure', async () => {
  const f = fixture();
  expect(
    await f.set(configuration([['player.next', chord('k')]])),
  ).toMatchObject({ status: 'ready', runtime: { busy: false } });
  expect(await f.manager.refresh()).toMatchObject({ busy: false });
  vi.spyOn(f.store, 'get').mockReturnValue({ status: 'invalid' });
  expect(await f.manager.refresh()).toMatchObject({
    state: 'blocked',
    busy: false,
  });
});
