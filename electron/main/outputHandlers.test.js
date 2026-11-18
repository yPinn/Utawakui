import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maskEdge } from '../../shared/outputPortraitImage.json';
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

  it('segments only a bounded sample for the active draft and discards cancelled inference', async () => {
    const ipcMain = createIpcMain();
    const completed = Promise.withResolvers();
    const segmentPortrait = vi.fn(() => completed.promise);
    const requireFeatureGate = vi.fn();
    const sender = {};
    const event = { sender };
    registerOutputHandlers({
      ipcMain,
      server: {},
      featureIds: { PUBLIC_OUTPUT_FLOW: 'public-output-flow' },
      getConfig: () => ({}),
      resolveDownloadDir: () => dir,
      dialog: { showOpenDialog: async () => ({ filePaths: ['picked.png'] }) },
      getMainWindow: () => ({}),
      readPortrait: async () => ({
        bytes: Buffer.from('photo'),
        mimeType: 'image/png',
      }),
      requireFeatureGate,
      segmentPortrait,
    });
    const { id } = await ipcMain.handlers.get('output-slots:choose-portrait')(
      event,
    );
    const pixels = new Uint8Array(maskEdge ** 2 * 4);
    const segment = ipcMain.handlers.get('output-slots:segment-portrait');
    expect(await segment({ sender: {} }, id, pixels)).toEqual({
      status: 'error',
    });
    expect(await segment(event, id, pixels.subarray(1))).toEqual({
      status: 'error',
    });
    expect(segmentPortrait).not.toHaveBeenCalled();
    const active = segment(event, id, pixels);
    const [, signal] = segmentPortrait.mock.calls[0];
    expect(await segment(event, id, pixels)).toEqual({ status: 'error' });
    expect(
      await ipcMain.handlers.get('output-slots:save-portrait')(event, id),
    ).toEqual({ status: 'error' });
    ipcMain.handlers.get('output-slots:discard-portrait')(event, id);
    expect(signal.aborted).toBe(true);
    completed.resolve({ status: 'ok', alpha: new Uint8Array(maskEdge ** 2) });
    expect(await active).toEqual({ status: 'cancelled' });
    expect(requireFeatureGate).toHaveBeenCalledWith('public-output-flow');
  });

  it('commits only the current photo draft selected in the main-owned picker', async () => {
    const ipcMain = createIpcMain();
    const requireFeatureGate = vi.fn();
    const dialog = { showOpenDialog: vi.fn() };
    const bytes = Buffer.from('original image');
    const readPortrait = vi
      .fn()
      .mockResolvedValue({ bytes, mimeType: 'image/png' });
    const writePortrait = vi.fn().mockResolvedValue('imported-id');
    const mainWindow = {};
    const event = { sender: {} };
    registerOutputHandlers({
      ipcMain,
      server: {},
      requireFeatureGate,
      featureIds: { PUBLIC_OUTPUT_FLOW: 'public-output-flow' },
      getConfig: () => ({}),
      resolveDownloadDir: () => dir,
      dialog,
      getMainWindow: () => mainWindow,
      readPortrait,
      writePortrait,
    });
    const choosePortrait = ipcMain.handlers.get('output-slots:choose-portrait');
    const savePortrait = ipcMain.handlers.get('output-slots:save-portrait');
    const discardPortrait = ipcMain.handlers.get(
      'output-slots:discard-portrait',
    );
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true });
    expect(await choosePortrait(event)).toEqual({ status: 'cancelled' });
    expect(readPortrait).not.toHaveBeenCalled();
    dialog.showOpenDialog.mockResolvedValue({ filePaths: ['picked.png'] });
    const picked = await choosePortrait(event, 'renderer.png');
    expect(picked).toMatchObject({
      status: 'ok',
      bytes,
      mimeType: 'image/png',
    });
    expect(writePortrait).not.toHaveBeenCalled();
    expect(await savePortrait({ sender: {} }, picked.id)).toEqual({
      status: 'error',
    });
    discardPortrait(event, picked.id);
    expect(await savePortrait(event, picked.id)).toEqual({ status: 'error' });
    expect(writePortrait).not.toHaveBeenCalled();
    const next = await choosePortrait(event);
    expect(await savePortrait(event, next.id)).toEqual({
      status: 'ok',
      id: 'imported-id',
    });
    expect(writePortrait).toHaveBeenCalledExactlyOnceWith(dir, bytes, {
      edited: false,
    });
    const stale = await choosePortrait(event);
    const edited = await choosePortrait(event);
    expect(await savePortrait(event, stale.id)).toEqual({ status: 'error' });
    const png = new Uint8Array([1, 2, 3]);
    expect(await savePortrait(event, edited.id, png)).toEqual({
      status: 'ok',
      id: 'imported-id',
    });
    expect(writePortrait).toHaveBeenLastCalledWith(dir, png, { edited: true });
    expect(requireFeatureGate).toHaveBeenCalledWith('public-output-flow');
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      mainWindow,
      expect.objectContaining({
        filters: [
          expect.objectContaining({
            extensions: ['png', 'webp', 'jpg', 'jpeg'],
          }),
        ],
      }),
    );
    expect(readPortrait.mock.calls).toEqual([
      ['picked.png'],
      ['picked.png'],
      ['picked.png'],
      ['picked.png'],
    ]);
  });

  it('contains an unavailable library during startup registration', () => {
    const ipcMain = createIpcMain();
    const logger = { warn: vi.fn() };
    const failure = new Error('library unavailable');
    const server = { setOverlaySlots: vi.fn() };

    expect(() =>
      registerOutputHandlers({
        ipcMain,
        server,
        requireFeatureGate: vi.fn(),
        featureIds: { PUBLIC_OUTPUT_FLOW: 'public-output-flow' },
        getConfig: () => ({ downloadDir: 'X:\\offline' }),
        resolveDownloadDir: () => {
          throw failure;
        },
        logger,
      }),
    ).not.toThrow();

    expect(logger.warn).toHaveBeenCalledWith(
      '[output] Initial slot synchronization skipped',
      failure,
    );
    expect(server.setOverlaySlots).not.toHaveBeenCalled();
    expect(ipcMain.handlers.has('output-slots:list')).toBe(true);
    expect(ipcMain.handlers.has('output-slots:set-recent-colors')).toBe(true);
    expect(ipcMain.handlers.has('output-slots:set-saved-colors')).toBe(true);
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

  it('passes the camera action through the public Output gate', async () => {
    const ipcMain = createIpcMain();
    const requireFeatureGate = vi.fn();
    const controlFisheyeEffects = vi.fn(() => ({ state: 'ready', sent: true }));
    registerOutputHandlers({
      ipcMain,
      server: { controlFisheyeEffects },
      requireFeatureGate,
      featureIds: { PUBLIC_OUTPUT_FLOW: 'public-output-flow' },
      getConfig: () => ({}),
      resolveDownloadDir: () => dir,
    });
    const trigger = ipcMain.handlers.get('output:fisheye-effects');
    await expect(trigger({}, 'glitch')).resolves.toMatchObject({ sent: true });
    expect(controlFisheyeEffects).toHaveBeenCalledWith('glitch');
    requireFeatureGate.mockImplementationOnce(() => {
      throw new Error('gate closed');
    });
    await expect(trigger({}, 'grain')).rejects.toThrow('gate closed');
    expect(controlFisheyeEffects).toHaveBeenCalledOnce();
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
      version: 5,
      preferences: { recentColors: [], savedColors: [] },
      slots: {
        'now-playing': { templateId: 'art-card' },
        setlist: { templateId: 'receipt-setlist' },
        lyrics: { templateId: 'karaoke-stack' },
      },
    });

    await ipcMain.handlers.get('output-slots:upsert')(null, 'lyrics', {
      templateId: 'karaoke-stack',
      styleSetIds: ['lyrics-type'],
      settings: { alignment: 'center' },
      machinePath: 'C:\\secret.css',
    });
    const saved = await ipcMain.handlers.get('output-slots:upsert')(
      null,
      'now-playing',
      {
        templateId: 'cover-player',
        settings: { alignment: 'left' },
      },
    );

    expect(saved.slots).toMatchObject({
      'now-playing': {
        templateId: 'cover-player',
        styleSetIds: [],
        settings: { alignment: 'left' },
      },
      lyrics: {
        templateId: 'karaoke-stack',
        styleSetIds: ['lyrics-type'],
        settings: { alignment: 'center' },
      },
    });
    expect(setOverlaySlots).toHaveBeenLastCalledWith(saved.slots);

    const preferences = await ipcMain.handlers.get(
      'output-slots:set-recent-colors',
    )(null, ['#AABBCC', '#aabbcc', '#112233', 'private-value']);
    expect(preferences.preferences.recentColors).toEqual([
      '#aabbcc',
      '#112233',
    ]);
    expect(preferences.slots).toEqual(saved.slots);

    const savedPalette = await ipcMain.handlers.get(
      'output-slots:set-saved-colors',
    )(null, ['#AABBCC', '#aabbcc', '#445566', 'private-value']);
    expect(savedPalette.preferences).toEqual({
      recentColors: ['#aabbcc', '#112233'],
      savedColors: ['#aabbcc', '#445566'],
    });
    expect(savedPalette.slots).toEqual(saved.slots);
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
