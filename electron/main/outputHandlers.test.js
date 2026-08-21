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

  it('gates start and publish while leaving status and stop recoverable', async () => {
    const ipcMain = createIpcMain();
    const requireFeatureGate = vi.fn();
    const server = {
      getStatus: vi.fn(() => ({ running: false, port: 17404 })),
      start: vi.fn(async () => ({ running: true, port: 17404 })),
      stop: vi.fn(async () => undefined),
      publish: vi.fn(() => true),
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
      port: 17404,
    });
    await expect(ipcMain.handlers.get('output:start')()).resolves.toEqual({
      running: true,
      port: 17404,
    });
    expect(requireFeatureGate).toHaveBeenCalledWith('public-output-flow');

    await expect(
      ipcMain.handlers.get('output:publish')(null, { revision: 1 }),
    ).resolves.toBe(false);
    expect(server.publish).not.toHaveBeenCalled();

    server.getStatus.mockReturnValue({ running: true, port: 17404 });
    await expect(
      ipcMain.handlers.get('output:publish')(null, { revision: 1 }),
    ).resolves.toBe(true);
    expect(requireFeatureGate).toHaveBeenCalledTimes(3);
    expect(server.publish).toHaveBeenCalledWith({ revision: 1 });

    await expect(ipcMain.handlers.get('output:stop')()).resolves.toEqual({
      running: true,
      port: 17404,
    });
    expect(server.stop).toHaveBeenCalledOnce();
  });

  it('loads, upserts, and selects portable output profiles', async () => {
    const ipcMain = createIpcMain();
    registerOutputHandlers({
      ipcMain,
      server: {
        getStatus: () => ({ running: false }),
        start: vi.fn(),
        stop: vi.fn(),
        publish: vi.fn(),
      },
      requireFeatureGate: vi.fn(),
      featureIds: { PUBLIC_OUTPUT_FLOW: 'public-output-flow' },
      getConfig: () => ({}),
      resolveDownloadDir: () => dir,
    });

    expect(await ipcMain.handlers.get('output-profiles:list')()).toEqual({
      version: 1,
      selectedProfileId: null,
      profiles: [],
    });

    const saved = await ipcMain.handlers.get('output-profiles:upsert')(null, {
      id: 'main-output',
      name: '主要輸出',
      templateId: 'focus-line',
      styleSetIds: ['lyrics-type'],
      settings: { alignment: 'center' },
      machinePath: 'C:\\secret.css',
    });
    expect(saved.profiles[0]).toEqual({
      id: 'main-output',
      name: '主要輸出',
      templateId: 'focus-line',
      styleSetIds: ['lyrics-type'],
      settings: { alignment: 'center' },
    });

    const selected = await ipcMain.handlers.get('output-profiles:select')(
      null,
      'main-output',
    );
    expect(selected.selectedProfileId).toBe('main-output');
  });
});
