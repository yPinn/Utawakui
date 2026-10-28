import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { registerDiagnosticsLifecycle } from './diagnosticsLifecycle.js';

function createTargets() {
  return {
    app: new EventEmitter(),
    processTarget: new EventEmitter(),
    record: vi.fn(() => ({ ok: true })),
  };
}

describe('registerDiagnosticsLifecycle', () => {
  it('monitors fatal exceptions without installing handlers that change exit semantics', () => {
    const { app, processTarget, record } = createTargets();

    registerDiagnosticsLifecycle({
      app,
      processTarget,
      service: { record },
    });

    expect(processTarget.listenerCount('uncaughtExceptionMonitor')).toBe(1);
    expect(processTarget.listenerCount('uncaughtException')).toBe(0);
    expect(processTarget.listenerCount('unhandledRejection')).toBe(0);

    const error = new Error('fatal C:\\Users\\Alice\\private.txt');
    processTarget.emit('uncaughtExceptionMonitor', error, 'unhandledRejection');

    expect(record).toHaveBeenCalledWith({
      process: 'main',
      level: 'error',
      source: 'process',
      operation: 'uncaught-exception',
      code: 'UNCAUGHT_EXCEPTION',
      error,
      context: { fatal: true, reason: 'unhandledRejection' },
    });
  });

  it('records warn-mode unhandled rejections from the process warning', () => {
    const { app, processTarget, record } = createTargets();
    registerDiagnosticsLifecycle({ app, processTarget, service: { record } });
    const warning = (message, name = 'UnhandledPromiseRejectionWarning') =>
      Object.assign(new Error(message), { name });

    processTarget.emit(
      'warning',
      warning('Error: lost update\n    at publish (C:\\app\\main.js:1:2)'),
    );
    processTarget.emit(
      'warning',
      warning('Unhandled promise rejection. This error originated either …'),
    );
    processTarget.emit('warning', warning('deprecated', 'DeprecationWarning'));

    expect(record).toHaveBeenCalledOnce();
    expect(record.mock.calls[0][0]).toMatchObject({
      operation: 'unhandled-rejection',
      code: 'UNHANDLED_REJECTION',
      context: { fatal: false },
    });
    expect(record.mock.calls[0][0].error.message).toBe('Error: lost update');
    expect(record.mock.calls[0][0].error.stack).toContain('at publish');
    expect(processTarget.listenerCount('unhandledRejection')).toBe(0);
  });

  it('records renderer and child process termination without URLs or command lines', () => {
    const { app, processTarget, record } = createTargets();
    const mainWebContents = {};
    const requestRendererRecovery = vi.fn();
    registerDiagnosticsLifecycle({
      app,
      processTarget,
      service: { record },
      getMainWebContents: () => mainWebContents,
      requestRendererRecovery,
    });

    app.emit('render-process-gone', {}, mainWebContents, {
      reason: 'crashed',
      exitCode: 9,
    });
    app.emit(
      'child-process-gone',
      {},
      {
        type: 'GPU',
        reason: 'abnormal-exit',
        exitCode: 12,
        name: 'private-name',
        serviceName: 'private-service',
      },
    );

    expect(record).toHaveBeenNthCalledWith(1, {
      process: 'main',
      level: 'error',
      source: 'electron',
      operation: 'render-process-gone',
      code: 'RENDER_PROCESS_GONE',
      message: 'Renderer process exited',
      context: { fatal: true, reason: 'crashed', exitCode: 9 },
    });
    expect(record).toHaveBeenNthCalledWith(2, {
      process: 'main',
      level: 'error',
      source: 'electron',
      operation: 'child-process-gone',
      code: 'CHILD_PROCESS_GONE',
      message: 'Electron child process exited',
      context: {
        fatal: false,
        processType: 'GPU',
        reason: 'abnormal-exit',
        exitCode: 12,
      },
    });
    expect(requestRendererRecovery).toHaveBeenCalledOnce();
    expect(requestRendererRecovery).toHaveBeenCalledWith('renderer-crashed');
  });

  it('attaches bounded webContents lifecycle listeners', () => {
    const { app, processTarget, record } = createTargets();
    const webContents = new EventEmitter();
    const requestRendererRecovery = vi.fn();
    registerDiagnosticsLifecycle({
      app,
      processTarget,
      service: { record },
      getMainWebContents: () => webContents,
      requestRendererRecovery,
    });
    app.emit('web-contents-created', {}, webContents);

    webContents.emit(
      'did-fail-load',
      {},
      -6,
      'ERR_FILE_NOT_FOUND C:\\private',
      'file:///C:/private/index.html',
      true,
    );
    webContents.emit('unresponsive');
    const preloadError = new Error('preload failed');
    webContents.emit(
      'preload-error',
      {},
      'C:\\private\\preload.js',
      preloadError,
    );

    expect(record).toHaveBeenNthCalledWith(1, {
      process: 'main',
      level: 'error',
      source: 'electron',
      operation: 'did-fail-load',
      code: 'RENDERER_LOAD_FAILED',
      message: 'Renderer failed to load',
      context: { errorCode: -6, reason: 'ERR_FILE_NOT_FOUND C:\\private' },
    });
    expect(record).toHaveBeenNthCalledWith(2, {
      process: 'main',
      level: 'warning',
      source: 'electron',
      operation: 'unresponsive',
      code: 'RENDERER_UNRESPONSIVE',
      message: 'Renderer became unresponsive',
    });
    expect(record).toHaveBeenNthCalledWith(3, {
      process: 'main',
      level: 'error',
      source: 'electron',
      operation: 'preload-error',
      code: 'PRELOAD_FAILED',
      error: preloadError,
    });
    expect(requestRendererRecovery.mock.calls).toEqual([
      ['renderer-load-failed'],
      ['renderer-unresponsive'],
      ['renderer-preload-failed'],
    ]);
  });

  it('removes every installed listener during cleanup', () => {
    const { app, processTarget, record } = createTargets();
    const webContents = new EventEmitter();
    const cleanup = registerDiagnosticsLifecycle({
      app,
      processTarget,
      service: { record },
    });
    app.emit('web-contents-created', {}, webContents);

    cleanup();
    processTarget.emit(
      'uncaughtExceptionMonitor',
      new Error('late'),
      'uncaughtException',
    );
    app.emit('render-process-gone', {}, {}, { reason: 'crashed', exitCode: 1 });
    webContents.emit('unresponsive');
    processTarget.emit(
      'warning',
      Object.assign(new Error('Error: late'), {
        name: 'UnhandledPromiseRejectionWarning',
      }),
    );

    expect(record).not.toHaveBeenCalled();
    expect(processTarget.listenerCount('warning')).toBe(0);
  });

  it('treats nonfatal renderer exits categorically and ignores subframe load failures', () => {
    const { app, processTarget, record } = createTargets();
    const webContents = new EventEmitter();
    registerDiagnosticsLifecycle({
      app,
      processTarget,
      service: { record },
    });

    app.emit(
      'render-process-gone',
      {},
      {},
      {
        reason: 'clean-exit',
        exitCode: 0,
      },
    );
    app.emit('web-contents-created', {}, webContents);
    webContents.emit(
      'did-fail-load',
      {},
      -3,
      'ERR_ABORTED',
      'https://private.example/frame',
      false,
    );

    expect(record).toHaveBeenCalledOnce();
    expect(record.mock.calls[0][0].context.fatal).toBe(false);
  });

  it('grades exits by reason so routine exits never count as errors', () => {
    const { app, processTarget, record } = createTargets();
    registerDiagnosticsLifecycle({
      app,
      processTarget,
      service: { record },
    });

    const renderExit = (reason) =>
      app.emit('render-process-gone', {}, {}, { reason, exitCode: 0 });
    const childExit = (reason) =>
      app.emit('child-process-gone', {}, { type: 'Utility', reason });
    renderExit('clean-exit');
    renderExit('killed');
    renderExit('oom');
    childExit('clean-exit');
    childExit('memory-eviction');
    childExit('abnormal-exit');

    expect(record.mock.calls.map(([event]) => event.level)).toEqual([
      'info',
      'warning',
      'error',
      'info',
      'warning',
      'error',
    ]);
  });

  it('names the failing window by its tagged role', () => {
    const { app, processTarget, record } = createTargets();
    const performer = new EventEmitter();
    const untagged = new EventEmitter();
    const roles = new Map([[performer, 'performer']]);
    registerDiagnosticsLifecycle({
      app,
      processTarget,
      service: { record },
      webContentsRoleOf: (contents) => roles.get(contents),
    });
    app.emit('web-contents-created', {}, performer);
    app.emit('web-contents-created', {}, untagged);

    performer.emit('unresponsive');
    app.emit('render-process-gone', {}, performer, { reason: 'oom' });
    untagged.emit('unresponsive');

    expect(record.mock.calls[0][0].context).toEqual({
      windowRole: 'performer',
    });
    expect(record.mock.calls[1][0].context).toMatchObject({
      fatal: true,
      windowRole: 'performer',
    });
    expect(record.mock.calls[2][0]).not.toHaveProperty('context');
  });

  it('skips aborted main-frame loads without recovering the renderer', () => {
    const { app, processTarget, record } = createTargets();
    const webContents = new EventEmitter();
    const requestRendererRecovery = vi.fn();
    registerDiagnosticsLifecycle({
      app,
      processTarget,
      service: { record },
      getMainWebContents: () => webContents,
      requestRendererRecovery,
    });
    app.emit('web-contents-created', {}, webContents);

    webContents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'x', true);

    expect(record).not.toHaveBeenCalled();
    expect(requestRendererRecovery).not.toHaveBeenCalled();
  });

  it('does not recover companion renderers or nonfatal main exits', () => {
    const { app, processTarget, record } = createTargets();
    const mainWebContents = new EventEmitter();
    const performerWebContents = new EventEmitter();
    const requestRendererRecovery = vi.fn();
    registerDiagnosticsLifecycle({
      app,
      processTarget,
      service: { record },
      getMainWebContents: () => mainWebContents,
      requestRendererRecovery,
    });

    app.emit('render-process-gone', {}, mainWebContents, {
      reason: 'clean-exit',
      exitCode: 0,
    });
    app.emit('render-process-gone', {}, performerWebContents, {
      reason: 'crashed',
      exitCode: 9,
    });
    app.emit('web-contents-created', {}, performerWebContents);
    performerWebContents.emit('unresponsive');

    expect(requestRendererRecovery).not.toHaveBeenCalled();
  });

  it('tolerates missing Electron termination details', () => {
    const { app, processTarget, record } = createTargets();
    registerDiagnosticsLifecycle({
      app,
      processTarget,
      service: { record },
    });

    app.emit('render-process-gone', {}, {}, undefined);
    app.emit('child-process-gone', {}, undefined);

    expect(record).toHaveBeenCalledTimes(2);
  });

  it('releases webContents listeners as soon as that contents is destroyed', () => {
    const { app, processTarget, record } = createTargets();
    const webContents = new EventEmitter();
    registerDiagnosticsLifecycle({
      app,
      processTarget,
      service: { record },
    });
    app.emit('web-contents-created', {}, webContents);

    webContents.emit('destroyed');
    webContents.emit('unresponsive');

    expect(webContents.listenerCount('did-fail-load')).toBe(0);
    expect(webContents.listenerCount('unresponsive')).toBe(0);
    expect(webContents.listenerCount('preload-error')).toBe(0);
    expect(record).not.toHaveBeenCalled();
  });
});
