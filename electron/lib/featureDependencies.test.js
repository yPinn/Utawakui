import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureFfmpegDependency,
  ensureYtdlpDependency,
  ensureModelDependency,
  getPreparedSeparationModelPath,
  getPreparedYtdlpPath,
  getFfmpegPaths,
  getManagedDependencyInstallDir,
  getYtdlpPaths,
  getModelDependencyPaths,
  listFeatureDependencyStatuses,
  prepareFeatureDependency,
  removeFeatureDependency,
  repairFeatureDependency,
  setupYtdlpRuntimeEnvironment,
  sha256,
} from './featureDependencies.js';
import { APP_ERROR_PREFIX } from './appError.js';

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

function makeYtdlpDependency() {
  return {
    id: 'yt-dlp-provider-tool',
    featureId: 'provider-flow',
    kind: 'tool',
    platform: 'win32',
    arch: 'x64',
    name: 'yt-dlp test',
    version: 'managed',
    license: 'GPL-3.0-or-later bundled executable',
    licenseUrl: 'https://example.test/license',
    sourceUrl: 'https://example.test/source',
    bundledRelativePath: 'node_modules/youtube-dl-exec/bin/yt-dlp.exe',
    executableRelativePath: 'yt-dlp.exe',
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
  it('passes archive and destination paths to PowerShell through named script parameters', async () => {
    const userDataDir = makeTempDir();
    const archive = Buffer.from('fake zip bytes');
    const dependency = makeDependency(archive);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(arrayBufferFrom(archive)),
    });
    const spawnCalls = [];
    const spawnImpl = vi.fn((_command, args) => {
      spawnCalls.push(args);
      const proc = new EventEmitter();
      proc.stderr = new EventEmitter();
      queueMicrotask(() => {
        const archivePath = args.at(-2);
        const destinationDir = args.at(-1);
        expect(fs.readFileSync(archivePath)).toEqual(archive);
        const exeDir = path.join(
          destinationDir,
          dependency.archiveRoot,
          path.dirname(dependency.executableRelativePath),
        );
        fs.mkdirSync(exeDir, { recursive: true });
        fs.writeFileSync(path.join(exeDir, 'ffmpeg.exe'), 'exe');
        proc.emit('close', 0);
      });
      return proc;
    });

    await ensureFfmpegDependency(userDataDir, {
      allowNonWindows: true,
      dependency,
      fetchImpl,
      spawnImpl,
      now: () => new Date('2026-08-21T01:00:00.000Z'),
    });

    const args = spawnCalls[0];
    expect(args).toContain('-Command');
    const command = args[args.indexOf('-Command') + 1];
    expect(command).toContain('param([string]$ArchivePath');
    expect(command).toContain('Expand-Archive');
    expect(command).not.toContain('$args');
    expect(args.at(-2)).toMatch(/ffmpeg\.zip$/);
    expect(args.at(-1)).toContain('.ffmpeg-');
  });

  it('reuses a verified FFmpeg archive cache after extraction fails', async () => {
    const userDataDir = makeTempDir();
    const archive = Buffer.from('fake zip bytes');
    const dependency = makeDependency(archive);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(arrayBufferFrom(archive)),
    });
    const extractArchive = vi
      .fn()
      .mockRejectedValueOnce(new Error('extract failed'))
      .mockImplementationOnce(async (archivePath, destinationDir, dep) => {
        expect(fs.readFileSync(archivePath)).toEqual(archive);
        const exeDir = path.join(
          destinationDir,
          dep.archiveRoot,
          path.dirname(dep.executableRelativePath),
        );
        fs.mkdirSync(exeDir, { recursive: true });
        fs.writeFileSync(path.join(exeDir, 'ffmpeg.exe'), 'exe');
      });

    await expect(
      ensureFfmpegDependency(userDataDir, {
        allowNonWindows: true,
        dependency,
        fetchImpl,
        extractArchive,
      }),
    ).rejects.toThrow('extract failed');

    await expect(
      ensureFfmpegDependency(userDataDir, {
        allowNonWindows: true,
        dependency,
        fetchImpl,
        extractArchive,
      }),
    ).resolves.toBe(getFfmpegPaths(userDataDir, dependency).executablePath);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(extractArchive).toHaveBeenCalledTimes(2);
  });

  it('reports FFmpeg download, verification, and install progress', async () => {
    const userDataDir = makeTempDir();
    const archive = Buffer.from('fake zip bytes');
    const dependency = makeDependency(archive);
    const progressEvents = [];
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(archive, {
        headers: {
          'content-length': String(archive.length),
        },
      }),
    );
    const extractArchive = vi.fn(async (archivePath, destinationDir, dep) => {
      const exeDir = path.join(
        destinationDir,
        dep.archiveRoot,
        path.dirname(dep.executableRelativePath),
      );
      fs.mkdirSync(exeDir, { recursive: true });
      fs.writeFileSync(path.join(exeDir, 'ffmpeg.exe'), 'exe');
    });

    await ensureFfmpegDependency(userDataDir, {
      allowNonWindows: true,
      dependency,
      fetchImpl,
      extractArchive,
      onProgress: (event) => progressEvents.push(event),
    });

    expect(progressEvents).toEqual(
      expect.arrayContaining([
        { stage: 'downloading', percent: 100 },
        { stage: 'verifying' },
        { stage: 'installing' },
        { stage: 'ready', percent: 100 },
      ]),
    );
  });

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

  it('resolves the current Gyan release version and checksum before installing FFmpeg', async () => {
    const userDataDir = makeTempDir();
    const archive = Buffer.from('fake release zip bytes');
    const archiveSha = sha256(archive);
    const dependency = {
      ...makeDependency(Buffer.from('unused')),
      version: 'release',
      displayVersion: 'latest release',
      downloadUrl:
        'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
      versionUrl:
        'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.ver',
      sha256Url:
        'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256',
      sha256: undefined,
      archiveRoot: 'ffmpeg-{version}-essentials_build',
    };
    const fetchImpl = vi.fn(async (url) => {
      if (url === dependency.versionUrl) {
        return {
          ok: true,
          text: () => Promise.resolve('9.0.1\n'),
        };
      }
      if (url === dependency.sha256Url) {
        return {
          ok: true,
          text: () => Promise.resolve(`${archiveSha}\n`),
        };
      }
      if (url === dependency.downloadUrl) {
        return {
          ok: true,
          arrayBuffer: () => Promise.resolve(arrayBufferFrom(archive)),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const extractArchive = vi.fn(async (archivePath, destinationDir, dep) => {
      expect(dep.version).toBe('9.0.1');
      expect(dep.archiveRoot).toBe('ffmpeg-9.0.1-essentials_build');
      expect(dep.sha256).toBe(archiveSha);
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
      now: () => new Date('2026-08-21T00:00:00.000Z'),
    });

    const paths = getFfmpegPaths(userDataDir, dependency);
    expect(exePath).toBe(paths.executablePath);
    expect(JSON.parse(fs.readFileSync(paths.manifestPath, 'utf8'))).toEqual({
      id: dependency.id,
      featureId: dependency.featureId,
      name: dependency.name,
      version: '9.0.1',
      license: dependency.license,
      sourceUrl: dependency.sourceUrl,
      downloadUrl: dependency.downloadUrl,
      sha256: archiveSha,
      installedAt: '2026-08-21T00:00:00.000Z',
      executableRelativePath: dependency.executableRelativePath,
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(1, dependency.versionUrl);
    expect(fetchImpl).toHaveBeenNthCalledWith(2, dependency.sha256Url);
    expect(fetchImpl).toHaveBeenNthCalledWith(3, dependency.downloadUrl);
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

describe('yt-dlp feature dependency', () => {
  it('copies a bundled yt-dlp executable into the managed dependency folder', async () => {
    const userDataDir = makeTempDir();
    const bundledDir = makeTempDir();
    const bundledPath = path.join(bundledDir, 'yt-dlp.exe');
    const dependency = makeYtdlpDependency();
    fs.writeFileSync(bundledPath, 'exe');

    const exePath = await ensureYtdlpDependency(userDataDir, {
      dependency,
      bundledPath,
      now: () => new Date('2026-08-20T00:00:00.000Z'),
    });

    const paths = getYtdlpPaths(userDataDir, dependency);
    expect(exePath).toBe(paths.executablePath);
    expect(fs.readFileSync(paths.executablePath, 'utf8')).toBe('exe');
    expect(JSON.parse(fs.readFileSync(paths.manifestPath, 'utf8'))).toEqual({
      id: dependency.id,
      featureId: dependency.featureId,
      name: dependency.name,
      version: dependency.version,
      license: dependency.license,
      sourceUrl: dependency.sourceUrl,
      bundledRelativePath: dependency.bundledRelativePath,
      installedAt: '2026-08-20T00:00:00.000Z',
      executableRelativePath: dependency.executableRelativePath,
    });
  });

  it('reports yt-dlp as installed when the managed executable exists', async () => {
    const userDataDir = makeTempDir();
    const bundledDir = makeTempDir();
    const bundledPath = path.join(bundledDir, 'yt-dlp.exe');
    const dependency = makeYtdlpDependency();
    fs.writeFileSync(bundledPath, 'exe');
    await ensureYtdlpDependency(userDataDir, { dependency, bundledPath });

    expect(
      listFeatureDependencyStatuses(userDataDir, [dependency])[0],
    ).toMatchObject({
      id: dependency.id,
      installed: true,
    });
  });

  it('throws a provider setup prompt when the prepared yt-dlp tool is missing', () => {
    const userDataDir = makeTempDir();

    try {
      getPreparedYtdlpPath(userDataDir);
      throw new Error('expected missing dependency to throw');
    } catch (err) {
      expect(err.message).toContain(APP_ERROR_PREFIX);
      expect(err.message).toContain('請先到設定頁準備');
      expect(err.message).toContain('外部來源');
      expect(err.code).toBe('FEATURE_DEPENDENCY_MISSING');
    }
  });

  it('sets youtube-dl-exec to the managed yt-dlp directory before require time', () => {
    const userDataDir = makeTempDir();
    const previous = process.env.YOUTUBE_DL_DIR;

    setupYtdlpRuntimeEnvironment(userDataDir);

    expect(process.env.YOUTUBE_DL_DIR).toBe(
      getYtdlpPaths(userDataDir).installDir,
    );
    if (previous === undefined) {
      delete process.env.YOUTUBE_DL_DIR;
    } else {
      process.env.YOUTUBE_DL_DIR = previous;
    }
  });

  it('removes only the managed yt-dlp dependency folder', async () => {
    const userDataDir = makeTempDir();
    const bundledDir = makeTempDir();
    const bundledPath = path.join(bundledDir, 'yt-dlp.exe');
    const dependency = makeYtdlpDependency();
    fs.writeFileSync(bundledPath, 'exe');
    await ensureYtdlpDependency(userDataDir, { dependency, bundledPath });
    const installDir = getManagedDependencyInstallDir(userDataDir, dependency);

    const status = removeFeatureDependency(userDataDir, dependency.id, {
      registryDependencies: [dependency],
    });

    expect(fs.existsSync(installDir)).toBe(false);
    expect(fs.existsSync(bundledPath)).toBe(true);
    expect(status).toMatchObject({
      id: dependency.id,
      installed: false,
    });
  });
});

describe('model feature dependencies', () => {
  it('reports model download progress when preparing a managed model', async () => {
    const userDataDir = makeTempDir();
    const modelBuffer = Buffer.from('fake model bytes');
    const dependency = makeModelDependency(modelBuffer);
    const progressEvents = [];

    await ensureModelDependency(userDataDir, 'unused', {
      dependency,
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(modelBuffer, {
          headers: {
            'content-length': String(modelBuffer.length),
          },
        }),
      ),
      onProgress: (event) => progressEvents.push(event),
    });

    expect(progressEvents).toContainEqual({
      stage: 'downloading',
      percent: 100,
    });
    expect(progressEvents).toContainEqual({ stage: 'ready', percent: 100 });
  });

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

    try {
      getPreparedSeparationModelPath(userDataDir, 'kara2');
      throw new Error('expected missing dependency to throw');
    } catch (err) {
      expect(err.message).toContain(APP_ERROR_PREFIX);
      expect(err.message).toContain('請先到設定頁準備');
      expect(err.code).toBe('FEATURE_DEPENDENCY_MISSING');
    }
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

  it('repairs a managed model by reinstalling through the normal prepare path', async () => {
    const userDataDir = makeTempDir();
    const modelBuffer = Buffer.from('repair model bytes');
    const dependency = makeModelDependency(modelBuffer);
    const paths = getModelDependencyPaths(userDataDir, dependency);
    await ensureModelDependency(userDataDir, 'unused', {
      dependency,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(arrayBufferFrom(modelBuffer)),
      }),
    });
    fs.writeFileSync(paths.filePath, 'corrupted');
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(arrayBufferFrom(modelBuffer)),
    });

    const status = await repairFeatureDependency(userDataDir, dependency.id, {
      registryDependencies: [dependency],
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(dependency.downloadUrl);
    expect(fs.readFileSync(paths.filePath)).toEqual(modelBuffer);
    expect(status).toMatchObject({
      id: dependency.id,
      installed: true,
    });
  });
});
