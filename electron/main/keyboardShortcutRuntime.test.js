import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { defaultShortcutConfiguration } from '../../shared/keyboardShortcutContract.mjs';
import { createKeyboardShortcutRuntime } from './keyboardShortcutRuntime.js';

it('keeps production capabilities closed and attaches one removable suspend/resume/quit lifecycle', async () => {
  const app = new EventEmitter(),
    powerMonitor = new EventEmitter();
  const store = {
    get: vi.fn(() => ({
      status: 'ready',
      revision: null,
      configuration: defaultShortcutConfiguration(),
    })),
    prepare: vi.fn(() => ({ status: 'invalid-intent' })),
  };
  const globalShortcut = {
    register: vi.fn(),
    unregister: vi.fn(),
    isRegistered: vi.fn(),
  };
  const runtime = createKeyboardShortcutRuntime({
    app,
    powerMonitor,
    store,
    globalShortcut,
    platform: 'win32',
  });
  await runtime.ready;
  expect(runtime.snapshot()).toMatchObject({
    state: 'disabled',
    eligibleCommands: [],
    capabilityReason: 'repeat-unverified',
    active: [],
    held: [],
  });
  powerMonitor.emit('suspend');
  expect(runtime.snapshot().state).toBe('suspended');
  powerMonitor.emit('resume');
  await vi.waitFor(() => expect(runtime.snapshot().state).toBe('disabled'));
  expect((await runtime.get()).status).toBe('ready');
  expect((await runtime.set({})).status).toBe('invalid-intent');
  expect(globalShortcut.register).not.toHaveBeenCalled();
  app.emit('will-quit');
  await runtime.dispose();
  expect(runtime.snapshot().state).toBe('disposed');
  expect(powerMonitor.listenerCount('suspend')).toBe(0);
  expect(powerMonitor.listenerCount('resume')).toBe(0);
  expect(app.listenerCount('will-quit')).toBe(0);
});
it('reports an unsupported platform without registering keys or affecting App-only settings', async () => {
  const configuration = defaultShortcutConfiguration();
  const runtime = createKeyboardShortcutRuntime({
    app: new EventEmitter(),
    powerMonitor: new EventEmitter(),
    platform: 'linux',
    store: { get: () => ({ status: 'ready', configuration, revision: null }) },
    globalShortcut: {},
  });
  await runtime.ready;
  expect((await runtime.get()).configuration).toEqual(configuration);
  expect(runtime.snapshot().capabilityReason).toBe('unsupported-platform');
  await runtime.dispose();
});
it('supervises only its own helper on quit and waits for bounded backend shutdown', async () => {
  const app = new EventEmitter(),
    powerMonitor = new EventEmitter();
  app.quit = vi.fn();
  let release;
  const stopped = new Promise((resolve) => {
    release = resolve;
  });
  const backend = {
    activate: vi.fn(async () => true),
    hasProcess: () => true,
    shutdown: vi.fn(() => stopped),
    reset: vi.fn(),
  };
  const runtime = createKeyboardShortcutRuntime({
    app,
    powerMonitor,
    platform: 'win32',
    arch: 'x64',
    backendFactory: () => backend,
    store: {
      get: () => ({
        status: 'ready',
        configuration: defaultShortcutConfiguration(),
        revision: null,
      }),
    },
  });
  await runtime.ready;
  const event = { preventDefault: vi.fn() };
  app.emit('before-quit', event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(app.quit).not.toHaveBeenCalled();
  release();
  await runtime.dispose();
  await vi.waitFor(() => expect(app.quit).toHaveBeenCalledOnce());
  expect(backend.shutdown).toHaveBeenCalledOnce();
  expect(app.listenerCount('before-quit')).toBe(0);
});
it('invalidates on backend failure and resets only during an explicit read', async () => {
  let options;
  const onError = vi.fn(),
    backend = {
      activate: async () => true,
      hasProcess: () => false,
      shutdown: vi.fn(async () => {}),
      reset: vi.fn(async () => {}),
    };
  const runtime = createKeyboardShortcutRuntime({
    app: new EventEmitter(),
    powerMonitor: new EventEmitter(),
    platform: 'win32',
    arch: 'x64',
    backendFactory: (value) => {
      options = value;
      return backend;
    },
    onError,
    store: {
      get: () => ({
        status: 'ready',
        configuration: defaultShortcutConfiguration(),
        revision: null,
      }),
    },
  });
  await runtime.ready;
  options.onFailure(Error('private backend context'));
  expect(runtime.snapshot().state).toBe('degraded');
  expect(backend.reset).not.toHaveBeenCalled();
  await runtime.get();
  expect(backend.reset).toHaveBeenCalledOnce();
  expect(onError).toHaveBeenCalledWith(expect.any(Error), 'backend');
  await runtime.dispose();
});
