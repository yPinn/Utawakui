import { describe, expect, it, vi } from 'vitest';

import { registerAppInfoHandlers } from './appInfoHandlers.js';

describe('registerAppInfoHandlers', () => {
  it('returns the version of the running application', async () => {
    const handlers = new Map();
    const ipcMain = {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    };
    const getVersion = vi.fn(() => '0.1.0');

    registerAppInfoHandlers({ ipcMain, getVersion });

    expect(await handlers.get('app:get-version')()).toBe('0.1.0');
    expect(getVersion).toHaveBeenCalledOnce();
  });

  it('relaunches through the injected quit path', async () => {
    const handlers = new Map();
    const relaunch = vi.fn();
    registerAppInfoHandlers({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      getVersion: () => '0.1.0',
      relaunch,
    });

    expect(await handlers.get('app:relaunch')()).toBe(true);
    expect(relaunch).toHaveBeenCalledOnce();
  });
});
