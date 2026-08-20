import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureFfmpegDependency,
  ensureModelDependency,
  getPreparedSeparationModelPath,
  getFfmpegPaths,
  getModelDependencyPaths,
  listFeatureDependencyStatuses,
  prepareFeatureDependency,
  sha256,
} from './featureDependencies.js';

let tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-ffmpeg-test-'));
  tmpDirs.push(dir);
  return dir;
}

function arrayBufferFrom(buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}

function makeDependency(archive) {
  return {
    id: 'ffmpeg-test',
    featureId: 'audio-processing-flow',
    kind: 'binary',
    platform: 'win32',
    arch: 'x64',
    name: 'FFmpeg test build',
    version: '1.2.3',
    license: 'GPL-3.0',
    licenseUrl: 'https://example.test/license',
    sourceUrl: 'https://example.test/source',
    downloadUrl: 'https://example.test/ffmpeg.zip',
    sha256: sha256(archive),
    archiveRoot: 'ffmpeg-test',
    executableRelativePath: 'bin/ffmpeg.exe',
  };
}

function makeModelDependency(modelBuffer) {
  return {
    id: 'model-test',
    featureId: 'audio-processing-flow',
    kind: 'model',
    platform: 'win32',
    arch: 'x64',
    modelId: 'model-test-id',
    name: 'Model test',
    version: '1.0.0',
    license: 'MIT',
    licenseUrl: 'https://example.test/license',
    sourceUrl: 'https://example.test/source',
    downloadUrl: 'https://example.test/model.onnx',
    sha256: sha256(modelBuffer),
    expectedSize: modelBuffer.length,
    fileRelativePath: 'model.onnx',
  };
}

describe('ensureFfmpegDependency', () => {
  it('downloads, verifies, extracts, and records an app-managed FFmpeg binary', async () => {
    const userDataDir = makeTempDir();
    const archive = Buffer.from('fake zip bytes');
    const dependency = makeDependency(archive);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(arrayBufferFrom(archive)),
    });
    const extractArchive = vi.fn(async (archivePath, destinationDir, dep) => {
      expect(fs.readFileSync(archivePath)).toEqual(archive);
      const exeDir = path.join(
        destinationDir,
        dep.archiveRoot,
        path.dirname(dep.executableRelativePath),
      );
      fs.mkdirSync(exeDir, { recursive: true });
      fs.writeFileSync(path.join(exeDir, 'ffmpeg.exe'), 'exe');
    });

    const exePath = await ensureFfmpegDependency(userDataDir, {
      allowNonWindows: true,
      dependency,
      fetchImpl,
      extractArchive,
      now: () => new Date('2026-08-20T00:00:00.000Z'),
    });

    const paths = getFfmpegPaths(userDataDir, dependency);
    expect(exePath).toBe(paths.executablePath);
    expect(fs.existsSync(paths.executablePath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(paths.manifestPath, 'utf8'))).toEqual({
      id: dependency.id,
      featureId: dependency.featureId,
      name: dependency.name,
      version: dependency.version,
      license: dependency.license,
      sourceUrl: dependency.sourceUrl,
      downloadUrl: dependency.downloadUrl,
      sha256: dependency.sha256,
      installedAt: '2026-08-20T00:00:00.000Z',
      executableRelativePath: dependency.executableRelativePath,
    });
    expect(
      fs.readFileSync(path.join(paths.installDir, 'SOURCE.txt'), 'utf8'),
    ).toContain(dependency.sourceUrl);
    expect(fetchImpl).toHaveBeenCalledWith(dependency.downloadUrl);
    expect(extractArchive).toHaveBeenCalledTimes(1);
  });

  it('returns an existing managed binary without downloading again', async () => {
    const userDataDir = makeTempDir();
    const dependency = makeDependency(Buffer.from('unused'));
    const paths = getFfmpegPaths(userDataDir, dependency);
    fs.mkdirSync(path.dirname(paths.executablePath), { recursive: true });
    fs.writeFileSync(paths.executablePath, 'exe');
    const fetchImpl = vi.fn();

    await expect(
      ensureFfmpegDependency(userDataDir, {
        allowNonWindows: true,
        dependency,
        fetchImpl,
      }),
    ).resolves.toBe(paths.executablePath);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a download whose checksum does not match the manifest', async () => {
    const userDataDir = makeTempDir();
    const dependency = {
      ...makeDependency(Buffer.from('expected')),
      sha256: sha256(Buffer.from('different')),
    };

    await expect(
      ensureFfmpegDependency(userDataDir, {
        allowNonWindows: true,
        dependency,
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(arrayBufferFrom(Buffer.from('expected'))),
        }),
        extractArchive: vi.fn(),
      }),
    ).rejects.toThrow(/checksum/);
  });
});

describe('model feature dependencies', () => {
  it('downloads, verifies, and records a managed model file', async () => {
    const userDataDir = makeTempDir();
    const modelBuffer = Buffer.from('fake model bytes');
    const dependency = makeModelDependency(modelBuffer);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(arrayBufferFrom(modelBuffer)),
    });

    const modelPath = await ensureModelDependency(userDataDir, 'unused', {
      dependency,
      fetchImpl,
      now: () => new Date('2026-08-20T00:00:00.000Z'),
    });

    const paths = getModelDependencyPaths(userDataDir, dependency);
    expect(modelPath).toBe(paths.filePath);
    expect(fs.readFileSync(paths.filePath)).toEqual(modelBuffer);
    expect(JSON.parse(fs.readFileSync(paths.manifestPath, 'utf8'))).toEqual({
      id: dependency.id,
      featureId: dependency.featureId,
      name: dependency.name,
      version: dependency.version,
      license: dependency.license,
      sourceUrl: dependency.sourceUrl,
      downloadUrl: dependency.downloadUrl,
      sha256: dependency.sha256,
      installedAt: '2026-08-20T00:00:00.000Z',
      fileRelativePath: dependency.fileRelativePath,
      modelId: dependency.modelId,
    });
    expect(fetchImpl).toHaveBeenCalledWith(dependency.downloadUrl);
  });

  it('migrates a verified legacy model into the managed dependency folder', async () => {
    const userDataDir = makeTempDir();
    const modelBuffer = Buffer.from('legacy model bytes');
    const dependency = makeModelDependency(modelBuffer);
    const paths = getModelDependencyPaths(userDataDir, dependency);
    fs.mkdirSync(path.dirname(paths.legacyPath), { recursive: true });
    fs.writeFileSync(paths.legacyPath, modelBuffer);
    const fetchImpl = vi.fn();

    await expect(
      ensureModelDependency(userDataDir, 'unused', {
        dependency,
        fetchImpl,
      }),
    ).resolves.toBe(paths.filePath);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(fs.readFileSync(paths.filePath)).toEqual(modelBuffer);
  });

  it('rejects a model whose checksum does not match the manifest', async () => {
    const userDataDir = makeTempDir();
    const dependency = {
      ...makeModelDependency(Buffer.from('expected')),
      sha256: sha256(Buffer.from('different')),
    };

    await expect(
      ensureModelDependency(userDataDir, 'unused', {
        dependency,
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(arrayBufferFrom(Buffer.from('expected'))),
        }),
      }),
    ).rejects.toThrow(/checksum/);
  });

  it('reports installed and legacy-available status for registry dependencies', async () => {
    const userDataDir = makeTempDir();
    const installedBuffer = Buffer.from('installed model');
    const legacyBuffer = Buffer.from('legacy model');
    const installedDependency = makeModelDependency(installedBuffer);
    const legacyDependency = {
      ...makeModelDependency(legacyBuffer),
      id: 'legacy-model-test',
      modelId: 'legacy-model-test-id',
      fileRelativePath: 'legacy.onnx',
    };
    const installedPaths = getModelDependencyPaths(
      userDataDir,
      installedDependency,
    );
    const legacyPaths = getModelDependencyPaths(userDataDir, legacyDependency);
    await ensureModelDependency(userDataDir, 'unused', {
      dependency: installedDependency,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(arrayBufferFrom(installedBuffer)),
      }),
    });
    fs.mkdirSync(path.dirname(legacyPaths.legacyPath), { recursive: true });
    fs.writeFileSync(legacyPaths.legacyPath, legacyBuffer);

    const statuses = listFeatureDependencyStatuses(userDataDir, [
      installedDependency,
      legacyDependency,
    ]);

    expect(installedPaths.filePath).toBeTruthy();
    expect(
      statuses.find((item) => item.id === installedDependency.id),
    ).toMatchObject({
      installed: true,
      canMigrate: false,
    });
    expect(
      statuses.find((item) => item.id === legacyDependency.id),
    ).toMatchObject({
      installed: false,
      canMigrate: true,
    });
  });

  it('throws a user-facing setup prompt when a prepared model is missing', () => {
    const userDataDir = makeTempDir();

    expect(() => getPreparedSeparationModelPath(userDataDir, 'kara2')).toThrow(
      /請先到設定頁準備/,
    );
  });

  it('prepares a registry dependency by id', async () => {
    const userDataDir = makeTempDir();
    const modelBuffer = Buffer.from('prepared model bytes');
    const dependency = makeModelDependency(modelBuffer);

    const status = await prepareFeatureDependency(userDataDir, dependency.id, {
      registryDependencies: [dependency],
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(arrayBufferFrom(modelBuffer)),
      }),
    });

    expect(status).toMatchObject({
      id: dependency.id,
      installed: true,
    });
  });
});
