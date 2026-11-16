import Module from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: {
    invoke: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
}));

const originalArgv = [...process.argv];
const originalModuleLoad = Module._load;

async function loadMainBridge(args = []) {
  vi.resetModules();
  process.argv = ['electron', 'app', ...args];
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return electron;
    return originalModuleLoad.call(this, request, parent, isMain);
  };
  try {
    await import('./preload.js');
  } finally {
    Module._load = originalModuleLoad;
  }
  return electron.contextBridge.exposeInMainWorld.mock.calls.findLast(
    ([name]) => name === 'Utawakui',
  )[1];
}

function listenerFor(channel, index = 0) {
  return electron.ipcRenderer.on.mock.calls.filter(
    ([name]) => name === channel,
  )[index][1];
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.argv = [...originalArgv];
  Module._load = originalModuleLoad;
  vi.resetModules();
});

describe('main preload bridge edges', () => {
  it.each([
    [['--monitor-guide-vocal-follows-capture=0'], false],
    [['--monitor-guide-vocal-follows-capture=2'], undefined],
    [[], undefined],
  ])(
    'reads monitor-follows-capture launch value %j as %s',
    async (args, expected) => {
      const bridge = await loadMainBridge(args);
      expect(
        bridge.initialAudioPreferences.monitorGuideVocalFollowsCapture,
      ).toBe(expected);
    },
  );

  it('keeps the retained window visibility when Main sends a non-boolean', async () => {
    const bridge = await loadMainBridge();
    const retain = listenerFor('main-window:visibility');
    retain(null, 'hidden');
    const seen = vi.fn();
    bridge.onMainWindowVisibilityChanged(seen);
    expect(seen).toHaveBeenCalledWith(true);

    retain(null, false);
    const later = vi.fn();
    bridge.onMainWindowVisibilityChanged(later);
    expect(later).toHaveBeenCalledWith(false);
  });

  it('forwards performance-settings invalidations only with a safe library epoch', async () => {
    const bridge = await loadMainBridge();
    const callback = vi.fn();
    const cleanup = bridge.onPerformanceSettingsInvalidated(callback);
    const listener = listenerFor('library:performance-settings-invalidated');

    listener(null, { libraryEpoch: 1.5, trackId: 't' });
    listener(null, null);
    expect(callback).not.toHaveBeenCalled();

    listener(null, { libraryEpoch: 3, trackId: 't', path: 'private' });
    listener(null, { libraryEpoch: 4, trackId: 7 });
    expect(callback.mock.calls).toEqual([
      [{ libraryEpoch: 3, trackId: 't' }],
      [{ libraryEpoch: 4 }],
    ]);

    cleanup();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(
      'library:performance-settings-invalidated',
      listener,
    );
  });
});
