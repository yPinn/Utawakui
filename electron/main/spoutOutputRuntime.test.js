import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import spoutOutputRuntimeModule from './spoutOutputRuntime.js';
import spoutOutputContractModule from '../../shared/spoutOutputContract.js';

const { createSpoutHelperLaunch, createSpoutOutputRuntime } =
  spoutOutputRuntimeModule;
const { SPOUT_HELPER_ARGUMENT, SPOUT_LYRICS_SURFACE, getSpoutLyricsSurface } =
  spoutOutputContractModule;

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.pid = 4200;
    this.connected = true;
    this.send = vi.fn();
    this.kill = vi.fn(() => true);
    this.stderr = new EventEmitter();
  }
}

function createOutputRuntime({ running = true } = {}) {
  let isRunning = running;
  const status = () => ({
    running: isRunning,
    httpUrl: isRunning ? 'http://127.0.0.1:8700' : null,
  });
  return {
    getStatus: vi.fn(status),
    start: vi.fn(async () => {
      isRunning = true;
      return status();
    }),
  };
}

async function flushStart(spawnHelper) {
  await vi.waitFor(() => expect(spawnHelper).toHaveBeenCalledOnce());
}

describe('Spout helper launch', () => {
  it('starts the packaged executable directly and supplies the app path in development', () => {
    expect(
      createSpoutHelperLaunch({
        execPath: 'C:\\Program Files\\Utawakui\\electron.exe',
        appPath: 'C:\\Program Files\\Utawakui\\resources\\app.asar',
        packaged: true,
      }),
    ).toEqual({
      command: 'C:\\Program Files\\Utawakui\\electron.exe',
      args: [SPOUT_HELPER_ARGUMENT],
    });
    expect(
      createSpoutHelperLaunch({
        execPath: 'E:\\Utawakui\\node_modules\\electron\\electron.exe',
        appPath: 'E:\\Utawakui',
        packaged: false,
      }),
    ).toEqual({
      command: 'E:\\Utawakui\\node_modules\\electron\\electron.exe',
      args: ['E:\\Utawakui', SPOUT_HELPER_ARGUMENT],
    });
  });
});

describe('Spout output runtime', () => {
  it('has zero helper process and no native import while disabled', () => {
    const spawnHelper = vi.fn();
    const runtime = createSpoutOutputRuntime({
      outputRuntime: createOutputRuntime(),
      spawnHelper,
      platform: 'win32',
    });

    expect(runtime.getStatus()).toEqual({
      supported: true,
      desired: {
        running: false,
        frameRateProfile: 'standard',
        surface: SPOUT_LYRICS_SURFACE,
      },
      observed: {
        lifecycle: 'stopped',
        processId: null,
        firstFrameAt: null,
      },
      effective: { surface: null },
      error: null,
    });
    expect(spawnHelper).not.toHaveBeenCalled();
  });

  it('accepts only the 30 or 60 FPS product profile while stopped', async () => {
    const requireFeatureGate = vi.fn();
    const runtime = createSpoutOutputRuntime({
      outputRuntime: createOutputRuntime(),
      requireFeatureGate,
      spawnHelper: vi.fn(),
      platform: 'win32',
    });

    await expect(runtime.setFrameRateProfile('reduced')).resolves.toMatchObject(
      {
        desired: {
          running: false,
          frameRateProfile: 'reduced',
          surface: getSpoutLyricsSurface('reduced'),
        },
      },
    );
    expect(requireFeatureGate).toHaveBeenCalledWith('public-output-flow');
    await expect(runtime.setFrameRateProfile('120')).rejects.toThrow(
      'Spout frame-rate profile unavailable',
    );
  });

  it('starts Output first, sends only the main-derived configuration, and reports first-frame readiness', async () => {
    const child = new FakeChild();
    const spawnHelper = vi.fn(() => child);
    const outputRuntime = createOutputRuntime({ running: false });
    const requireFeatureGate = vi.fn();
    const runtime = createSpoutOutputRuntime({
      outputRuntime,
      requireFeatureGate,
      featureId: 'public-output-flow',
      spawnHelper,
      resolveLaunch: () => ({
        command: 'electron.exe',
        args: ['app', SPOUT_HELPER_ARGUMENT],
      }),
      platform: 'win32',
      now: () => new Date('2026-09-09T02:00:00.000Z'),
    });

    const starting = runtime.start();
    await flushStart(spawnHelper);

    expect(requireFeatureGate).toHaveBeenCalledWith('public-output-flow');
    expect(outputRuntime.start).toHaveBeenCalledOnce();
    expect(spawnHelper).toHaveBeenCalledWith({
      command: 'electron.exe',
      args: ['app', SPOUT_HELPER_ARGUMENT],
    });
    expect(child.send).toHaveBeenCalledWith({
      contractVersion: 1,
      type: 'configure',
      outputUrl: 'http://127.0.0.1:8700/overlay/lyrics',
      surface: SPOUT_LYRICS_SURFACE,
    });

    child.emit('message', {
      contractVersion: 1,
      type: 'ready',
      surface: SPOUT_LYRICS_SURFACE,
    });

    await expect(starting).resolves.toMatchObject({
      desired: { running: true },
      observed: {
        lifecycle: 'sending',
        processId: 4200,
        firstFrameAt: '2026-09-09T02:00:00.000Z',
      },
      effective: { surface: SPOUT_LYRICS_SURFACE },
      error: null,
    });
  });

  it('starts with the selected 30 FPS profile and locks it while active', async () => {
    const child = new FakeChild();
    const spawnHelper = vi.fn(() => child);
    const runtime = createSpoutOutputRuntime({
      outputRuntime: createOutputRuntime(),
      spawnHelper,
      platform: 'win32',
    });
    await runtime.setFrameRateProfile('reduced');
    const starting = runtime.start();
    await flushStart(spawnHelper);

    expect(child.send).toHaveBeenCalledWith(
      expect.objectContaining({ surface: getSpoutLyricsSurface('reduced') }),
    );
    await expect(runtime.setFrameRateProfile('standard')).rejects.toThrow(
      'Spout output must be stopped',
    );
    child.emit('message', {
      contractVersion: 1,
      type: 'ready',
      surface: getSpoutLyricsSurface('reduced'),
    });
    await starting;
    await expect(runtime.setFrameRateProfile('standard')).rejects.toThrow(
      'Spout output must be stopped',
    );
  });

  it('rechecks the feature gate and Windows boundary before spawning', async () => {
    const blockedSpawn = vi.fn();
    const gatedRuntime = createSpoutOutputRuntime({
      outputRuntime: createOutputRuntime(),
      requireFeatureGate: () => {
        throw new Error('feature gate required');
      },
      spawnHelper: blockedSpawn,
      platform: 'win32',
    });
    await expect(gatedRuntime.start()).rejects.toThrow('feature gate required');
    expect(blockedSpawn).not.toHaveBeenCalled();

    const unsupportedRuntime = createSpoutOutputRuntime({
      outputRuntime: createOutputRuntime(),
      spawnHelper: blockedSpawn,
      platform: 'darwin',
    });
    await expect(unsupportedRuntime.start()).rejects.toThrow(
      'Spout output is available only on Windows',
    );
    expect(unsupportedRuntime.getStatus()).toMatchObject({ supported: false });
    expect(blockedSpawn).not.toHaveBeenCalled();
  });

  it('contains helper failures and never projects raw native error text', async () => {
    const child = new FakeChild();
    const spawnHelper = vi.fn(() => child);
    const logger = { error: vi.fn() };
    const runtime = createSpoutOutputRuntime({
      outputRuntime: createOutputRuntime(),
      spawnHelper,
      platform: 'win32',
      logger,
    });

    const starting = runtime.start();
    await flushStart(spawnHelper);
    child.emit('message', {
      contractVersion: 1,
      type: 'error',
      code: 'SPOUT_NATIVE_MODULE_UNAVAILABLE',
      message: 'failed to load C:\\private\\bridge.node',
    });
    await expect(starting).rejects.toThrow('Spout helper failed to start');

    expect(runtime.getStatus()).toMatchObject({
      desired: { running: false },
      observed: { lifecycle: 'error' },
      error: {
        code: 'SPOUT_NATIVE_MODULE_UNAVAILABLE',
        message: 'Spout2 元件無法載入。',
      },
    });
    expect(JSON.stringify(runtime.getStatus())).not.toContain('private');
    expect(logger.error).toHaveBeenCalled();
  });

  it('cleans up a failed helper before an immediate retry', async () => {
    const firstChild = new FakeChild();
    const secondChild = new FakeChild();
    secondChild.pid = 4201;
    const spawnHelper = vi
      .fn()
      .mockReturnValueOnce(firstChild)
      .mockReturnValueOnce(secondChild);
    const runtime = createSpoutOutputRuntime({
      outputRuntime: createOutputRuntime(),
      spawnHelper,
      platform: 'win32',
      stopTimeoutMs: 5,
      logger: { error: vi.fn() },
    });

    const firstStart = runtime.start();
    await flushStart(spawnHelper);
    firstChild.emit('message', {
      contractVersion: 1,
      type: 'error',
      code: 'SPOUT_SHARED_TEXTURE_UNAVAILABLE',
    });
    await expect(firstStart).rejects.toThrow('Spout helper failed to start');

    const secondStart = runtime.start();
    await vi.waitFor(() => expect(firstChild.kill).toHaveBeenCalled());
    await vi.waitFor(() => expect(spawnHelper).toHaveBeenCalledTimes(2));
    secondChild.emit('message', {
      contractVersion: 1,
      type: 'ready',
      surface: SPOUT_LYRICS_SURFACE,
    });

    await expect(secondStart).resolves.toMatchObject({
      observed: { lifecycle: 'sending', processId: 4201 },
    });
    firstChild.emit('exit', 1, null);
    expect(runtime.getStatus()).toMatchObject({
      observed: { lifecycle: 'sending', processId: 4201 },
    });
  });

  it('publishes a contained error when a sending helper later exits', async () => {
    const child = new FakeChild();
    const onStatusChange = vi.fn();
    const spawnHelper = vi.fn(() => child);
    const runtime = createSpoutOutputRuntime({
      outputRuntime: createOutputRuntime(),
      spawnHelper,
      platform: 'win32',
      onStatusChange,
      logger: { error: vi.fn() },
    });
    const starting = runtime.start();
    await flushStart(spawnHelper);
    child.emit('message', {
      contractVersion: 1,
      type: 'ready',
      surface: SPOUT_LYRICS_SURFACE,
    });
    await starting;

    child.emit('exit', 1, null);

    expect(runtime.getStatus()).toMatchObject({
      desired: { running: false },
      observed: { lifecycle: 'error', processId: null },
      error: { code: 'SPOUT_HELPER_INTERNAL' },
    });
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        observed: expect.objectContaining({ lifecycle: 'error' }),
      }),
    );
  });

  it('bounds synchronous helper launch failures and does not leave desired running', async () => {
    const runtime = createSpoutOutputRuntime({
      outputRuntime: createOutputRuntime(),
      spawnHelper: () => {
        throw new Error('spawn C:\\private\\electron.exe EACCES');
      },
      platform: 'win32',
      logger: { error: vi.fn() },
    });

    await expect(runtime.start()).rejects.toThrow(
      'Spout helper failed to start',
    );
    expect(runtime.getStatus()).toMatchObject({
      desired: { running: false },
      observed: { lifecycle: 'error' },
      error: {
        code: 'SPOUT_HELPER_INTERNAL',
        message: 'Spout2 helper 發生錯誤。',
      },
    });
    expect(JSON.stringify(runtime.getStatus())).not.toContain('private');
  });

  it('stops gracefully, then force-kills only if the helper does not exit', async () => {
    const child = new FakeChild();
    const spawnHelper = vi.fn(() => child);
    const runtime = createSpoutOutputRuntime({
      outputRuntime: createOutputRuntime(),
      spawnHelper,
      platform: 'win32',
      stopTimeoutMs: 5,
    });
    const starting = runtime.start();
    await flushStart(spawnHelper);
    child.emit('message', {
      contractVersion: 1,
      type: 'ready',
      surface: SPOUT_LYRICS_SURFACE,
    });
    await starting;

    const stopping = runtime.stop();
    expect(child.send).toHaveBeenLastCalledWith({
      contractVersion: 1,
      type: 'stop',
    });
    child.emit('exit', 0, null);
    await expect(stopping).resolves.toMatchObject({
      desired: { running: false },
      observed: { lifecycle: 'stopped', processId: null },
    });
    expect(child.kill).not.toHaveBeenCalled();

    const secondChild = new FakeChild();
    spawnHelper.mockReturnValueOnce(secondChild);
    const restarting = runtime.start();
    await vi.waitFor(() => expect(spawnHelper).toHaveBeenCalledTimes(2));
    secondChild.emit('message', {
      contractVersion: 1,
      type: 'ready',
      surface: SPOUT_LYRICS_SURFACE,
    });
    await restarting;
    await runtime.stop();
    expect(secondChild.kill).toHaveBeenCalledOnce();
  });

  it('terminates a helper whose IPC channel is already disconnected', async () => {
    const child = new FakeChild();
    const spawnHelper = vi.fn(() => child);
    const runtime = createSpoutOutputRuntime({
      outputRuntime: createOutputRuntime(),
      spawnHelper,
      platform: 'win32',
    });
    const starting = runtime.start();
    await flushStart(spawnHelper);
    child.emit('message', {
      contractVersion: 1,
      type: 'ready',
      surface: SPOUT_LYRICS_SURFACE,
    });
    await starting;
    child.connected = false;

    await runtime.stop();

    expect(child.kill).toHaveBeenCalledOnce();
  });
});
