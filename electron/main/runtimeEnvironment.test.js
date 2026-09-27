import path from 'node:path';
import { describe, expect, it } from 'vitest';
import runtimeEnvironmentModule from './runtimeEnvironment.js';

const {
  detectPackagedRuntime,
  readDeveloperOptions,
  resolvePackagedUpdateConfigPath,
} = runtimeEnvironmentModule;

describe('packaged runtime detection', () => {
  it('recognizes the builder-owned app.asar even when Electron calls itself a default app', () => {
    const resourcesPath = path.resolve('release', 'win-unpacked', 'resources');

    expect(
      detectPackagedRuntime({
        appPath: path.join(resourcesPath, 'app.asar'),
        resourcesPath,
      }),
    ).toBe(true);
  });

  it('keeps source and unpacked app-directory launches in development mode', () => {
    const resourcesPath = path.resolve(
      'node_modules',
      'electron',
      'dist',
      'resources',
    );

    expect(
      detectPackagedRuntime({ appPath: process.cwd(), resourcesPath }),
    ).toBe(false);
    expect(
      detectPackagedRuntime({
        appPath: path.join(resourcesPath, 'app'),
        resourcesPath,
      }),
    ).toBe(false);
  });

  it('fails closed for missing, relative, or nested app paths', () => {
    const resourcesPath = path.resolve('release', 'win-unpacked', 'resources');

    expect(detectPackagedRuntime({ appPath: null, resourcesPath })).toBe(false);
    expect(
      detectPackagedRuntime({ appPath: 'resources/app.asar', resourcesPath }),
    ).toBe(false);
    expect(
      detectPackagedRuntime({
        appPath: path.join(resourcesPath, 'nested', 'app.asar'),
        resourcesPath,
      }),
    ).toBe(false);
  });

  it('uses the packaged update config only for the known Electron heuristic mismatch', () => {
    const resourcesPath = path.resolve('release', 'win-unpacked', 'resources');

    expect(
      resolvePackagedUpdateConfigPath({
        isPackagedRuntime: true,
        isElectronPackaged: false,
        resourcesPath,
      }),
    ).toBe(path.join(resourcesPath, 'app-update.yml'));
    expect(
      resolvePackagedUpdateConfigPath({
        isPackagedRuntime: false,
        isElectronPackaged: false,
        resourcesPath,
      }),
    ).toBeNull();
    expect(
      resolvePackagedUpdateConfigPath({
        isPackagedRuntime: true,
        isElectronPackaged: true,
        resourcesPath,
      }),
    ).toBeNull();
    expect(
      resolvePackagedUpdateConfigPath({
        isPackagedRuntime: true,
        isElectronPackaged: false,
        resourcesPath: 'relative/resources',
      }),
    ).toBeNull();
  });
});

describe('developer options', () => {
  it('opens DevTools only for the explicit development command', () => {
    expect(readDeveloperOptions(['electron', '.', '--dev'])).toEqual({
      isDev: true,
      openDevTools: false,
    });
    expect(
      readDeveloperOptions(['electron', '.', '--dev', '--devtools']),
    ).toEqual({
      isDev: true,
      openDevTools: true,
    });
    expect(readDeveloperOptions(['electron', '.', '--devtools'])).toEqual({
      isDev: false,
      openDevTools: false,
    });
  });
});
