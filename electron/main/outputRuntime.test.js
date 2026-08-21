import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import outputRuntimeModule from './outputRuntime.js';

const { registerOutputRuntimeLifecycle } = outputRuntimeModule;

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
