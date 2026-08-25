import path from 'node:path';
import { describe, expect, it } from 'vitest';
import dependencyRegistry from '../../../shared/featureDependencies.json';
import gateRegistry from '../../../shared/featureGates.json';
import { FEATURE_IDS } from '../featureGates.js';
import {
  FFMPEG_DEPENDENCY_ID,
  YTDLP_DEPENDENCY_ID,
  getFeatureDependency,
  getFeatureDependencies,
  getFfmpegPaths,
  getManagedDependencyCleanupPaths,
  getManagedDependencyInstallDir,
  getModelDependencyPaths,
  getYtdlpPaths,
} from './registry.js';

describe('feature dependency product units', () => {
  it('maps every active dependency to one registered feature gate', () => {
    const gateIds = gateRegistry.features.map((feature) => feature.id);
    const active = getFeatureDependencies();

    expect(new Set(active.map((dependency) => dependency.id)).size).toBe(
      active.length,
    );
    expect(Object.values(FEATURE_IDS).sort()).toEqual([...gateIds].sort());
    for (const dependency of active) {
      expect(gateIds).toContain(dependency.featureId);
    }
  });

  it('treats the provider runtime as one atomic four-artifact unit', () => {
    const providerUnits = getFeatureDependencies().filter(
      (dependency) => dependency.featureId === FEATURE_IDS.PROVIDER_FLOW,
    );

    expect(providerUnits).toHaveLength(1);
    expect(providerUnits[0]).toMatchObject({
      id: YTDLP_DEPENDENCY_ID,
      kind: 'runtime',
      platform: 'win32',
    });
    expect(providerUnits[0].artifacts.map((artifact) => artifact.role)).toEqual(
      ['python-embed', 'yt-dlp-wheel', 'bgutil-provider-exe', 'bgutil-plugin'],
    );
  });

  it('keeps FFmpeg and each active model as independent audio units', () => {
    const audioUnits = getFeatureDependencies().filter(
      (dependency) =>
        dependency.featureId === FEATURE_IDS.AUDIO_PROCESSING_FLOW,
    );
    const binaries = audioUnits.filter(
      (dependency) => dependency.kind === 'binary',
    );
    const models = audioUnits.filter(
      (dependency) => dependency.kind === 'model',
    );

    expect(binaries.map((dependency) => dependency.id)).toEqual([
      FFMPEG_DEPENDENCY_ID,
    ]);
    expect(models.length).toBeGreaterThan(0);
    expect(new Set(models.map((dependency) => dependency.modelId)).size).toBe(
      models.length,
    );
    expect(
      audioUnits.every((dependency) => dependency.deprecated !== true),
    ).toBe(true);
    expect(
      dependencyRegistry.dependencies.some(
        (dependency) => dependency.deprecated === true,
      ),
    ).toBe(true);
  });

  it('rejects registry path fields that can escape the managed dependency root', () => {
    const userDataDir = path.resolve('fixture-user-data');
    const ffmpeg = dependencyRegistry.dependencies.find(
      (dependency) => dependency.id === FFMPEG_DEPENDENCY_ID,
    );
    const model = dependencyRegistry.dependencies.find(
      (dependency) => dependency.kind === 'model',
    );

    expect(() =>
      getFfmpegPaths(userDataDir, {
        ...ffmpeg,
        installVersion: '..',
      }),
    ).toThrow(/install version/i);
    expect(() =>
      getFfmpegPaths(userDataDir, {
        ...ffmpeg,
        executableRelativePath: '..\\outside.exe',
      }),
    ).toThrow(/executable path/i);
    expect(() =>
      getModelDependencyPaths(userDataDir, {
        ...model,
        id: '..',
      }),
    ).toThrow(/dependency id/i);
    expect(() =>
      getModelDependencyPaths(userDataDir, {
        ...model,
        fileRelativePath: '..\\outside.onnx',
      }),
    ).toThrow(/model file path/i);
  });

  it('resolves cleanup only to app-owned dependency family roots', () => {
    const userDataDir = path.resolve('fixture-user-data');
    const ffmpeg = dependencyRegistry.dependencies.find(
      (dependency) => dependency.id === FFMPEG_DEPENDENCY_ID,
    );
    const provider = dependencyRegistry.dependencies.find(
      (dependency) => dependency.id === YTDLP_DEPENDENCY_ID,
    );
    const model = dependencyRegistry.dependencies.find(
      (dependency) => dependency.kind === 'model',
    );

    expect(getManagedDependencyCleanupPaths(userDataDir, provider)).toEqual([
      path.join(userDataDir, 'dependencies', 'ytdlp'),
    ]);
    expect(getManagedDependencyCleanupPaths(userDataDir, ffmpeg)).toEqual([
      path.join(userDataDir, 'dependencies', 'ffmpeg'),
    ]);
    expect(getManagedDependencyCleanupPaths(userDataDir, model)).toEqual([
      path.join(userDataDir, 'dependencies', 'models', model.id),
      path.join(userDataDir, 'models', model.fileRelativePath),
    ]);
    expect(getManagedDependencyInstallDir(userDataDir, provider)).toBe(
      path.join(userDataDir, 'dependencies', 'ytdlp', 'current'),
    );
    expect(getManagedDependencyInstallDir(userDataDir, ffmpeg)).toBe(
      path.join(userDataDir, 'dependencies', 'ffmpeg', 'release'),
    );
    expect(getManagedDependencyInstallDir(userDataDir, model)).toBe(
      path.join(userDataDir, 'dependencies', 'models', model.id, model.version),
    );
  });

  it('rejects non-absolute user-data roots and unsupported dependency kinds', () => {
    const ffmpeg = dependencyRegistry.dependencies.find(
      (dependency) => dependency.id === FFMPEG_DEPENDENCY_ID,
    );

    expect(() => getFfmpegPaths('relative-user-data', ffmpeg)).toThrow(
      /must be absolute/i,
    );
    expect(() => getFfmpegPaths(null, ffmpeg)).toThrow(/must be absolute/i);
    expect(() =>
      getManagedDependencyCleanupPaths(path.resolve('fixture-user-data'), {
        id: 'unsupported-binary',
        kind: 'binary',
      }),
    ).toThrow(/unsupported feature dependency/i);
    expect(() =>
      getManagedDependencyInstallDir(path.resolve('fixture-user-data'), {
        id: 'unsupported-binary',
        kind: 'binary',
      }),
    ).toThrow(/unsupported feature dependency/i);
  });

  it('rejects malformed install components and executable paths', () => {
    const userDataDir = path.resolve('fixture-user-data');
    const ffmpeg = dependencyRegistry.dependencies.find(
      (dependency) => dependency.id === FFMPEG_DEPENDENCY_ID,
    );

    for (const installVersion of ['', '.', 'nested/version', 'x'.repeat(257)]) {
      expect(() =>
        getFfmpegPaths(userDataDir, { ...ffmpeg, installVersion }),
      ).toThrow(/install version/i);
    }
    expect(() =>
      getFfmpegPaths(userDataDir, {
        ...ffmpeg,
        installVersion: undefined,
        version: null,
      }),
    ).toThrow(/install version/i);

    for (const executableRelativePath of [
      null,
      '',
      '.',
      path.resolve('outside.exe'),
      'C:\\outside.exe',
      '../outside.exe',
    ]) {
      expect(() =>
        getFfmpegPaths(userDataDir, {
          ...ffmpeg,
          executableRelativePath,
        }),
      ).toThrow(/executable path/i);
    }
  });

  it('rejects malformed model versions and legacy-relative paths', () => {
    const userDataDir = path.resolve('fixture-user-data');
    const model = dependencyRegistry.dependencies.find(
      (dependency) => dependency.kind === 'model',
    );

    for (const version of [null, '', '.', '..', 'nested/version']) {
      expect(() =>
        getModelDependencyPaths(userDataDir, { ...model, version }),
      ).toThrow(/model version/i);
    }
    for (const fileRelativePath of [
      null,
      '',
      '.',
      path.resolve('outside.onnx'),
      'C:\\outside.onnx',
      '../../outside.onnx',
    ]) {
      expect(() =>
        getModelDependencyPaths(userDataDir, {
          ...model,
          fileRelativePath,
        }),
      ).toThrow(/model file path/i);
    }
  });

  it('rejects invalid provider manifests and filters deprecated custom units', () => {
    const userDataDir = path.resolve('fixture-user-data');
    const provider = dependencyRegistry.dependencies.find(
      (dependency) => dependency.id === YTDLP_DEPENDENCY_ID,
    );

    expect(() =>
      getYtdlpPaths(userDataDir, { ...provider, kind: 'binary' }),
    ).toThrow(/unsupported yt-dlp dependency manifest/i);
    expect(getFeatureDependency('missing-dependency')).toBeNull();
    expect(
      getFeatureDependencies([
        { id: 'active' },
        { id: 'deprecated', deprecated: true },
      ]),
    ).toEqual([{ id: 'active' }]);
    expect(getYtdlpPaths(userDataDir)).toEqual(
      getYtdlpPaths(userDataDir, provider),
    );
  });
});
