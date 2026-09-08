import { describe, expect, it, vi } from 'vitest';
import spoutOutputHandlersModule from './spoutOutputHandlers.js';

const { registerSpoutOutputHandlers } = spoutOutputHandlersModule;

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

describe('Spout output handlers', () => {
  it('gates start while status and stop stay recoverable', async () => {
    const ipcMain = createIpcMain();
    const requireFeatureGate = vi.fn();
    const runtime = {
      getStatus: vi.fn(() => ({ desired: { running: false } })),
      start: vi.fn(async () => ({ desired: { running: true } })),
      stop: vi.fn(async () => ({ desired: { running: false } })),
      setFrameRateProfile: vi.fn(async (profileId) => ({
        desired: { frameRateProfile: profileId },
      })),
    };

    registerSpoutOutputHandlers({
      ipcMain,
      runtime,
      requireFeatureGate,
      featureId: 'public-output-flow',
    });

    expect([...ipcMain.handlers.keys()]).toEqual([
      'spout-output:get-status',
      'spout-output:set-frame-rate-profile',
      'spout-output:start',
      'spout-output:stop',
    ]);
    await expect(
      ipcMain.handlers.get('spout-output:get-status')(),
    ).resolves.toEqual({ desired: { running: false } });
    await expect(ipcMain.handlers.get('spout-output:start')()).resolves.toEqual(
      { desired: { running: true } },
    );
    expect(requireFeatureGate).toHaveBeenCalledOnce();
    expect(requireFeatureGate).toHaveBeenCalledWith('public-output-flow');
    await expect(ipcMain.handlers.get('spout-output:stop')()).resolves.toEqual({
      desired: { running: false },
    });
    expect(runtime.stop).toHaveBeenCalledOnce();
    await expect(
      ipcMain.handlers.get('spout-output:set-frame-rate-profile')(
        { sender: { id: 4 } },
        'reduced',
      ),
    ).resolves.toEqual({ desired: { frameRateProfile: 'reduced' } });
    expect(runtime.setFrameRateProfile).toHaveBeenCalledWith('reduced');
    expect(requireFeatureGate).toHaveBeenCalledTimes(2);
  });

  it('does not forward renderer arguments into the native lifecycle', async () => {
    const ipcMain = createIpcMain();
    const runtime = {
      getStatus: vi.fn(() => ({})),
      start: vi.fn(async () => ({})),
      stop: vi.fn(async () => ({})),
      setFrameRateProfile: vi.fn(async () => ({})),
    };

    registerSpoutOutputHandlers({
      ipcMain,
      runtime,
      requireFeatureGate: vi.fn(),
      featureId: 'public-output-flow',
    });

    await ipcMain.handlers.get('spout-output:start')(
      { sender: { id: 4 } },
      {
        senderName: 'attacker',
        outputUrl: 'https://example.com',
        executablePath: 'C:\\private\\helper.exe',
      },
    );

    expect(runtime.start).toHaveBeenCalledWith();
  });
});
