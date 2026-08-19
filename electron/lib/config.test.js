import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, saveConfig } from './config.js';

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
      version: 1,
      downloadDir: null,
      featureConfirmations: {},
      uiTheme: 'dark',
      sidebarWidth: 256,
      ytdlpStatus: {},
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
      version: 1,
      downloadDir: null,
      featureConfirmations: {},
      uiTheme: 'dark',
      sidebarWidth: 256,
      ytdlpStatus: {},
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
            noticeVersion: 'feature-notice-v1',
            confirmedAt: '2026-08-13T00:00:00.000Z',
            enabled: true,
          },
          'unknown-flow': {
            noticeVersion: 'feature-notice-v1',
            confirmedAt: '2026-08-13T00:00:00.000Z',
            enabled: true,
          },
          'lyrics-flow': {
            noticeVersion: 'old-notice',
            confirmedAt: '2026-08-13T00:00:00.000Z',
            enabled: true,
          },
        },
      }),
    );

    expect(loadConfig(configPath).featureConfirmations).toEqual({
      'provider-flow': {
        featureId: 'provider-flow',
        noticeVersion: 'feature-notice-v1',
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
    saveConfig(configPath, { sidebarWidth: 320 });
    expect(loadConfig(configPath).sidebarWidth).toBe(320);
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

  it('round-trips feature confirmations through save/load', () => {
    saveConfig(configPath, {
      featureConfirmations: {
        'provider-flow': {
          featureId: 'provider-flow',
          noticeVersion: 'feature-notice-v1',
          confirmedAt: '2026-08-13T00:00:00.000Z',
          enabled: true,
        },
      },
    });

    expect(
      loadConfig(configPath).featureConfirmations['provider-flow'],
    ).toEqual({
      featureId: 'provider-flow',
      noticeVersion: 'feature-notice-v1',
      confirmedAt: '2026-08-13T00:00:00.000Z',
      enabled: true,
    });
  });

  it('round-trips ytdlpStatus through save/load', () => {
    saveConfig(configPath, {
      ytdlpStatus: {
        lastCheckedAt: '2026-08-19T00:00:00.000Z',
        lastKnownVersion: '2026.07.04',
        lastCheckResult: 'up-to-date',
      },
    });

    expect(loadConfig(configPath).ytdlpStatus).toEqual({
      lastCheckedAt: '2026-08-19T00:00:00.000Z',
      lastKnownVersion: '2026.07.04',
      lastCheckResult: 'up-to-date',
    });
  });

  it('wrong-typed ytdlpStatus falls back to an empty object', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ version: 1, ytdlpStatus: 'not an object' }),
    );
    expect(loadConfig(configPath).ytdlpStatus).toEqual({});
  });
});
