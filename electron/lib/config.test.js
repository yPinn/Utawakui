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
    expect(config).toEqual({ version: 1, downloadDir: null });
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

  it('wrong-typed downloadDir falls back to the default for that field', () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ version: 1, downloadDir: 123 }),
    );
    expect(loadConfig(configPath).downloadDir).toBe(null);
  });

  it('an empty partial save preserves the existing downloadDir', () => {
    saveConfig(configPath, { downloadDir: '/first' });
    saveConfig(configPath, {});
    expect(loadConfig(configPath).downloadDir).toBe('/first');
  });
});
