import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import outputHandlersModule from './outputHandlers.js';

const { registerOutputHandlers } = outputHandlersModule;

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

describe('output handlers', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-output-ipc-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('gates start and publish while source connect, status, and stop stay recoverable', async () => {
    const ipcMain = createIpcMain();
    const requireFeatureGate = vi.fn();
    const server = {
      getStatus: vi.fn(() => ({ running: false, port: 8700 })),
      start: vi.fn(async () => ({ running: true, port: 8700 })),
      stop: vi.fn(async () => undefined),
      publish: vi.fn(() => true),
      connectSource: vi.fn(() => ({
        running: false,
        bootId: 'boot-1',
        observed: { sourceSynchronization: 'syncing' },
      })),
    };
    registerOutputHandlers({
      ipcMain,
      server,
      requireFeatureGate,
      featureIds: { PUBLIC_OUTPUT_FLOW: 'public-output-flow' },
      getConfig: () => ({}),
      resolveDownloadDir: () => dir,
    });

    await expect(ipcMain.handlers.get('output:get-status')()).resolves.toEqual({
      running: false,
      port: 8700,
    });
    await expect(ipcMain.handlers.get('output:start')()).resolves.toEqual({
      running: true,
      port: 8700,
    });
    expect(requireFeatureGate).toHaveBeenCalledWith('public-output-flow');

    const sender = { id: 5 };
    await expect(
      ipcMain.handlers.get('output:connect-source')({ sender }),
    ).resolves.toMatchObject({ bootId: 'boot-1' });
    expect(server.connectSource).toHaveBeenCalledWith(sender);

    const envelope = { contractVersion: 3, revision: 1 };
    await expect(
      ipcMain.handlers.get('output:publish')({ sender }, envelope),
    ).resolves.toBe(true);
    expect(requireFeatureGate).toHaveBeenCalledTimes(2);
    expect(server.publish).toHaveBeenCalledWith(envelope, sender);

    await expect(ipcMain.handlers.get('output:stop')()).resolves.toEqual({
      running: false,
      port: 8700,
    });
    expect(server.stop).toHaveBeenCalledOnce();
  });

  it('loads and independently upserts portable output slots', async () => {
    const ipcMain = createIpcMain();
    const setOverlaySlots = vi.fn();
    registerOutputHandlers({
      ipcMain,
      server: {
        getStatus: () => ({ running: false }),
        start: vi.fn(),
        stop: vi.fn(),
        publish: vi.fn(),
        setOverlaySlots,
      },
      requireFeatureGate: vi.fn(),
      featureIds: { PUBLIC_OUTPUT_FLOW: 'public-output-flow' },
      getConfig: () => ({}),
      resolveDownloadDir: () => dir,
    });

    expect(await ipcMain.handlers.get('output-slots:list')()).toMatchObject({
      version: 2,
      slots: {
        'now-playing': { templateId: 'now-next' },
        setlist: { templateId: 'queue-board' },
        lyrics: { templateId: 'focus-line' },
        artwork: { templateId: 'art-card' },
      },
    });

    await ipcMain.handlers.get('output-slots:upsert')(null, 'lyrics', {
      templateId: 'focus-line',
      styleSetIds: ['lyrics-type'],
      settings: { alignment: 'center' },
      machinePath: 'C:\\secret.css',
    });
    const saved = await ipcMain.handlers.get('output-slots:upsert')(
      null,
      'now-playing',
      {
        templateId: 'now-next',
        settings: { alignment: 'left' },
      },
    );

    expect(saved.slots).toMatchObject({
      'now-playing': {
        templateId: 'now-next',
        styleSetIds: [],
        settings: { alignment: 'left' },
      },
      lyrics: {
        templateId: 'focus-line',
        styleSetIds: ['lyrics-type'],
        settings: { alignment: 'center' },
      },
    });
    expect(setOverlaySlots).toHaveBeenLastCalledWith(saved.slots);
  });

  it('reads and updates validated machine-local runtime settings', async () => {
    const ipcMain = createIpcMain();
    let config = {
      outputRuntime: { autoStart: true, port: 8700, displayDelayMs: 0 },
    };
    const server = {
      getStatus: vi.fn(() => ({
        running: true,
        port: config.outputRuntime.port,
      })),
      start: vi.fn(),
      stop: vi.fn(),
      publish: vi.fn(),
      reconcileConfigured: vi.fn(async () => ({
        running: config.outputRuntime.autoStart,
        port: config.outputRuntime.port,
      })),
    };
    const updateConfig = vi.fn((patch) => {
      config = { ...config, ...patch };
      return config;
    });
    registerOutputHandlers({
      ipcMain,
      server,
      requireFeatureGate: vi.fn(),
      featureIds: { PUBLIC_OUTPUT_FLOW: 'public-output-flow' },
      getConfig: () => config,
      updateConfig,
      resolveDownloadDir: () => dir,
      isPortAvailable: vi.fn(async () => true),
      findAvailablePorts: vi.fn(async () => [8701, 8702]),
    });

    await expect(
      ipcMain.handlers.get('output:get-settings')(),
    ).resolves.toEqual({
      autoStart: true,
      port: 8700,
      displayDelayMs: 0,
    });
    await expect(
      ipcMain.handlers.get('output:update-settings')(null, {
        autoStart: false,
        port: 8702,
        displayDelayMs: 280,
      }),
    ).resolves.toEqual({
      settings: { autoStart: false, port: 8702, displayDelayMs: 280 },
      status: { running: false, port: 8702 },
    });
    expect(updateConfig).toHaveBeenCalledWith({
      outputRuntime: { autoStart: false, port: 8702, displayDelayMs: 280 },
    });
    expect(server.reconcileConfigured).toHaveBeenCalledWith({
      forceRestart: true,
    });

    await expect(
      ipcMain.handlers.get('output:update-settings')(null, {
        autoStart: false,
        port: 8702,
        displayDelayMs: 420,
      }),
    ).resolves.toMatchObject({
      settings: { autoStart: false, port: 8702, displayDelayMs: 420 },
    });
    expect(server.reconcileConfigured).toHaveBeenLastCalledWith({
      forceRestart: false,
    });
    expect(server.reconcileConfigured).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid or occupied ports without changing the persisted setting', async () => {
    const ipcMain = createIpcMain();
    const config = {
      outputRuntime: { autoStart: true, port: 8700, displayDelayMs: 0 },
    };
    const updateConfig = vi.fn();
    registerOutputHandlers({
      ipcMain,
      server: {
        getStatus: () => ({ running: true, port: 8700 }),
        start: vi.fn(),
        stop: vi.fn(),
        publish: vi.fn(),
        reconcileConfigured: vi.fn(),
      },
      requireFeatureGate: vi.fn(),
      featureIds: { PUBLIC_OUTPUT_FLOW: 'public-output-flow' },
      getConfig: () => config,
      updateConfig,
      resolveDownloadDir: () => dir,
      isPortAvailable: vi.fn(async () => false),
      findAvailablePorts: vi.fn(async () => [8701, 8702]),
    });

    await expect(
      ipcMain.handlers.get('output:update-settings')(null, {
        autoStart: true,
        port: 80,
        displayDelayMs: 0,
      }),
    ).rejects.toThrow('invalid output runtime settings');
    await expect(
      ipcMain.handlers.get('output:update-settings')(null, {
        autoStart: true,
        port: 8701,
        displayDelayMs: 0,
      }),
    ).rejects.toThrow('output port is already in use: 8701');
    expect(updateConfig).not.toHaveBeenCalled();
    await expect(
      ipcMain.handlers.get('output:suggest-ports')(),
    ).resolves.toEqual([8701, 8702]);
  });

  it('restores the previous running service when a restart loses a port race', async () => {
    const ipcMain = createIpcMain();
    let config = {
      outputRuntime: { autoStart: true, port: 8700, displayDelayMs: 0 },
    };
    const restartFailure = Object.assign(new Error('listen EADDRINUSE'), {
      code: 'EADDRINUSE',
    });
    const server = {
      getStatus: vi.fn(() => ({
        running: true,
        port: config.outputRuntime.port,
      })),
      start: vi.fn(async () => ({ running: true, port: 8700 })),
      stop: vi.fn(),
      publish: vi.fn(),
      reconcileConfigured: vi
        .fn()
        .mockRejectedValueOnce(restartFailure)
        .mockResolvedValueOnce({ running: true, port: 8700 }),
    };
    const updateConfig = vi.fn((patch) => {
      config = { ...config, ...patch };
      return config;
    });
    registerOutputHandlers({
      ipcMain,
      server,
      requireFeatureGate: vi.fn(),
      featureIds: { PUBLIC_OUTPUT_FLOW: 'public-output-flow' },
      getConfig: () => config,
      updateConfig,
      resolveDownloadDir: () => dir,
      isPortAvailable: vi.fn(async () => true),
    });

    await expect(
      ipcMain.handlers.get('output:update-settings')(null, {
        autoStart: true,
        port: 8702,
        displayDelayMs: 0,
      }),
    ).rejects.toBe(restartFailure);
    expect(config.outputRuntime).toEqual({
      autoStart: true,
      port: 8700,
      displayDelayMs: 0,
    });
    expect(server.reconcileConfigured).toHaveBeenCalledTimes(2);
    expect(server.reconcileConfigured).toHaveBeenNthCalledWith(1, {
      forceRestart: true,
    });
    expect(server.reconcileConfigured).toHaveBeenNthCalledWith(2, {
      forceRestart: true,
    });
    expect(server.start).not.toHaveBeenCalled();
  });
});
