import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import lifecycleModule from './heavyJobSchedulerLifecycle.js';

const { registerHeavyJobSchedulerLifecycle } = lifecycleModule;

describe('registerHeavyJobSchedulerLifecycle', () => {
  it('holds quit until scheduler shutdown settles and permits the final quit', async () => {
    const app = new EventEmitter();
    app.quit = vi.fn();
    let resolveShutdown;
    const scheduler = {
      shutdown: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveShutdown = resolve;
          }),
      ),
    };
    registerHeavyJobSchedulerLifecycle({ app, scheduler });
    const firstEvent = { preventDefault: vi.fn() };
    const repeatedEvent = { preventDefault: vi.fn() };

    app.emit('before-quit', firstEvent);
    app.emit('before-quit', repeatedEvent);
    expect(firstEvent.preventDefault).toHaveBeenCalledOnce();
    expect(repeatedEvent.preventDefault).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(scheduler.shutdown).toHaveBeenCalledOnce());
    expect(app.quit).not.toHaveBeenCalled();

    resolveShutdown();
    await vi.waitFor(() => expect(app.quit).toHaveBeenCalledOnce());
    const finalEvent = { preventDefault: vi.fn() };
    app.emit('before-quit', finalEvent);
    expect(finalEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('still releases quit when shutdown fails and logs the failure', async () => {
    const app = new EventEmitter();
    app.quit = vi.fn();
    const logger = { error: vi.fn() };
    registerHeavyJobSchedulerLifecycle({
      app,
      scheduler: { shutdown: vi.fn(async () => Promise.reject()) },
      logger,
    });

    app.emit('before-quit', { preventDefault: vi.fn() });
    await vi.waitFor(() => expect(app.quit).toHaveBeenCalledOnce());
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
