import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getFfmpegDependency,
  getFeatureDependencies,
  getFeatureDependency,
  getFfmpegPaths,
  getManagedDependencyInstallDir,
  getYtdlpDependency,
  getYtdlpPaths,
  getModelDependencyPaths,
  getSeparationModelDependency,
} from './featureDependencies/registry.js';
import {
  ensureYtdlpDependency,
  getPreparedYtdlpPath,
} from './featureDependencies/providerRuntime.js';
import {
  ensureFfmpegDependency,
  getPreparedFfmpegPath,
  resolveFfmpegRuntime,
} from './featureDependencies/ffmpeg.js';
import {
  ensureModelDependency,
  getPreparedSeparationModelPath,
} from './featureDependencies/models.js';
import {
  buildDependencyStatus,
  listFeatureDependencyStatuses,
  prepareFeatureDependency,
  removeFeatureDependency,
  repairFeatureDependency,
} from './featureDependencies/service.js';
import { sha256 } from './featureDependencies/download.js';
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

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data);
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
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

function makeProviderRuntimeDependency(buffers) {
  return {
    id: 'yt-dlp-provider-tool',
    featureId: 'provider-flow',
    kind: 'runtime',
    platform: 'win32',
    arch: 'x64',
    name: 'Provider runtime test',
    version: 'python-test',
    license: 'test',
    licenseUrl: 'https://example.test/license',
    sourceUrl: 'https://example.test/source',
    executableRelativePath: 'python/python.exe',
    artifacts: [
      {
        role: 'python-embed',
        name: 'Python',
        version: 'test',
        sourceUrl: 'https://example.test/python',
        downloadUrl: 'https://example.test/python.zip',
        sha256: sha256(buffers.python),
      },
      {
        role: 'yt-dlp-wheel',
        name: 'yt-dlp',
        version: 'test',
        sourceUrl: 'https://example.test/ytdlp',
        downloadUrl: 'https://example.test/yt-dlp.whl',
        sha256: sha256(buffers.ytdlp),
      },
      {
        role: 'bgutil-provider-exe',
        name: 'bgutil exe',
        version: 'test',
        sourceUrl: 'https://example.test/bgutil',
        downloadUrl: 'https://example.test/bgutil.exe',
        sha256: sha256(buffers.provider),
      },
      {
        role: 'bgutil-plugin',
        name: 'bgutil plugin',
        version: 'test',
        sourceUrl: 'https://example.test/plugin',
        downloadUrl: 'https://example.test/plugin.zip',
        sha256: sha256(buffers.plugin),
      },
    ],
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
    const archive = createStoredZip([
      {
        name: 'ffmpeg-test/bin/ffmpeg.exe',
        data: Buffer.from('exe'),
      },
    ]);
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
    expect(command).toContain("$ErrorActionPreference = 'Stop'\nAdd-Type");
    expect(command).toContain('ZipFile]::OpenRead');
    expect(command).toContain('$inputStream.CopyTo($outputStream)');
    expect(command).not.toContain('$args');
    expect(args.at(-2)).toMatch(/ffmpeg\.zip$/);
    expect(args.at(-1)).toContain('.ffmpeg-');
  });

  it('rejects archive entries that would extract outside the destination', async () => {
    const userDataDir = makeTempDir();
    const archive = createStoredZip([
      { name: '../escape.txt', data: Buffer.from('escaped') },
    ]);
    const dependency = makeDependency(archive);
    const escapePath = path.join(userDataDir, 'dependencies', 'escape.txt');

    await expect(
      ensureFfmpegDependency(userDataDir, {
        allowNonWindows: true,
        dependency,
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () => Promise.resolve(arrayBufferFrom(archive)),
        }),
      }),
    ).rejects.toThrow(/outside the destination/);
    expect(fs.existsSync(escapePath)).toBe(false);
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
    expect(fetchImpl).toHaveBeenCalledWith(dependency.downloadUrl, {
      signal: expect.any(AbortSignal),
    });
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
    expect(fetchImpl).toHaveBeenNthCalledWith(1, dependency.versionUrl, {
      signal: expect.any(AbortSignal),
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, dependency.sha256Url, {
      signal: expect.any(AbortSignal),
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(3, dependency.downloadUrl, {
      signal: expect.any(AbortSignal),
    });
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

  it('rejects an archive download larger than its declared expected size', async () => {
    const userDataDir = makeTempDir();
    const archive = Buffer.from('larger than expected');
    const dependency = {
      ...makeDependency(archive),
      expectedSize: 4,
    };

    await expect(
      ensureFfmpegDependency(userDataDir, {
        allowNonWindows: true,
        dependency,
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () => Promise.resolve(arrayBufferFrom(archive)),
        }),
        extractArchive: vi.fn(),
      }),
    ).rejects.toThrow(/exceeds allowed size/);
  });

  it('uses the declared max download size as the hard cap when present', async () => {
    const userDataDir = makeTempDir();
    const archive = createStoredZip([
      {
        name: 'ffmpeg-test/bin/ffmpeg.exe',
        data: Buffer.from('exe'),
      },
    ]);
    const dependency = {
      ...makeDependency(archive),
      expectedSize: 4,
      maxDownloadSize: archive.length,
    };

    await expect(
      ensureFfmpegDependency(userDataDir, {
        allowNonWindows: true,
        dependency,
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () => Promise.resolve(arrayBufferFrom(archive)),
        }),
        extractArchive: vi.fn(async (_archivePath, destinationDir, dep) => {
          const exeDir = path.join(
            destinationDir,
            dep.archiveRoot,
            path.dirname(dep.executableRelativePath),
          );
          fs.mkdirSync(exeDir, { recursive: true });
          fs.writeFileSync(path.join(exeDir, 'ffmpeg.exe'), 'exe');
        }),
      }),
    ).resolves.toBe(getFfmpegPaths(userDataDir, dependency).executablePath);
  });
});

describe('getPreparedFfmpegPath', () => {
  it('returns the managed executable path when no system path is provided', () => {
    const userDataDir = makeTempDir();
    const { executablePath } = getFfmpegPaths(userDataDir);
    fs.mkdirSync(path.dirname(executablePath), { recursive: true });
    fs.writeFileSync(executablePath, 'exe');

    expect(getPreparedFfmpegPath(userDataDir, null)).toBe(executablePath);
  });

  it('throws a setup prompt when neither a managed nor a system executable exists', () => {
    const userDataDir = makeTempDir();

    try {
      getPreparedFfmpegPath(userDataDir, null);
      throw new Error('expected missing dependency to throw');
    } catch (err) {
      expect(err.message).toContain(APP_ERROR_PREFIX);
      expect(err.message).toContain('請先到設定頁準備');
      expect(err.code).toBe('FEATURE_DEPENDENCY_MISSING');
    }
  });

  it('returns the system path when it exists on disk, without checking the managed install', () => {
    const userDataDir = makeTempDir();
    const systemDir = makeTempDir();
    const systemPath = path.join(systemDir, 'ffmpeg.exe');
    fs.writeFileSync(systemPath, 'exe');

    expect(getPreparedFfmpegPath(userDataDir, systemPath)).toBe(systemPath);
  });

  it('falls back to a verified managed executable when the configured system path disappeared', () => {
    const userDataDir = makeTempDir();
    const { executablePath } = getFfmpegPaths(userDataDir);
    fs.mkdirSync(path.dirname(executablePath), { recursive: true });
    fs.writeFileSync(executablePath, 'managed');
    const missingSystemPath = path.join(
      userDataDir,
      'does-not-exist',
      'ffmpeg.exe',
    );

    expect(getPreparedFfmpegPath(userDataDir, missingSystemPath)).toBe(
      executablePath,
    );
    expect(resolveFfmpegRuntime(userDataDir, missingSystemPath)).toEqual({
      path: executablePath,
      source: 'managed',
      staleSystemPath: true,
    });
  });

  it('reports one generic setup prompt when a stale system path has no managed fallback', () => {
    const userDataDir = makeTempDir();
    const missingSystemPath = path.join(userDataDir, 'missing', 'ffmpeg.exe');

    try {
      getPreparedFfmpegPath(userDataDir, missingSystemPath);
      throw new Error('expected missing dependency to throw');
    } catch (err) {
      expect(err.message).toContain(APP_ERROR_PREFIX);
      expect(err.message).not.toContain('系統 FFmpeg');
      expect(err.code).toBe('FEATURE_DEPENDENCY_MISSING');
    }
  });
});

describe('buildDependencyStatus / listFeatureDependencyStatuses for FFmpeg source', () => {
  it('reports source: "system" and installed:true when a live systemFfmpegPath exists', () => {
    const userDataDir = makeTempDir();
    const systemDir = makeTempDir();
    const systemPath = path.join(systemDir, 'ffmpeg.exe');
    fs.writeFileSync(systemPath, 'exe');

    const statuses = listFeatureDependencyStatuses(
      userDataDir,
      [getFfmpegDependency()],
      systemPath,
    );

    expect(statuses[0]).toMatchObject({
      installed: true,
      source: 'system',
      installedVersion: null,
    });
  });

  it('falls back to the managed install status when the configured systemFfmpegPath no longer exists', () => {
    const userDataDir = makeTempDir();
    const missingSystemPath = path.join(
      userDataDir,
      'does-not-exist',
      'ffmpeg.exe',
    );

    const statuses = listFeatureDependencyStatuses(
      userDataDir,
      [getFfmpegDependency()],
      missingSystemPath,
    );

    expect(statuses[0]).toMatchObject({
      installed: false,
      source: 'managed',
    });
  });

  it('reports source: "managed" when no systemFfmpegPath is configured', () => {
    const userDataDir = makeTempDir();

    const statuses = listFeatureDependencyStatuses(
      userDataDir,
      [getFfmpegDependency()],
      null,
    );

    expect(statuses[0]).toMatchObject({
      installed: false,
      source: 'managed',
    });
  });

  it('reports installed metadata for a complete managed FFmpeg unit', () => {
    const userDataDir = makeTempDir();
    const dependency = getFfmpegDependency();
    const paths = getFfmpegPaths(userDataDir, dependency);
    fs.mkdirSync(path.dirname(paths.executablePath), { recursive: true });
    fs.writeFileSync(paths.executablePath, 'ffmpeg');
    fs.writeFileSync(
      paths.manifestPath,
      JSON.stringify({
        version: dependency.version,
        installedAt: '2026-08-25T01:00:00.000Z',
      }),
    );

    expect(buildDependencyStatus(userDataDir, dependency)).toMatchObject({
      installed: true,
      source: 'managed',
      installedAt: '2026-08-25T01:00:00.000Z',
      installedVersion: dependency.version,
      updateAvailable: false,
    });
  });
});

describe('yt-dlp feature dependency', () => {
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

  it('downloads, verifies, extracts, and records the Python provider runtime', async () => {
    const userDataDir = makeTempDir();
    const buffers = {
      python: Buffer.from('python zip'),
      ytdlp: Buffer.from('yt-dlp wheel'),
      provider: Buffer.from('provider exe'),
      plugin: Buffer.from('plugin zip'),
    };
    const dependency = makeProviderRuntimeDependency(buffers);
    const fetchImpl = vi.fn(async (url) => {
      const artifact = dependency.artifacts.find(
        (item) => item.downloadUrl === url,
      );
      if (!artifact) throw new Error(`unexpected url: ${url}`);
      const key =
        artifact.role === 'python-embed'
          ? 'python'
          : artifact.role === 'yt-dlp-wheel'
            ? 'ytdlp'
            : artifact.role === 'bgutil-provider-exe'
              ? 'provider'
              : 'plugin';
      return {
        ok: true,
        arrayBuffer: () => Promise.resolve(arrayBufferFrom(buffers[key])),
      };
    });
    const extractArchive = vi.fn(
      async (_archivePath, destinationDir, artifact) => {
        if (artifact.role === 'python-embed') {
          fs.writeFileSync(path.join(destinationDir, 'python.exe'), 'python');
          fs.writeFileSync(
            path.join(destinationDir, 'python314._pth'),
            ['python314.zip', '.', '#import site', ''].join('\n'),
          );
        }
        if (artifact.role === 'yt-dlp-wheel') {
          fs.mkdirSync(path.join(destinationDir, 'yt_dlp'), {
            recursive: true,
          });
        }
        if (artifact.role === 'bgutil-plugin') {
          fs.mkdirSync(
            path.join(destinationDir, 'yt_dlp_plugins', 'extractor'),
            {
              recursive: true,
            },
          );
        }
      },
    );

    const paths = await ensureYtdlpDependency(userDataDir, {
      dependency,
      fetchImpl,
      extractArchive,
      now: () => new Date('2026-08-22T00:00:00.000Z'),
    });

    expect(paths.pythonPath).toBe(
      getYtdlpPaths(userDataDir, dependency).pythonPath,
    );
    expect(fs.existsSync(paths.pythonPath)).toBe(true);
    expect(fs.existsSync(path.join(paths.sitePackagesDir, 'yt_dlp'))).toBe(
      true,
    );
    expect(fs.existsSync(paths.bgutilProviderPath)).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          paths.pluginPackageDir,
          'yt_dlp_plugins',
          'extractor',
          '__init__.py',
        ),
      ),
    ).toBe(true);
    expect(
      fs.readFileSync(path.join(paths.pythonDir, 'python314._pth'), 'utf8'),
    ).toContain('Lib/site-packages');
    expect(
      JSON.parse(fs.readFileSync(paths.manifestPath, 'utf8')),
    ).toMatchObject({
      id: dependency.id,
      version: dependency.version,
      artifacts: dependency.artifacts.map((artifact) =>
        expect.objectContaining({
          role: artifact.role,
          sha256: artifact.sha256,
        }),
      ),
    });
  });

  it('rejects a provider runtime install when extraction does not produce required artifacts', async () => {
    const userDataDir = makeTempDir();
    const buffers = {
      python: Buffer.from('python zip'),
      ytdlp: Buffer.from('yt-dlp wheel'),
      provider: Buffer.from('provider exe'),
      plugin: Buffer.from('plugin zip'),
    };
    const dependency = makeProviderRuntimeDependency(buffers);
    const fetchImpl = vi.fn(async (url) => {
      const artifact = dependency.artifacts.find(
        (item) => item.downloadUrl === url,
      );
      if (!artifact) throw new Error(`unexpected url: ${url}`);
      const buffer =
        artifact.role === 'python-embed'
          ? buffers.python
          : artifact.role === 'yt-dlp-wheel'
            ? buffers.ytdlp
            : artifact.role === 'bgutil-provider-exe'
              ? buffers.provider
              : buffers.plugin;
      return {
        ok: true,
        arrayBuffer: () => Promise.resolve(arrayBufferFrom(buffer)),
      };
    });
    const extractArchive = vi.fn(async () => {});
    const paths = getYtdlpPaths(userDataDir, dependency);

    await expect(
      ensureYtdlpDependency(userDataDir, {
        dependency,
        fetchImpl,
        extractArchive,
      }),
    ).rejects.toThrow(/provider runtime install did not produce/i);

    expect(fs.existsSync(paths.installDir)).toBe(false);
    expect(fs.existsSync(paths.manifestPath)).toBe(false);
  });

  it('removes only the managed Python provider runtime folder', async () => {
    const userDataDir = makeTempDir();
    const buffers = {
      python: Buffer.from('python zip'),
      ytdlp: Buffer.from('yt-dlp wheel'),
      provider: Buffer.from('provider exe'),
      plugin: Buffer.from('plugin zip'),
    };
    const dependency = makeProviderRuntimeDependency(buffers);
    const fetchImpl = vi.fn(async (url) => {
      const artifact = dependency.artifacts.find(
        (item) => item.downloadUrl === url,
      );
      if (!artifact) throw new Error(`unexpected url: ${url}`);
      const buffer =
        artifact.role === 'python-embed'
          ? buffers.python
          : artifact.role === 'yt-dlp-wheel'
            ? buffers.ytdlp
            : artifact.role === 'bgutil-provider-exe'
              ? buffers.provider
              : buffers.plugin;
      return {
        ok: true,
        arrayBuffer: () => Promise.resolve(arrayBufferFrom(buffer)),
      };
    });
    const extractArchive = vi.fn(
      async (_archivePath, destinationDir, artifact) => {
        if (artifact.role === 'python-embed') {
          fs.writeFileSync(path.join(destinationDir, 'python.exe'), 'python');
          fs.writeFileSync(
            path.join(destinationDir, 'python314._pth'),
            ['python314.zip', '.', '#import site', ''].join('\n'),
          );
        }
        if (artifact.role === 'yt-dlp-wheel') {
          fs.mkdirSync(path.join(destinationDir, 'yt_dlp'), {
            recursive: true,
          });
        }
        if (artifact.role === 'bgutil-plugin') {
          fs.mkdirSync(
            path.join(destinationDir, 'yt_dlp_plugins', 'extractor'),
            { recursive: true },
          );
        }
      },
    );

    await ensureYtdlpDependency(userDataDir, {
      dependency,
      fetchImpl,
      extractArchive,
    });
    const installDir = getManagedDependencyInstallDir(userDataDir, dependency);

    const status = removeFeatureDependency(userDataDir, dependency.id, {
      registryDependencies: [dependency],
    });

    expect(fs.existsSync(installDir)).toBe(false);
    expect(status).toMatchObject({
      id: dependency.id,
      installed: false,
    });
  });

  it('removes stale family caches, prior versions, and legacy model files', () => {
    const userDataDir = makeTempDir();
    const ffmpeg = getFfmpegDependency();
    const ffmpegPaths = getFfmpegPaths(userDataDir, ffmpeg);
    const previousFfmpegDir = path.join(
      userDataDir,
      'dependencies',
      'ffmpeg',
      'previous-version',
    );
    const ffmpegArchiveCache = path.join(
      userDataDir,
      'dependencies',
      'ffmpeg',
      '_archives',
      'stale.zip',
    );
    fs.mkdirSync(path.dirname(ffmpegPaths.executablePath), { recursive: true });
    fs.mkdirSync(previousFfmpegDir, { recursive: true });
    fs.mkdirSync(path.dirname(ffmpegArchiveCache), { recursive: true });
    fs.writeFileSync(ffmpegPaths.executablePath, 'ffmpeg');
    fs.writeFileSync(ffmpegArchiveCache, 'archive');

    removeFeatureDependency(userDataDir, ffmpeg.id);

    expect(
      fs.existsSync(path.join(userDataDir, 'dependencies', 'ffmpeg')),
    ).toBe(false);

    const modelBuffer = Buffer.from('legacy cleanup model');
    const model = makeModelDependency(modelBuffer);
    const modelPaths = getModelDependencyPaths(userDataDir, model);
    fs.mkdirSync(modelPaths.installDir, { recursive: true });
    fs.mkdirSync(path.dirname(modelPaths.legacyPath), { recursive: true });
    fs.writeFileSync(modelPaths.filePath, modelBuffer);
    fs.writeFileSync(modelPaths.legacyPath, modelBuffer);

    const status = removeFeatureDependency(userDataDir, model.id, {
      registryDependencies: [model],
    });

    expect(fs.existsSync(modelPaths.installDir)).toBe(false);
    expect(fs.existsSync(modelPaths.legacyPath)).toBe(false);
    expect(status).toMatchObject({ installed: false, canMigrate: false });
  });

  it('reports the registry provider runtime as installed only when every runtime artifact exists', () => {
    const userDataDir = makeTempDir();

    expect(
      listFeatureDependencyStatuses(userDataDir, [getYtdlpDependency()])[0],
    ).toMatchObject({
      id: 'yt-dlp-provider-tool',
      kind: 'runtime',
      installed: false,
    });
  });

  it('reads installed provider manifest metadata only after the atomic unit is complete', async () => {
    const userDataDir = makeTempDir();
    const dependency = getYtdlpDependency();
    const paths = getYtdlpPaths(userDataDir, dependency);
    fs.mkdirSync(paths.pythonDir, { recursive: true });
    fs.mkdirSync(path.join(paths.sitePackagesDir, 'yt_dlp'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(paths.pluginPackageDir, 'yt_dlp_plugins'), {
      recursive: true,
    });
    fs.mkdirSync(path.dirname(paths.bgutilProviderPath), { recursive: true });
    fs.writeFileSync(paths.pythonPath, 'python');
    fs.writeFileSync(paths.bgutilProviderPath, 'provider');
    fs.writeFileSync(
      paths.manifestPath,
      JSON.stringify({
        version: dependency.version,
        installedAt: '2026-08-25T00:00:00.000Z',
      }),
    );

    expect(buildDependencyStatus(userDataDir, dependency)).toMatchObject({
      installed: true,
      installedAt: '2026-08-25T00:00:00.000Z',
      installedVersion: dependency.version,
      updateAvailable: false,
    });
    await expect(
      prepareFeatureDependency(userDataDir, dependency.id),
    ).resolves.toMatchObject({ installed: true });
  });

  it('fails closed for unknown and unsupported lifecycle dependency ids', async () => {
    const userDataDir = makeTempDir();
    const unsupported = {
      id: 'unsupported-unit',
      featureId: 'audio-processing-flow',
      kind: 'binary',
    };

    await expect(
      prepareFeatureDependency(userDataDir, 'missing', {
        registryDependencies: [],
      }),
    ).rejects.toThrow(/unknown feature dependency/i);
    await expect(
      prepareFeatureDependency(userDataDir, unsupported.id, {
        registryDependencies: [unsupported],
      }),
    ).rejects.toThrow(/unsupported feature dependency/i);
    expect(() =>
      removeFeatureDependency(userDataDir, 'missing', {
        registryDependencies: [],
      }),
    ).toThrow(/unknown feature dependency/i);
    expect(buildDependencyStatus(userDataDir, unsupported)).toMatchObject({
      installed: false,
      installedAt: null,
      updateAvailable: false,
    });
    expect(listFeatureDependencyStatuses(userDataDir)).toHaveLength(
      getFeatureDependencies().length,
    );
    await expect(
      repairFeatureDependency(userDataDir, 'missing'),
    ).rejects.toThrow(/unknown feature dependency/i);
  });

  it('reports an installed provider runtime as updateable when its manifest version is older', () => {
    const userDataDir = makeTempDir();
    const dependency = {
      ...makeProviderRuntimeDependency({
        python: Buffer.from('python zip'),
        ytdlp: Buffer.from('yt-dlp wheel'),
        provider: Buffer.from('provider exe'),
        plugin: Buffer.from('plugin zip'),
      }),
      version: 'provider-current',
    };
    const paths = getYtdlpPaths(userDataDir, dependency);
    fs.mkdirSync(path.dirname(paths.pythonPath), { recursive: true });
    fs.mkdirSync(path.join(paths.sitePackagesDir, 'yt_dlp'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(paths.pluginPackageDir, 'yt_dlp_plugins'), {
      recursive: true,
    });
    fs.mkdirSync(path.dirname(paths.bgutilProviderPath), { recursive: true });
    fs.writeFileSync(paths.pythonPath, 'python');
    fs.writeFileSync(paths.bgutilProviderPath, 'provider');
    fs.writeFileSync(
      paths.manifestPath,
      JSON.stringify({ version: 'provider-previous' }),
    );

    expect(
      listFeatureDependencyStatuses(userDataDir, [dependency])[0],
    ).toMatchObject({
      id: dependency.id,
      installed: true,
      installedVersion: 'provider-previous',
      updateAvailable: true,
    });
  });
});

describe('model feature dependencies', () => {
  it('pins HQ4 as the active general dependency and hides superseded HQ3', () => {
    expect(getSeparationModelDependency('inst-hq4')).toMatchObject({
      id: 'uvr-mdxnet-inst-hq-4',
      version: 'UVR-MDX-NET-Inst_HQ_4',
      sha256:
        '3c4b5b9b05090fdf238f38ba5046813982d50e2a652e9cb3324ea79720c3c9c8',
      expectedSize: 59074342,
      supersedes: ['uvr-mdxnet-inst-hq-3'],
    });
    expect(getFeatureDependencies().map(({ id }) => id)).not.toContain(
      'uvr-mdxnet-inst-hq-3',
    );
    expect(getFeatureDependency('uvr-mdxnet-inst-hq-3')).toMatchObject({
      deprecated: true,
      modelId: 'inst-hq3',
    });
  });

  it('removes a superseded managed model only after the replacement verifies', async () => {
    const userDataDir = makeTempDir();
    const oldBuffer = Buffer.from('old model bytes');
    const newBuffer = Buffer.from('new model bytes');
    const oldDependency = {
      ...makeModelDependency(oldBuffer),
      id: 'old-model',
      modelId: 'old-model-id',
      deprecated: true,
    };
    const newDependency = {
      ...makeModelDependency(newBuffer),
      id: 'new-model',
      modelId: 'new-model-id',
      supersedes: [oldDependency.id],
    };
    const oldPaths = getModelDependencyPaths(userDataDir, oldDependency);
    fs.mkdirSync(path.dirname(oldPaths.filePath), { recursive: true });
    fs.writeFileSync(oldPaths.filePath, oldBuffer);

    await ensureModelDependency(userDataDir, newDependency.modelId, {
      dependency: newDependency,
      registryDependencies: [oldDependency, newDependency],
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(arrayBufferFrom(newBuffer)),
      }),
    });

    expect(fs.existsSync(oldPaths.installDir)).toBe(false);
    expect(
      fs.existsSync(
        getModelDependencyPaths(userDataDir, newDependency).filePath,
      ),
    ).toBe(true);
  });

  it('keeps the superseded model when replacement verification fails', async () => {
    const userDataDir = makeTempDir();
    const oldBuffer = Buffer.from('old model bytes');
    const expectedNewBuffer = Buffer.from('expected new model bytes');
    const oldDependency = {
      ...makeModelDependency(oldBuffer),
      id: 'old-model',
      modelId: 'old-model-id',
      deprecated: true,
    };
    const newDependency = {
      ...makeModelDependency(expectedNewBuffer),
      id: 'new-model',
      modelId: 'new-model-id',
      supersedes: [oldDependency.id],
    };
    const oldPaths = getModelDependencyPaths(userDataDir, oldDependency);
    fs.mkdirSync(path.dirname(oldPaths.filePath), { recursive: true });
    fs.writeFileSync(oldPaths.filePath, oldBuffer);

    await expect(
      ensureModelDependency(userDataDir, newDependency.modelId, {
        dependency: newDependency,
        registryDependencies: [oldDependency, newDependency],
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(arrayBufferFrom(Buffer.from('corrupt'))),
        }),
      }),
    ).rejects.toThrow(/size|checksum/i);

    expect(fs.existsSync(oldPaths.filePath)).toBe(true);
  });

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
    expect(fetchImpl).toHaveBeenCalledWith(dependency.downloadUrl, {
      signal: expect.any(AbortSignal),
    });
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

  it('rejects a model download that exceeds the declared expected size', async () => {
    const userDataDir = makeTempDir();
    const modelBuffer = Buffer.from('oversized model bytes');
    const dependency = {
      ...makeModelDependency(modelBuffer),
      expectedSize: 4,
    };

    await expect(
      ensureModelDependency(userDataDir, 'unused', {
        dependency,
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () => Promise.resolve(arrayBufferFrom(modelBuffer)),
        }),
      }),
    ).rejects.toThrow(/exceeds allowed size/);
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

    expect(fetchImpl).toHaveBeenCalledWith(dependency.downloadUrl, {
      signal: expect.any(AbortSignal),
    });
    expect(fs.readFileSync(paths.filePath)).toEqual(modelBuffer);
    expect(status).toMatchObject({
      id: dependency.id,
      installed: true,
    });
  });
});
