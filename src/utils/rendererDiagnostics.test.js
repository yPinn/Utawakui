import { describe, expect, it, vi } from 'vitest';
import { installRendererDiagnostics } from './rendererDiagnostics.js';

function createWindowTarget() {
  const listeners = new Map();
  return {
    addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type, listener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    }),
    emit(type, event) {
      listeners.get(type)?.(event);
    },
    listeners,
  };
}

describe('installRendererDiagnostics', () => {
  it('reports Vue errors without exposing the component instance', () => {
    const app = { config: {} };
    const windowTarget = createWindowTarget();
    const recordDiagnostic = vi.fn(() => Promise.resolve({ ok: true }));
    installRendererDiagnostics({ app, windowTarget, recordDiagnostic });
    const error = new Error('render failed');

    app.config.errorHandler(
      error,
      { privateComponent: true },
      'render function',
    );

    expect(recordDiagnostic).toHaveBeenCalledWith({
      level: 'error',
      source: 'vue',
      operation: 'uncaught-error',
      code: 'VUE_UNHANDLED_ERROR',
      message: 'render failed',
      context: { errorName: 'Error', vueInfo: 'render function' },
    });
  });

  it('reports window errors and unhandled rejections as plain bounded events', () => {
    const app = { config: {} };
    const windowTarget = createWindowTarget();
    const recordDiagnostic = vi.fn(() => Promise.resolve({ ok: true }));
    installRendererDiagnostics({ app, windowTarget, recordDiagnostic });

    windowTarget.emit('error', {
      error: new TypeError('window failed'),
      filename: 'C:\\private\\renderer.js',
    });
    windowTarget.emit('unhandledrejection', {
      reason: new Error('promise failed'),
      promise: Promise.resolve(),
    });

    expect(recordDiagnostic).toHaveBeenNthCalledWith(1, {
      level: 'error',
      source: 'renderer',
      operation: 'window-error',
      code: 'WINDOW_ERROR',
      message: 'window failed',
      context: { errorName: 'TypeError' },
    });
    expect(recordDiagnostic).toHaveBeenNthCalledWith(2, {
      level: 'error',
      source: 'renderer',
      operation: 'unhandled-rejection',
      code: 'UNHANDLED_REJECTION',
      message: 'promise failed',
      context: { errorName: 'Error' },
    });
  });

  it('swallows bridge failures and restores prior handlers during cleanup', async () => {
    const previousHandler = vi.fn();
    const app = { config: { errorHandler: previousHandler } };
    const windowTarget = createWindowTarget();
    const recordDiagnostic = vi
      .fn()
      .mockRejectedValue(new Error('diagnostics unavailable'));
    const cleanup = installRendererDiagnostics({
      app,
      windowTarget,
      recordDiagnostic,
    });

    expect(() =>
      app.config.errorHandler(new Error('boom'), null, 'watcher'),
    ).not.toThrow();
    await Promise.resolve();
    cleanup();

    expect(previousHandler).toHaveBeenCalledOnce();
    expect(app.config.errorHandler).toBe(previousHandler);
    expect(windowTarget.listeners.size).toBe(0);
  });

  it('is a no-op when the diagnostics bridge is unavailable', () => {
    const app = { config: {} };
    const windowTarget = createWindowTarget();

    const cleanup = installRendererDiagnostics({
      app,
      windowTarget,
      recordDiagnostic: null,
    });

    expect(app.config.errorHandler).toBeUndefined();
    expect(windowTarget.addEventListener).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  it('normalizes primitive and incomplete rejection values', () => {
    const app = { config: {} };
    const windowTarget = createWindowTarget();
    const recordDiagnostic = vi.fn();
    installRendererDiagnostics({ app, windowTarget, recordDiagnostic });

    windowTarget.emit('error', { message: 'plain failure' });
    windowTarget.emit('unhandledrejection', { reason: {} });
    windowTarget.emit('unhandledrejection', {});

    expect(recordDiagnostic.mock.calls.map(([event]) => event.message)).toEqual(
      ['plain failure', 'Unhandled renderer error', 'Unhandled renderer error'],
    );
    expect(recordDiagnostic.mock.calls.map(([event]) => event.context)).toEqual(
      [
        { errorName: 'UnknownError' },
        { errorName: 'UnknownError' },
        { errorName: 'UnknownError' },
      ],
    );
  });

  it('contains synchronous bridge failures and preserves a replacement Vue handler', () => {
    const app = { config: {} };
    const recordDiagnostic = vi.fn(() => {
      throw new Error('bridge unavailable');
    });
    const cleanup = installRendererDiagnostics({
      app,
      windowTarget: undefined,
      recordDiagnostic,
    });
    const replacement = vi.fn();

    expect(() => app.config.errorHandler('plain Vue error')).not.toThrow();
    app.config.errorHandler = replacement;
    cleanup();

    expect(app.config.errorHandler).toBe(replacement);
  });

  it('is a no-op without a Vue app config', () => {
    const cleanup = installRendererDiagnostics({
      app: null,
      windowTarget: createWindowTarget(),
      recordDiagnostic: vi.fn(),
    });

    expect(() => cleanup()).not.toThrow();
  });
});
