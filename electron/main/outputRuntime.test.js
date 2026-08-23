import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import outputRuntimeModule from './outputRuntime.js';
import outputContract from '../../shared/outputContract.js';

const { createOutputRuntime, registerOutputRuntimeLifecycle } =
  outputRuntimeModule;
const { createEmptyOutputSnapshot } = outputContract;

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('outputRuntime lifecycle', () => {
  it('stops the runtime once before allowing app quit', async () => {
    const app = new EventEmitter();
    app.quit = vi.fn();
    const stopping = deferred();
    const server = { stop: vi.fn(() => stopping.promise) };
    registerOutputRuntimeLifecycle({ app, server });

    const firstEvent = { preventDefault: vi.fn() };
    const repeatedEvent = { preventDefault: vi.fn() };
    app.emit('before-quit', firstEvent);
    app.emit('before-quit', repeatedEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledOnce();
    expect(repeatedEvent.preventDefault).toHaveBeenCalledOnce();
    expect(server.stop).toHaveBeenCalledOnce();
    expect(app.quit).not.toHaveBeenCalled();

    stopping.resolve();
    await stopping.promise;
    await Promise.resolve();
    expect(app.quit).toHaveBeenCalledOnce();

    const finalEvent = { preventDefault: vi.fn() };
    app.emit('before-quit', finalEvent);
    expect(finalEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('still allows quit after reporting a cleanup failure', async () => {
    const app = new EventEmitter();
    app.quit = vi.fn();
    const error = new Error('close failed');
    const logger = { error: vi.fn() };
    const server = { stop: vi.fn().mockRejectedValue(error) };
    registerOutputRuntimeLifecycle({ app, server, logger });

    app.emit('before-quit', { preventDefault: vi.fn() });
    await Promise.resolve();
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith(
      '[output] Failed to stop output runtime',
      error,
    );
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it('still allows quit when cleanup throws synchronously', async () => {
    const app = new EventEmitter();
    app.quit = vi.fn();
    const error = new Error('close threw');
    const logger = { error: vi.fn() };
    const server = {
      stop: vi.fn(() => {
        throw error;
      }),
    };
    registerOutputRuntimeLifecycle({ app, server, logger });

    app.emit('before-quit', { preventDefault: vi.fn() });
    await Promise.resolve();
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith(
      '[output] Failed to stop output runtime',
      error,
    );
    expect(app.quit).toHaveBeenCalledOnce();
  });
});

describe('outputRuntime controller', () => {
  function createServerFactory() {
    const servers = [];
    const factory = vi.fn(
      ({
        port,
        overlaySlots,
        resolveArtworkAsset,
        recordStartupMilestone,
        logger,
      }) => {
        let running = false;
        const server = {
          port,
          getStatus: vi.fn(() => ({
            running,
            host: '127.0.0.1',
            port,
            revision: 0,
            httpUrl: running ? `http://127.0.0.1:${port}` : null,
            wsUrl: running ? `ws://127.0.0.1:${port}/ws` : null,
            clients: 0,
          })),
          start: vi.fn(async () => {
            running = true;
            return server.getStatus();
          }),
          stop: vi.fn(async () => {
            running = false;
          }),
          publish: vi.fn(() => true),
          setProjectionState: vi.fn(),
          setOverlaySlots: vi.fn(),
          initialOverlaySlots: overlaySlots,
          resolveArtworkAsset,
          recordStartupMilestone,
          logger,
        };
        servers.push(server);
        return server;
      },
    );
    return { factory, servers };
  }

  it('reports the configured port before creating the server', () => {
    const { factory } = createServerFactory();
    const runtime = createOutputRuntime({
      serverFactory: factory,
      getConfig: () => ({
        outputRuntime: { autoStart: true, port: 8700, displayDelayMs: 350 },
      }),
      requireFeatureGate: vi.fn(),
    });

    expect(runtime.getStatus()).toMatchObject({
      running: false,
      host: '127.0.0.1',
      port: 8700,
      bootId: expect.any(String),
      desired: { running: true, port: 8700 },
      observed: {
        serviceLifecycle: 'stopped',
        sourceSynchronization: 'unavailable',
      },
      effective: { port: null },
    });
    expect(runtime.getSettings()).toEqual({
      autoStart: true,
      port: 8700,
      displayDelayMs: 350,
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it('accepts renderer-before-listener and listener-before-renderer handshakes', async () => {
    for (const order of ['renderer-first', 'listener-first']) {
      const { factory, servers } = createServerFactory();
      const runtime = createOutputRuntime({
        bootId: `boot-${order}`,
        serverFactory: factory,
        getConfig: () => ({
          outputRuntime: { autoStart: true, port: 8700 },
        }),
        requireFeatureGate: vi.fn(),
      });
      const source = { id: 7 };
      const full = {
        contractVersion: 3,
        bootId: `boot-${order}`,
        sourceEpoch: `epoch-${order}`,
        kind: 'full',
        revision: 1,
        payload: createEmptyOutputSnapshot({ revision: 1 }),
      };

      if (order === 'renderer-first') {
        runtime.connectSource(source);
        expect(runtime.publish(full, source)).toBe(true);
        await runtime.startConfigured();
      } else {
        await runtime.startConfigured();
        runtime.connectSource(source);
        expect(runtime.publish(full, source)).toBe(true);
      }

      expect(runtime.getStatus()).toMatchObject({
        observed: {
          serviceLifecycle: 'listening',
          sourceSynchronization: 'ready',
        },
      });
      expect(servers[0].setProjectionState).toHaveBeenLastCalledWith(
        expect.objectContaining({
          bootId: `boot-${order}`,
          sourceEpoch: `epoch-${order}`,
          sourceSynchronization: 'ready',
          snapshot: expect.objectContaining({ version: 2, revision: 1 }),
        }),
      );
    }
  });

  it('reports Output-listening and source-synchronized milestones without payload data', async () => {
    const { factory } = createServerFactory();
    const onMilestone = vi.fn();
    const runtime = createOutputRuntime({
      bootId: 'boot-trace',
      serverFactory: factory,
      getConfig: () => ({
        outputRuntime: { autoStart: true, port: 8700 },
      }),
      requireFeatureGate: vi.fn(),
      onMilestone,
    });
    const source = { id: 8 };

    await runtime.startConfigured();
    runtime.connectSource(source);
    runtime.publish(
      {
        contractVersion: 3,
        bootId: 'boot-trace',
        sourceEpoch: 'epoch-trace',
        kind: 'full',
        revision: 1,
        payload: createEmptyOutputSnapshot({ revision: 1 }),
      },
      source,
    );

    expect(onMilestone.mock.calls).toEqual([
      ['output-listening'],
      ['source-synchronized'],
    ]);
  });

  it('marks the projection unavailable when the attached renderer reloads, crashes, or closes', () => {
    const { factory } = createServerFactory();
    const runtime = createOutputRuntime({
      bootId: 'boot-lifecycle',
      serverFactory: factory,
      getConfig: () => ({
        outputRuntime: { autoStart: false, port: 8700 },
      }),
    });
    const webContents = new EventEmitter();
    webContents.id = 9;
    runtime.attachRenderer(webContents);
    runtime.connectSource(webContents);
    expect(
      runtime.publish(
        {
          contractVersion: 3,
          bootId: 'boot-lifecycle',
          sourceEpoch: 'epoch-1',
          kind: 'full',
          revision: 1,
          payload: createEmptyOutputSnapshot({ revision: 1 }),
        },
        webContents,
      ),
    ).toBe(true);

    webContents.emit('did-start-loading');
    expect(runtime.getStatus().observed).toMatchObject({
      sourceSynchronization: 'unavailable',
      unavailableReason: 'renderer_loading',
    });

    runtime.connectSource(webContents);
    webContents.emit('render-process-gone');
    expect(runtime.getStatus().observed).toMatchObject({
      sourceSynchronization: 'unavailable',
      unavailableReason: 'renderer_crashed',
    });

    runtime.connectSource(webContents);
    webContents.emit('destroyed');
    expect(runtime.getStatus().observed).toMatchObject({
      sourceSynchronization: 'unavailable',
      unavailableReason: 'renderer_destroyed',
    });
  });

  it('detaches lifecycle listeners when the renderer is replaced', () => {
    const runtime = createOutputRuntime({
      getConfig: () => ({
        outputRuntime: { autoStart: false, port: 8700 },
      }),
    });
    const first = new EventEmitter();
    first.id = 10;
    const second = new EventEmitter();
    second.id = 11;

    runtime.attachRenderer(first);
    runtime.attachRenderer(second);

    expect(first.listenerCount('did-start-loading')).toBe(0);
    expect(first.listenerCount('render-process-gone')).toBe(0);
    expect(first.listenerCount('destroyed')).toBe(0);
    expect(second.listenerCount('did-start-loading')).toBe(1);
  });

  it('rejects missing or non-active renderer identities', () => {
    const runtime = createOutputRuntime({
      bootId: 'boot-source-identity',
      getConfig: () => ({
        outputRuntime: { autoStart: false, port: 8700 },
      }),
    });
    const attached = new EventEmitter();
    attached.id = 12;
    const other = { id: 13 };
    runtime.attachRenderer(attached);

    expect(runtime.connectSource({})).toMatchObject({
      observed: { sourceSynchronization: 'unavailable' },
    });
    runtime.connectSource(attached);
    expect(runtime.connectSource(other)).toMatchObject({
      observed: { sourceSynchronization: 'syncing' },
    });
    expect(runtime.publish({}, {})).toBe(false);
    expect(runtime.publish({}, other)).toBe(false);
  });

  it('accepts an IPC sender wrapper for the attached renderer id', () => {
    const runtime = createOutputRuntime({
      bootId: 'boot-source-wrapper',
      getConfig: () => ({
        outputRuntime: { autoStart: false, port: 8700 },
      }),
    });
    const attached = new EventEmitter();
    attached.id = 14;
    const ipcSender = { id: 14 };
    runtime.attachRenderer(attached);

    expect(runtime.connectSource(ipcSender)).toMatchObject({
      observed: { sourceSynchronization: 'syncing' },
    });
    expect(
      runtime.publish(
        {
          contractVersion: 3,
          bootId: 'boot-source-wrapper',
          sourceEpoch: 'epoch-wrapper',
          kind: 'full',
          revision: 1,
          payload: createEmptyOutputSnapshot({ revision: 1 }),
        },
        ipcSender,
      ),
    ).toBe(true);
  });

  it('starts automatically only when configured and gate-authorized', async () => {
    const { factory, servers } = createServerFactory();
    let config = { outputRuntime: { autoStart: false, port: 8700 } };
    const requireFeatureGate = vi.fn();
    const runtime = createOutputRuntime({
      serverFactory: factory,
      getConfig: () => config,
      requireFeatureGate,
      featureId: 'public-output-flow',
    });

    await expect(runtime.startConfigured()).resolves.toMatchObject({
      running: false,
    });
    expect(requireFeatureGate).not.toHaveBeenCalled();

    config = { outputRuntime: { autoStart: true, port: 8700 } };
    await expect(runtime.startConfigured()).resolves.toMatchObject({
      running: true,
      port: 8700,
    });
    expect(requireFeatureGate).toHaveBeenCalledWith('public-output-flow');
    expect(servers[0].start).toHaveBeenCalledOnce();
  });

  it('reconciles a running service back to persisted desired state', async () => {
    const { factory, servers } = createServerFactory();
    let config = { outputRuntime: { autoStart: true, port: 8700 } };
    const runtime = createOutputRuntime({
      serverFactory: factory,
      getConfig: () => config,
      requireFeatureGate: vi.fn(),
    });
    await runtime.startConfigured();

    config = { outputRuntime: { autoStart: false, port: 8702 } };
    await expect(
      runtime.reconcileConfigured({ forceRestart: true }),
    ).resolves.toMatchObject({
      running: false,
      port: 8702,
      desired: { running: false, port: 8702 },
      observed: { serviceLifecycle: 'stopped' },
    });
    expect(servers[0].stop).toHaveBeenCalledOnce();
    expect(servers).toHaveLength(1);
  });

  it('leaves the service stopped when automatic start is not gate-authorized', async () => {
    const { factory } = createServerFactory();
    const runtime = createOutputRuntime({
      serverFactory: factory,
      getConfig: () => ({
        outputRuntime: { autoStart: true, port: 8700 },
      }),
      requireFeatureGate: vi.fn(() => {
        throw new Error('feature gate required: public-output-flow');
      }),
    });

    await expect(runtime.startConfigured()).resolves.toMatchObject({
      running: false,
      port: 8700,
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it('recreates a running server when the persisted port changes', async () => {
    const { factory, servers } = createServerFactory();
    let config = { outputRuntime: { autoStart: true, port: 8700 } };
    const runtime = createOutputRuntime({
      serverFactory: factory,
      getConfig: () => config,
      requireFeatureGate: vi.fn(),
    });
    await runtime.start();

    config = { outputRuntime: { autoStart: true, port: 8702 } };
    await expect(runtime.reconfigure()).resolves.toMatchObject({
      running: true,
      port: 8702,
    });
    expect(servers[0].stop).toHaveBeenCalledOnce();
    expect(servers[1].start).toHaveBeenCalledOnce();
  });

  it('keeps overlay slots across lazy creation and port changes', async () => {
    const { factory, servers } = createServerFactory();
    let config = { outputRuntime: { autoStart: true, port: 8700 } };
    const runtime = createOutputRuntime({
      serverFactory: factory,
      getConfig: () => config,
      requireFeatureGate: vi.fn(),
    });
    const slots = { lyrics: { templateId: 'focus-line' } };

    runtime.setOverlaySlots(slots);
    await runtime.start();
    expect(servers[0].initialOverlaySlots).toEqual(slots);

    runtime.setOverlaySlots({
      ...slots,
      setlist: { templateId: 'queue-board' },
    });
    expect(servers[0].setOverlaySlots).toHaveBeenCalledOnce();

    config = { outputRuntime: { autoStart: true, port: 8702 } };
    await runtime.reconfigure();
    expect(servers[1].initialOverlaySlots).toMatchObject({
      lyrics: { templateId: 'focus-line' },
      setlist: { templateId: 'queue-board' },
    });
  });

  it('passes the artwork resolver through every server creation', async () => {
    const { factory, servers } = createServerFactory();
    const resolveArtworkAsset = vi.fn();
    const runtime = createOutputRuntime({
      serverFactory: factory,
      getConfig: () => ({
        outputRuntime: { autoStart: true, port: 8700 },
      }),
      requireFeatureGate: vi.fn(),
      resolveArtworkAsset,
    });

    await runtime.start();
    expect(servers[0].resolveArtworkAsset).toBe(resolveArtworkAsset);
  });

  it('passes the runtime logger through every server creation', async () => {
    const { factory, servers } = createServerFactory();
    const logger = { warn: vi.fn(), error: vi.fn() };
    const runtime = createOutputRuntime({
      serverFactory: factory,
      getConfig: () => ({
        outputRuntime: { autoStart: true, port: 8700 },
      }),
      requireFeatureGate: vi.fn(),
      logger,
    });

    await runtime.start();
    expect(servers[0].logger).toBe(logger);
  });

  it('exposes overlay telemetry only when an explicit recorder is injected', async () => {
    const { factory, servers } = createServerFactory();
    const recordOverlayMilestone = vi.fn();
    const runtime = createOutputRuntime({
      serverFactory: factory,
      getConfig: () => ({
        outputRuntime: { autoStart: true, port: 8700 },
      }),
      requireFeatureGate: vi.fn(),
      recordOverlayMilestone,
    });
    await runtime.start();
    expect(servers[0].recordStartupMilestone).toBe(recordOverlayMilestone);

    const withoutTrace = createOutputRuntime({
      serverFactory: factory,
      getConfig: () => ({
        outputRuntime: { autoStart: true, port: 8701 },
      }),
      requireFeatureGate: vi.fn(),
    });
    await withoutTrace.start();
    expect(servers[1].recordStartupMilestone).toBeNull();
  });

  it('retains a startup error in status for renderer diagnostics', async () => {
    const failure = Object.assign(new Error('listen EADDRINUSE'), {
      code: 'EADDRINUSE',
    });
    const serverFactory = vi.fn(({ port }) => ({
      getStatus: () => ({ running: false, port }),
      start: vi.fn().mockRejectedValue(failure),
      stop: vi.fn(),
      publish: vi.fn(),
    }));
    const runtime = createOutputRuntime({
      serverFactory,
      getConfig: () => ({
        outputRuntime: { autoStart: true, port: 8700 },
      }),
      requireFeatureGate: vi.fn(),
    });

    await expect(runtime.startConfigured()).rejects.toBe(failure);
    expect(runtime.getStatus()).toMatchObject({
      running: false,
      port: 8700,
      error: {
        code: 'EADDRINUSE',
        message: 'listen EADDRINUSE',
      },
    });
  });
});
