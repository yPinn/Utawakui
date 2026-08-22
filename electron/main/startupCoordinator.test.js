import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import startupCoordinatorModule from './startupCoordinator.js';

const { startInteractiveRuntime } = startupCoordinatorModule;

describe('interactive startup coordinator', () => {
  it('creates and attaches the window before optional startup work begins', async () => {
    const calls = [];
    const webContents = { id: 1 };
    const mainWindow = new EventEmitter();
    mainWindow.webContents = webContents;
    const deferredCallbacks = [];
    const createWindow = vi.fn(() => {
      calls.push('window');
      return mainWindow;
    });
    const attachRenderer = vi.fn(() => calls.push('attach'));
    const startOutput = vi.fn(async () => calls.push('output'));
    const runMigrations = vi.fn(() => calls.push('migrations'));

    const result = startInteractiveRuntime({
      attachRenderer,
      createWindow,
      defer: (callback) => deferredCallbacks.push(callback),
      runMigrations,
      startOutput,
    });

    expect(result.mainWindow).toBe(mainWindow);
    expect(calls).toEqual(['window', 'attach']);
    expect(attachRenderer).toHaveBeenCalledWith(webContents);
    expect(startOutput).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(calls).toEqual(['window', 'attach', 'output']);
    expect(runMigrations).not.toHaveBeenCalled();

    mainWindow.emit('ready-to-show');
    expect(runMigrations).not.toHaveBeenCalled();
    deferredCallbacks[0]();
    expect(calls).toEqual(['window', 'attach', 'output', 'migrations']);
    await result.outputStartup;
  });

  it('reports optional startup failures without delaying the returned window', async () => {
    const logger = { warn: vi.fn() };
    const failure = new Error('port unavailable');
    const mainWindow = new EventEmitter();
    mainWindow.webContents = { id: 1 };

    const result = startInteractiveRuntime({
      attachRenderer: vi.fn(),
      createWindow: () => mainWindow,
      defer: vi.fn(),
      logger,
      runMigrations: vi.fn(),
      startOutput: vi.fn().mockRejectedValue(failure),
    });

    expect(result.mainWindow).toBe(mainWindow);
    await expect(result.outputStartup).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      '[output] Automatic startup failed',
      'port unavailable',
    );
  });

  it('contains deferred migration failures after the window is available', () => {
    const logger = { warn: vi.fn() };
    const deferredCallbacks = [];
    const failure = new Error('migration failed');

    const mainWindow = new EventEmitter();
    mainWindow.webContents = { id: 1 };
    startInteractiveRuntime({
      attachRenderer: vi.fn(),
      createWindow: () => mainWindow,
      defer: (callback) => deferredCallbacks.push(callback),
      logger,
      runMigrations: vi.fn(() => {
        throw failure;
      }),
      startOutput: vi.fn(),
    });

    mainWindow.emit('ready-to-show');
    expect(() => deferredCallbacks[0]()).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      '[startup] Deferred migration failed',
      'migration failed',
    );
  });
});
