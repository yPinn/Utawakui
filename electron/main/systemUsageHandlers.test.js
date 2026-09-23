import { describe, expect, it, vi } from 'vitest';
import { registerSystemUsageHandlers } from './systemUsageHandlers.js';

describe('system usage handlers', () => {
  it('registers only the fixed get-status intent, delegating to the service', async () => {
    const handlers = new Map();
    const ipcMain = {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    };
    const service = {
      getStatus: vi.fn(() => ({
        cpuPercent: 12,
        ramPercent: 34,
      })),
    };

    registerSystemUsageHandlers({ ipcMain, service });

    expect([...handlers.keys()]).toEqual(['system-usage:get-status']);
    await expect(handlers.get('system-usage:get-status')()).resolves.toEqual({
      cpuPercent: 12,
      ramPercent: 34,
    });
    expect(service.getStatus).toHaveBeenCalledOnce();
  });
});
