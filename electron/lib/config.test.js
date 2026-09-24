import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ANNOUNCEMENT_VERSION_MAX_LENGTH,
  CAPTURE_DEVICE_ID_MAX_LENGTH,
  loadConfig,
  saveConfig,
} from './config.js';

describe('config', () => {
  let dir;
  let configPath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-config-test-'));
    configPath = path.join(dir, 'config.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('missing file falls back to defaults', () => {
    const config = loadConfig(configPath);
    expect(config).toEqual({
      version: 2,
      downloadDir: null,
      featureConfirmations: {},
      uiTheme: 'dark',
      sidebarWidth: 256,
      captureDeviceId: null,
      autoAnalyzeMusicStructure: true,
      separationGpuAcceleration: true,
      autoCheckAppUpdates: true,
      lastSeenAnnouncementVersion: null,
      systemFfmpegPath: null,
      outputRuntime: {
        autoStart: true,
        port: 8700,
        displayDelayMs: 0,
      },
      obsIntegration: {
        enabled: false,
        host: '127.0.0.1',
        port: 4455,
        skipThresholdMs: 10000,
      },
    });
  });

  it('round-trips downloadDir through save/load', () => {
    saveConfig(configPath, { downloadDir: '/some/path' });
    expect(loadConfig(configPath).downloadDir).toBe('/some/path');
  });

  it('leaves no leftover .tmp file after a normal save', () => {
    saveConfig(configPath, { downloadDir: '/some/path' });
    expect(fs.existsSync(`${configPath}.tmp`)).toBe(false);
  });

  it('corrupted JSON falls back to defaults and backs up the original', () => {
    fs.writeFileSync(configPath, '{ this is not valid json');
    const config = loadConfig(configPath);
    expect(config.downloadDir).toBe(null);

    const backups = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('config.json.corrupted-'));
    expect(backups).toHaveLength(1);
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it('valid JSON that is not an object falls back to defaults and backs up the original', () => {
    fs.writeFileSync(configPath, JSON.stringify(null));
    const config = loadConfig(configPath);
    expect(config).toEqual({
      version: 2,
      downloadDir: null,
      featureConfirmations: {},
      uiTheme: 'dark',
      sidebarWidth: 256,
      captureDeviceId: null,
      autoAnalyzeMusicStructure: true,
      separationGpuAcceleration: true,
      autoCheckAppUpdates: true,
      lastSeenAnnouncementVersion: null,
      systemFfmpegPath: null,
      outputRuntime: {
        autoStart: true,
        port: 8700,
        displayDelayMs: 0,
      },
      obsIntegration: {
        enabled: false,
        host: '127.0.0.1',
        port: 4455,
        skipThresholdMs: 10000,
      },
    });

    const backups = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('config.json.corrupted-'));
    expect(backups).toHaveLength(1);
  });

  it('wrong-typed downloadDir falls back to the default for that field', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ version: 1, downloadDir: 123 }),
    );
    expect(loadConfig(configPath).downloadDir).toBe(null);
  });

  it('keeps only valid feature confirmation records', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        featureConfirmations: {
          'provider-flow': {
            noticeVersion: 'feature-notice-v3',
            confirmedAt: '2026-08-13T00:00:00.000Z',
            enabled: true,
          },
          'unknown-flow': {
            noticeVersion: 'feature-notice-v3',
            confirmedAt: '2026-08-13T00:00:00.000Z',
            enabled: true,
          },
          'lyrics-flow': {
            noticeVersion: 'feature-notice-v2',
            confirmedAt: '2026-08-13T00:00:00.000Z',
            enabled: true,
          },
        },
      }),
    );

    expect(loadConfig(configPath).featureConfirmations).toEqual({
      'provider-flow': {
        featureId: 'provider-flow',
        noticeVersion: 'feature-notice-v3',
        confirmedAt: '2026-08-13T00:00:00.000Z',
        enabled: true,
      },
    });
  });

  it('an empty partial save preserves the existing downloadDir', () => {
    saveConfig(configPath, { downloadDir: '/first' });
    saveConfig(configPath, {});
    expect(loadConfig(configPath).downloadDir).toBe('/first');
  });

  it('round-trips uiTheme through save/load', () => {
    saveConfig(configPath, { uiTheme: 'light' });
    expect(loadConfig(configPath).uiTheme).toBe('light');
  });

  it('invalid uiTheme falls back to dark', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ version: 1, uiTheme: 'sepia' }),
    );
    expect(loadConfig(configPath).uiTheme).toBe('dark');
  });

  it('round-trips sidebarWidth through save/load', () => {
    saveConfig(configPath, { sidebarWidth: 200 });
    expect(loadConfig(configPath).sidebarWidth).toBe(200);
  });

  it('out-of-range sidebarWidth falls back to the default', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ version: 1, sidebarWidth: 9999 }),
    );
    expect(loadConfig(configPath).sidebarWidth).toBe(256);
  });

  it('non-numeric sidebarWidth falls back to the default', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ version: 1, sidebarWidth: 'wide' }),
    );
    expect(loadConfig(configPath).sidebarWidth).toBe(256);
  });

  it('round-trips captureDeviceId through save/load', () => {
    saveConfig(configPath, { captureDeviceId: 'device-abc' });
    expect(loadConfig(configPath).captureDeviceId).toBe('device-abc');
  });

  it('wrong-typed captureDeviceId falls back to null', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ version: 1, captureDeviceId: 42 }),
    );
    expect(loadConfig(configPath).captureDeviceId).toBe(null);
  });

  it('round-trips the automatic music-analysis preference', () => {
    saveConfig(configPath, { autoAnalyzeMusicStructure: false });
    expect(loadConfig(configPath).autoAnalyzeMusicStructure).toBe(false);
  });

  it.each([null, 1, 'true', {}])(
    'falls back to automatic music analysis for invalid value %j',
    (autoAnalyzeMusicStructure) => {
      fs.writeFileSync(
        configPath,
        JSON.stringify({ autoAnalyzeMusicStructure }),
      );
      expect(loadConfig(configPath).autoAnalyzeMusicStructure).toBe(true);
    },
  );

  it('round-trips the separation GPU acceleration preference', () => {
    saveConfig(configPath, { separationGpuAcceleration: false });
    expect(loadConfig(configPath).separationGpuAcceleration).toBe(false);
  });

  it.each([null, 1, 'true', {}])(
    'falls back to separation GPU acceleration on for invalid value %j',
    (separationGpuAcceleration) => {
      fs.writeFileSync(
        configPath,
        JSON.stringify({ separationGpuAcceleration }),
      );
      expect(loadConfig(configPath).separationGpuAcceleration).toBe(true);
    },
  );

  it('round-trips the automatic app-update check preference', () => {
    saveConfig(configPath, { autoCheckAppUpdates: false });
    expect(loadConfig(configPath).autoCheckAppUpdates).toBe(false);
  });

  it.each([null, 1, 'true', {}])(
    'falls back to automatic app-update checks for invalid value %j',
    (autoCheckAppUpdates) => {
      fs.writeFileSync(configPath, JSON.stringify({ autoCheckAppUpdates }));
      expect(loadConfig(configPath).autoCheckAppUpdates).toBe(true);
    },
  );

  it('round-trips the last seen announcement version', () => {
    saveConfig(configPath, { lastSeenAnnouncementVersion: '0.2.0' });
    expect(loadConfig(configPath).lastSeenAnnouncementVersion).toBe('0.2.0');
  });

  it.each([null, 1, {}, '', 'x'.repeat(ANNOUNCEMENT_VERSION_MAX_LENGTH + 1)])(
    'out-of-bounds lastSeenAnnouncementVersion falls back to null for %j',
    (lastSeenAnnouncementVersion) => {
      fs.writeFileSync(
        configPath,
        JSON.stringify({ lastSeenAnnouncementVersion }),
      );
      expect(loadConfig(configPath).lastSeenAnnouncementVersion).toBe(null);
    },
  );

  it.each(['', 'x'.repeat(CAPTURE_DEVICE_ID_MAX_LENGTH + 1)])(
    'out-of-bounds captureDeviceId falls back to null',
    (captureDeviceId) => {
      fs.writeFileSync(configPath, JSON.stringify({ captureDeviceId }));
      expect(loadConfig(configPath).captureDeviceId).toBe(null);
    },
  );

  it('round-trips systemFfmpegPath through save/load', () => {
    saveConfig(configPath, { systemFfmpegPath: 'C:\\ffmpeg\\bin\\ffmpeg.exe' });
    expect(loadConfig(configPath).systemFfmpegPath).toBe(
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
    );
  });

  it('wrong-typed systemFfmpegPath falls back to null', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ version: 1, systemFfmpegPath: 42 }),
    );
    expect(loadConfig(configPath).systemFfmpegPath).toBe(null);
  });

  it('migrates an existing config to the default output runtime settings', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ version: 1, downloadDir: '/existing-library' }),
    );

    expect(loadConfig(configPath)).toMatchObject({
      version: 2,
      downloadDir: '/existing-library',
      outputRuntime: {
        autoStart: true,
        port: 8700,
        displayDelayMs: 0,
      },
    });
  });

  it('round-trips valid output runtime settings', () => {
    saveConfig(configPath, {
      outputRuntime: { autoStart: false, port: 8702, displayDelayMs: 320 },
    });

    expect(loadConfig(configPath).outputRuntime).toEqual({
      autoStart: false,
      port: 8702,
      displayDelayMs: 320,
    });
  });

  it.each([
    [{ autoStart: 'yes', port: 8702, displayDelayMs: 0 }],
    [{ autoStart: false, port: 80, displayDelayMs: 0 }],
    [{ autoStart: false, port: 49152, displayDelayMs: 0 }],
    [{ autoStart: false, port: 8700.5, displayDelayMs: 0 }],
    [{ autoStart: false, port: 8700, displayDelayMs: 5001 }],
    [null],
  ])('falls back when output runtime settings are invalid: %j', (value) => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ version: 2, outputRuntime: value }),
    );

    expect(loadConfig(configPath).outputRuntime).toEqual({
      autoStart: true,
      port: 8700,
      displayDelayMs: 0,
    });
  });

  it('adds the default display delay without discarding legacy runtime settings', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 2,
        outputRuntime: { autoStart: false, port: 8702 },
      }),
    );

    expect(loadConfig(configPath).outputRuntime).toEqual({
      autoStart: false,
      port: 8702,
      displayDelayMs: 0,
    });
  });

  it('round-trips valid OBS integration settings', () => {
    saveConfig(configPath, {
      obsIntegration: {
        enabled: true,
        host: '192.168.1.5',
        port: 4456,
        skipThresholdMs: 5000,
      },
    });

    expect(loadConfig(configPath).obsIntegration).toEqual({
      enabled: true,
      host: '192.168.1.5',
      port: 4456,
      skipThresholdMs: 5000,
    });
  });

  it.each([
    [{ enabled: 'yes', host: '127.0.0.1', port: 4455, skipThresholdMs: 10000 }],
    [{ enabled: true, host: '', port: 4455, skipThresholdMs: 10000 }],
    [{ enabled: true, host: '127.0.0.1', port: 0, skipThresholdMs: 10000 }],
    [{ enabled: true, host: '127.0.0.1', port: 65536, skipThresholdMs: 10000 }],
    [
      {
        enabled: true,
        host: '127.0.0.1',
        port: 4455.5,
        skipThresholdMs: 10000,
      },
    ],
    [{ enabled: true, host: '127.0.0.1', port: 4455, skipThresholdMs: -1 }],
    [
      {
        enabled: true,
        host: '127.0.0.1',
        port: 4455,
        skipThresholdMs: 300_001,
      },
    ],
    [{ enabled: true, host: '127.0.0.1', port: 4455, skipThresholdMs: 'ten' }],
    [null],
  ])('falls back when OBS integration settings are invalid: %j', (value) => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ version: 2, obsIntegration: value }),
    );

    expect(loadConfig(configPath).obsIntegration).toEqual({
      enabled: false,
      host: '127.0.0.1',
      port: 4455,
      skipThresholdMs: 10000,
    });
  });

  it('round-trips feature confirmations through save/load', () => {
    saveConfig(configPath, {
      featureConfirmations: {
        'provider-flow': {
          featureId: 'provider-flow',
          noticeVersion: 'feature-notice-v3',
          confirmedAt: '2026-08-13T00:00:00.000Z',
          enabled: true,
        },
      },
    });

    expect(
      loadConfig(configPath).featureConfirmations['provider-flow'],
    ).toEqual({
      featureId: 'provider-flow',
      noticeVersion: 'feature-notice-v3',
      confirmedAt: '2026-08-13T00:00:00.000Z',
      enabled: true,
    });
  });
});
