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

// Fake for the independent manifest-signing layer (ADR 0018) — most tests
// here are about electron-updater's own state machine and don't care about
// manifest verification, so they inject a client that always reports the
// requested version as valid, matching the shape
// electron/lib/updateManifestClient.js's fetchManifest() returns on success.
function passingManifestClient() {
  return {
    fetchManifest: vi.fn(async (version) => ({
      status: 'ok',
      value: { version, signature: 'stub' },
    })),
  };
}
const passingVerifyManifestFn = () => ({ ok: true });

function createIntervalSchedule() {
  const calls = [];
  const schedule = vi.fn((callback, intervalMs) => {
    const timer = { unref: vi.fn() };
    calls.push({ callback, intervalMs, timer });
    return timer;
  });
  return { schedule, calls };
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
      downloadBytesPerSecond: null,
      downloadEtaSeconds: null,
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
      downloadBytesPerSecond: null,
      downloadEtaSeconds: null,
      releaseDate: '2026-08-22T05:00:00.000Z',
      error: null,
    });
    expect(JSON.stringify(published.at(-1))).not.toContain('installer.exe');
    expect(JSON.stringify(published.at(-1))).not.toContain('script');

    updater.emit('download-progress', {
      percent: 42.26,
      bytesPerSecond: 3_145_728.7,
      transferred: 40_000_000,
      total: 90_000_000,
    });
    expect(service.getStatus()).toMatchObject({
      phase: 'downloading',
      progress: 42.3,
      downloadBytesPerSecond: 3_145_729,
      downloadEtaSeconds: 16,
    });
    updater.emit('update-downloaded', { version: '0.2.0' });
    expect(service.getStatus()).toMatchObject({
      phase: 'downloaded',
      progress: 100,
      downloadBytesPerSecond: null,
      downloadEtaSeconds: null,
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
      manifestClient: passingManifestClient(),
      verifyManifestFn: passingVerifyManifestFn,
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

  it('resolves to an error instead of hanging in "checking" forever when the check stalls', async () => {
    const updater = createUpdater();
    updater.checkForUpdates.mockReturnValue(new Promise(() => {})); // never settles
    const logger = { error: vi.fn() };
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: true,
      runtimeEnabled: true,
      updaterFactory: () => updater,
      logger,
      checkTimeoutMs: 10,
    });

    await expect(service.check()).resolves.toMatchObject({
      phase: 'error',
      error: '無法完成更新操作，請稍後再試。',
    });
    expect(logger.error).toHaveBeenCalledWith(
      '[update] Check failed',
      expect.objectContaining({
        message: expect.stringContaining('timed out'),
      }),
    );
    // Recovered to 'error', not stuck — a retry is possible without restarting
    // the app, unlike the bug this timeout replaces.
    expect(service.getStatus().phase).not.toBe('checking');
  });

  it('still applies a late update-available result after the check already timed out', async () => {
    const updater = createUpdater();
    let resolveCheck;
    updater.checkForUpdates.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      }),
    );
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: true,
      runtimeEnabled: true,
      updaterFactory: () => updater,
      checkTimeoutMs: 10,
    });

    await expect(service.check()).resolves.toMatchObject({ phase: 'error' });

    // electron-updater's real result arrives through its own event, not the
    // promise this timeout raced against — that event must still land even
    // though check() already gave up and reported an error.
    updater.emit('update-available', { version: '0.2.0' });
    resolveCheck(undefined);
    await Promise.resolve();

    expect(service.getStatus()).toMatchObject({
      phase: 'available',
      availableVersion: '0.2.0',
    });
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
      manifestClient: passingManifestClient(),
      verifyManifestFn: passingVerifyManifestFn,
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

  it('runs the background recheck only from idle, not-available, or error phases', async () => {
    const updater = createUpdater();
    const { schedule: scheduleInterval, calls } = createIntervalSchedule();
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: true,
      runtimeEnabled: true,
      updaterFactory: () => updater,
      scheduleInterval,
    });

    expect(service.scheduleRecheck(21_600_000)).toBe(true);
    expect(service.scheduleRecheck(21_600_000)).toBe(false);
    expect(scheduleInterval).toHaveBeenCalledWith(
      expect.any(Function),
      21_600_000,
    );
    expect(calls[0].timer.unref).toHaveBeenCalledOnce();

    const tick = calls[0].callback;

    tick();
    await Promise.resolve();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);

    updater.emit('update-available', { version: '0.2.0' });
    tick();
    await Promise.resolve();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);

    updater.emit('update-downloaded', { version: '0.2.0' });
    tick();
    await Promise.resolve();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);

    updater.emit('update-not-available');
    tick();
    await Promise.resolve();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('blocks the download and fails closed when the signed manifest cannot be fetched', async () => {
    const updater = createUpdater();
    const manifestClient = {
      fetchManifest: vi
        .fn()
        .mockResolvedValue({ status: 'error', reason: 'offline' }),
    };
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: true,
      runtimeEnabled: true,
      updaterFactory: () => updater,
      manifestClient,
    });
    service.initialize();
    updater.emit('update-available', { version: '0.2.0' });

    await expect(service.download()).resolves.toMatchObject({
      phase: 'error',
      error: '更新驗證失敗，請稍後再試。',
    });
    expect(manifestClient.fetchManifest).toHaveBeenCalledWith('0.2.0');
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('blocks the download when the manifest signature does not verify', async () => {
    const updater = createUpdater();
    const manifestClient = {
      fetchManifest: vi.fn().mockResolvedValue({
        status: 'ok',
        value: { version: '0.2.0', signature: 'forged' },
      }),
    };
    const verifyManifestFn = vi.fn(() => ({
      ok: false,
      reason: 'signature-mismatch',
    }));
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: true,
      runtimeEnabled: true,
      updaterFactory: () => updater,
      manifestClient,
      verifyManifestFn,
    });
    service.initialize();
    updater.emit('update-available', { version: '0.2.0' });

    await expect(service.download()).resolves.toMatchObject({
      phase: 'error',
      error: '更新驗證失敗，請稍後再試。',
    });
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('blocks the download when the manifest declares a different version than electron-updater reported', async () => {
    const updater = createUpdater();
    const manifestClient = {
      // A stale/wrong manifest for a different release — must not be
      // accepted just because *some* validly-signed manifest exists.
      fetchManifest: vi.fn().mockResolvedValue({
        status: 'ok',
        value: { version: '0.1.9', signature: 'stub' },
      }),
    };
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: true,
      runtimeEnabled: true,
      updaterFactory: () => updater,
      manifestClient,
      verifyManifestFn: passingVerifyManifestFn,
    });
    service.initialize();
    updater.emit('update-available', { version: '0.2.0' });

    await expect(service.download()).resolves.toMatchObject({
      phase: 'error',
      error: '更新驗證失敗，請稍後再試。',
    });
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('proceeds to download once the signed manifest matches and verifies', async () => {
    const updater = createUpdater();
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: true,
      runtimeEnabled: true,
      updaterFactory: () => updater,
      manifestClient: passingManifestClient(),
      verifyManifestFn: passingVerifyManifestFn,
    });
    service.initialize();
    updater.emit('update-available', { version: '0.2.0' });

    await expect(service.download()).resolves.toMatchObject({
      phase: 'downloading',
    });
    expect(updater.downloadUpdate).toHaveBeenCalledOnce();
  });

  it('lets the auto-check preference gate the automatic paths without touching manual actions', async () => {
    const updater = createUpdater();
    const { schedule: scheduleInterval, calls } = createIntervalSchedule();
    let startupCallback;
    const startupTimer = { unref: vi.fn() };
    const schedule = vi.fn((callback) => {
      startupCallback = callback;
      return startupTimer;
    });
    const service = createAppUpdateService({
      currentVersion: '0.1.0',
      isPackaged: true,
      isWindows: true,
      runtimeEnabled: true,
      autoCheckEnabled: false,
      updaterFactory: () => updater,
      schedule,
      scheduleInterval,
    });

    expect(service.scheduleStartupCheck(15000)).toBe(false);
    expect(startupCallback).toBeUndefined();

    // Recheck still arms (so the preference can be turned back on without a
    // relaunch) but its callback stays inert while auto-checks are off.
    expect(service.scheduleRecheck(21_600_000)).toBe(true);
    calls[0].callback();
    await Promise.resolve();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();

    // Manual check is unaffected by the preference.
    await service.check();
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();

    // Re-enabling resumes the armed recheck.
    service.setAutoCheckEnabled(true);
    updater.emit('update-not-available');
    calls[0].callback();
    await Promise.resolve();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });
});
