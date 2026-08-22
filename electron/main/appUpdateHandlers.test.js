import { describe, expect, it, vi } from 'vitest';
import { registerAppUpdateHandlers } from './appUpdateHandlers.js';

describe('app update handlers', () => {
  it('registers only fixed updater intents without renderer payloads', async () => {
    const handlers = new Map();
    const ipcMain = {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    };
    const service = {
      getStatus: vi.fn(() => ({ phase: 'idle' })),
      check: vi.fn(async () => ({ phase: 'checking' })),
      download: vi.fn(async () => ({ phase: 'downloading' })),
      install: vi.fn(() => ({ phase: 'downloaded' })),
    };

    registerAppUpdateHandlers({ ipcMain, service });

    expect([...handlers.keys()]).toEqual([
      'app-update:get-status',
      'app-update:check',
      'app-update:download',
      'app-update:install',
    ]);
    await expect(handlers.get('app-update:get-status')()).resolves.toEqual({
      phase: 'idle',
    });
    await expect(handlers.get('app-update:check')()).resolves.toEqual({
      phase: 'checking',
    });
    await expect(handlers.get('app-update:download')()).resolves.toEqual({
      phase: 'downloading',
    });
    await expect(handlers.get('app-update:install')()).resolves.toEqual({
      phase: 'downloaded',
    });
  });
});
