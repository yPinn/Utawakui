import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, afterEach } from 'vitest';
import {
  getProviderRuntimePaths,
  isProviderRuntimeInstalled,
  writePythonPathConfig,
} from './providerRuntime.js';

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-provider-'));
  tmpDirs.push(dir);
  return dir;
}

describe('getProviderRuntimePaths', () => {
  it('keeps all Python provider artifacts under one managed runtime root', () => {
    const paths = getProviderRuntimePaths(
      'C:\\Users\\User\\AppData\\Roaming\\Utawakui',
    );

    expect(paths.installDir).toBe(
      'C:\\Users\\User\\AppData\\Roaming\\Utawakui\\dependencies\\ytdlp\\current',
    );
    expect(paths.pythonPath).toBe(
      'C:\\Users\\User\\AppData\\Roaming\\Utawakui\\dependencies\\ytdlp\\current\\python\\python.exe',
    );
    expect(paths.sitePackagesDir).toBe(
      'C:\\Users\\User\\AppData\\Roaming\\Utawakui\\dependencies\\ytdlp\\current\\python\\Lib\\site-packages',
    );
    expect(paths.pluginParentDir).toBe(
      'C:\\Users\\User\\AppData\\Roaming\\Utawakui\\dependencies\\ytdlp\\current\\plugins',
    );
    expect(paths.bgutilProviderPath).toBe(
      'C:\\Users\\User\\AppData\\Roaming\\Utawakui\\dependencies\\ytdlp\\current\\bgutil\\bgutil-pot.exe',
    );
    expect(paths.cacheDir).toBe(
      'C:\\Users\\User\\AppData\\Roaming\\Utawakui\\dependencies\\ytdlp\\current\\cache',
    );
  });
});

describe('writePythonPathConfig', () => {
  it('adds Lib/site-packages to the embeddable Python path file without enabling user site packages', () => {
    const root = makeTempDir();
    const paths = getProviderRuntimePaths(root);
    fs.mkdirSync(paths.pythonDir, { recursive: true });
    fs.writeFileSync(
      path.join(paths.pythonDir, 'python314._pth'),
      ['python314.zip', '.', '#import site', ''].join('\n'),
    );

    writePythonPathConfig(paths);

    expect(
      fs.readFileSync(path.join(paths.pythonDir, 'python314._pth'), 'utf8'),
    ).toBe(
      ['python314.zip', '.', 'Lib/site-packages', '#import site', ''].join(
        '\n',
      ),
    );
  });
});

describe('isProviderRuntimeInstalled', () => {
  it('requires python, yt-dlp package, plugin package, provider exe, and manifest', () => {
    const root = makeTempDir();
    const paths = getProviderRuntimePaths(root);
    fs.mkdirSync(path.dirname(paths.pythonPath), { recursive: true });
    fs.mkdirSync(path.join(paths.sitePackagesDir, 'yt_dlp'), {
      recursive: true,
    });
    fs.mkdirSync(
      path.join(
        paths.pluginParentDir,
        'bgutil-ytdlp-pot-provider-rs',
        'yt_dlp_plugins',
      ),
      { recursive: true },
    );
    fs.mkdirSync(path.dirname(paths.bgutilProviderPath), { recursive: true });
    fs.writeFileSync(paths.pythonPath, 'python');
    fs.writeFileSync(paths.bgutilProviderPath, 'provider');
    fs.writeFileSync(paths.manifestPath, '{}');

    expect(isProviderRuntimeInstalled(paths)).toBe(true);
  });

  it('returns false when any required provider runtime artifact is missing', () => {
    const root = makeTempDir();
    const paths = getProviderRuntimePaths(root);

    expect(isProviderRuntimeInstalled(paths)).toBe(false);
  });
});
