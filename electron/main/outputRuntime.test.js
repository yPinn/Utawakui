import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import outputRuntimeModule from './outputRuntime.js';

const { createOutputRuntime, registerOutputRuntimeLifecycle } =
  outputRuntimeModule;

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
});

describe('outputRuntime controller', () => {
  function createServerFactory() {
    const servers = [];
    const factory = vi.fn(({ port, overlaySlots, resolveArtworkAsset }) => {
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
        setOverlaySlots: vi.fn(),
        initialOverlaySlots: overlaySlots,
        resolveArtworkAsset,
      };
      servers.push(server);
      return server;
    });
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
    });
    expect(runtime.getSettings()).toEqual({
      autoStart: true,
      port: 8700,
      displayDelayMs: 350,
    });
    expect(factory).not.toHaveBeenCalled();
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
