import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import appUpdateServiceModule from './appUpdateService.js';

const { createAppUpdateService } = appUpdateServiceModule;

function createUpdater() {
  const updater = new EventEmitter();
  updater.checkForUpdates = vi.fn().mockResolvedValue(undefined);
  updater.downloadUpdate = vi.fn().mockResolvedValue(undefined);
  updater.quitAndInstall = vi.fn();
  return updater;
}

describe('app update service', () => {
  it('does not load or contact the updater while the release gate is disabled', async () => {
    const updaterFactory = vi.fn();
    const schedule = vi.fn();
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      runtimeEnabled: false,
      updaterFactory,
      schedule,
    });

    expect(service.getStatus()).toEqual({
      enabled: false,
      phase: 'disabled',
      currentVersion: '0.1.0',
      availableVersion: null,
      progress: null,
      releaseDate: null,
      error: null,
    });
    await expect(service.check()).resolves.toMatchObject({ phase: 'disabled' });
    expect(service.scheduleStartupCheck(1000)).toBe(false);
    expect(updaterFactory).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('stays disabled outside packaged Windows builds', () => {
    const updaterFactory = vi.fn();
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: false,
      runtimeEnabled: true,
      updaterFactory,
    });

    expect(service.getStatus()).toMatchObject({
      enabled: false,
      phase: 'disabled',
    });
    expect(service.initialize()).toMatchObject({ phase: 'disabled' });
    expect(updaterFactory).not.toHaveBeenCalled();
  });

  it('configures stable explicit update behavior and projects bounded events', async () => {
    const updater = createUpdater();
    const published = [];
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: true,
      runtimeEnabled: true,
      updaterFactory: () => updater,
      publishStatus: (status) => published.push(status),
    });

    service.initialize();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.allowDowngrade).toBe(false);

    updater.emit('update-available', {
      version: '0.2.0',
      releaseDate: '2026-08-22T05:00:00Z',
      path: 'C:\\private\\installer.exe',
      files: [{ url: 'https://example.invalid/private' }],
      releaseNotes: '<script>alert(1)</script>',
    });
    expect(service.getStatus()).toEqual({
      enabled: true,
      phase: 'available',
      currentVersion: '0.1.0',
      availableVersion: '0.2.0',
      progress: null,
      releaseDate: '2026-08-22T05:00:00.000Z',
      error: null,
    });
    expect(JSON.stringify(published.at(-1))).not.toContain('installer.exe');
    expect(JSON.stringify(published.at(-1))).not.toContain('script');

    updater.emit('download-progress', { percent: 42.26 });
    expect(service.getStatus()).toMatchObject({
      phase: 'downloading',
      progress: 42.3,
    });
    updater.emit('update-downloaded', { version: '0.2.0' });
    expect(service.getStatus()).toMatchObject({
      phase: 'downloaded',
      progress: 100,
    });

    expect(service.install()).toMatchObject({ phase: 'downloaded' });
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('checks once on the delayed startup schedule and keeps manual actions phase-bound', async () => {
    const updater = createUpdater();
    let scheduledCallback;
    const timer = { unref: vi.fn() };
    const schedule = vi.fn((callback) => {
      scheduledCallback = callback;
      return timer;
    });
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: true,
      runtimeEnabled: true,
      updaterFactory: () => updater,
      schedule,
    });

    expect(service.scheduleStartupCheck(15000)).toBe(true);
    expect(service.scheduleStartupCheck(15000)).toBe(false);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 15000);
    expect(timer.unref).toHaveBeenCalledOnce();
    await expect(service.download()).resolves.toMatchObject({ phase: 'idle' });
    expect(service.install()).toMatchObject({ phase: 'idle' });

    scheduledCallback();
    await Promise.resolve();
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();

    updater.emit('update-available', { version: '0.2.0' });
    await service.download();
    expect(updater.downloadUpdate).toHaveBeenCalledOnce();
  });

  it('logs technical failures but exposes only a user-safe error', async () => {
    const updater = createUpdater();
    const logger = { error: vi.fn() };
    updater.checkForUpdates.mockRejectedValue(
      new Error('request failed for https://token@example.invalid/latest.yml'),
    );
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: true,
      runtimeEnabled: true,
      updaterFactory: () => updater,
      logger,
    });

    await expect(service.check()).resolves.toMatchObject({
      phase: 'error',
      error: '無法完成更新操作，請稍後再試。',
    });
    expect(service.getStatus().error).not.toContain('token');
    expect(logger.error).toHaveBeenCalledWith(
      '[update] Check failed',
      expect.any(Error),
    );
  });

  it('contains updater initialization failures inside the safe status boundary', async () => {
    const logger = { error: vi.fn() };
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: true,
      runtimeEnabled: true,
      updaterFactory: () => {
        throw new Error('failed to load C:\\private\\app-update.yml');
      },
      logger,
    });

    await expect(service.check()).resolves.toMatchObject({
      phase: 'error',
      error: '無法完成更新操作，請稍後再試。',
    });
    expect(service.scheduleStartupCheck(15000)).toBe(false);
    expect(service.getStatus().error).not.toContain('private');
  });

  it('keeps download and install failures inside the same safe boundary', async () => {
    const updater = createUpdater();
    const logger = { error: vi.fn() };
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: true,
      runtimeEnabled: true,
      updaterFactory: () => updater,
      logger,
    });
    service.initialize();

    updater.emit('checking-for-update');
    expect(service.getStatus().phase).toBe('checking');
    updater.emit('update-not-available');
    expect(service.getStatus().phase).toBe('not-available');

    updater.emit('update-available', { version: '0.2.0' });
    updater.downloadUpdate.mockRejectedValueOnce(
      new Error('download failed at C:\\private\\update.exe'),
    );
    await expect(service.download()).resolves.toMatchObject({
      phase: 'error',
      availableVersion: '0.2.0',
      error: '無法完成更新操作，請稍後再試。',
    });

    updater.emit('update-downloaded', { version: '0.2.0' });
    updater.quitAndInstall.mockImplementationOnce(() => {
      throw new Error('installer launch failed');
    });
    expect(service.install()).toMatchObject({
      phase: 'error',
      error: '無法完成更新操作，請稍後再試。',
    });
    expect(logger.error).toHaveBeenCalledWith(
      '[update] Download failed',
      expect.any(Error),
    );
    expect(logger.error).toHaveBeenCalledWith(
      '[update] Install failed',
      expect.any(Error),
    );
  });
});
