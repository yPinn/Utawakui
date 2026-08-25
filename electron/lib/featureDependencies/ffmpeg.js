'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteBuffer } = require('../atomicWrite');
const { FEATURE_IDS } = require('../featureGates');
const { getFfmpegDependency, getFfmpegPaths } = require('./registry');
const {
  downloadBuffer,
  downloadText,
  emitProgress,
  sha256,
} = require('./download');
const { expandZipArchive, validateZipArchiveBuffer } = require('./archive');
const {
  createMissingDependencyError,
  writeDependencyManifest,
  writeDependencyNotices,
} = require('./manifests');

function parseSha256Text(text) {
  const match = String(text).match(/\b[a-fA-F0-9]{64}\b/);
  if (!match) {
    throw new Error('FFmpeg checksum metadata did not contain a SHA-256 hash');
  }
  return match[0].toLowerCase();
}

function replaceVersionTemplate(value, version) {
  if (typeof value !== 'string') return value;
  return value.replaceAll('{version}', version);
}

async function resolveFfmpegDependency(dependency, options = {}) {
  const fetchImpl = options.fetchImpl;
  const resolvedVersion = dependency.versionUrl
    ? await downloadText(dependency.versionUrl, fetchImpl)
    : dependency.version;
  const resolvedSha = dependency.sha256Url
    ? parseSha256Text(await downloadText(dependency.sha256Url, fetchImpl))
    : dependency.sha256;

  if (!resolvedSha) {
    throw new Error(`missing FFmpeg checksum for ${dependency.id}`);
  }

  return {
    ...dependency,
    version: resolvedVersion,
    installVersion: dependency.installVersion || dependency.version,
    sha256: resolvedSha,
    archiveRoot: replaceVersionTemplate(
      dependency.archiveRoot,
      resolvedVersion,
    ),
  };
}

function getFfmpegArchiveCachePath(userDataDir, dependency) {
  const { installDir } = getFfmpegPaths(userDataDir, dependency);
  const cacheDir = path.join(path.dirname(installDir), '_archives');
  return {
    cacheDir,
    archivePath: path.join(cacheDir, `${dependency.sha256}.zip`),
  };
}

function readCachedArchive(cachePath, expectedSha) {
  try {
    if (!fs.existsSync(cachePath)) return null;
    const archive = fs.readFileSync(cachePath);
    if (sha256(archive) === expectedSha) return archive;
    fs.rmSync(cachePath, { force: true });
    return null;
  } catch {
    return null;
  }
}

function pruneFfmpegArchiveCache(cacheDir, keepPath) {
  try {
    if (!fs.existsSync(cacheDir)) return;
    for (const entry of fs.readdirSync(cacheDir)) {
      const entryPath = path.join(cacheDir, entry);
      if (entryPath !== keepPath) {
        fs.rmSync(entryPath, { recursive: true, force: true });
      }
    }
  } catch {
    // A stale cache only affects retry speed, never correctness.
  }
}

async function getVerifiedFfmpegArchive(
  userDataDir,
  resolvedDependency,
  options = {},
) {
  const { cacheDir, archivePath } = getFfmpegArchiveCachePath(
    userDataDir,
    resolvedDependency,
  );
  const cachedArchive = readCachedArchive(
    archivePath,
    resolvedDependency.sha256,
  );
  if (cachedArchive) {
    emitProgress(options, { stage: 'verifying' });
    return { archive: cachedArchive, cachePath: archivePath };
  }

  const archive = await downloadBuffer(
    resolvedDependency.downloadUrl,
    options.fetchImpl,
    options,
    resolvedDependency,
  );
  emitProgress(options, { stage: 'verifying' });
  const actualSha = sha256(archive);
  if (actualSha !== resolvedDependency.sha256) {
    throw new Error(
      `Downloaded FFmpeg checksum ${actualSha} does not match expected ${resolvedDependency.sha256}`,
    );
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  atomicWriteBuffer(archivePath, archive);
  pruneFfmpegArchiveCache(cacheDir, archivePath);
  return { archive, cachePath: archivePath };
}

async function ensureFfmpegDependency(userDataDir, options = {}) {
  if (process.platform !== 'win32' && !options.allowNonWindows) {
    throw new Error(
      'app-managed FFmpeg provisioning is currently implemented for Windows only',
    );
  }

  const dependency = options.dependency || getFfmpegDependency();
  if (
    dependency.featureId !== FEATURE_IDS.AUDIO_PROCESSING_FLOW ||
    dependency.platform !== 'win32'
  ) {
    throw new Error(`unsupported FFmpeg dependency manifest: ${dependency.id}`);
  }

  const { installDir, manifestPath, executablePath } = getFfmpegPaths(
    userDataDir,
    dependency,
  );
  if (fs.existsSync(executablePath)) {
    writeDependencyNotices(installDir, dependency);
    if (!fs.existsSync(manifestPath)) {
      writeDependencyManifest(manifestPath, dependency, options);
    }
    return executablePath;
  }

  const dependenciesRoot = path.dirname(installDir);
  fs.mkdirSync(dependenciesRoot, { recursive: true });

  const tmpRoot = path.join(
    dependenciesRoot,
    `.ffmpeg-${dependency.version}-${process.pid}-${Date.now()}.tmp`,
  );
  const archivePath = path.join(tmpRoot, 'ffmpeg.zip');

  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });

    const resolvedDependency = await resolveFfmpegDependency(
      dependency,
      options,
    );
    const extractedRoot = path.join(tmpRoot, resolvedDependency.archiveRoot);
    const { archive, cachePath } = await getVerifiedFfmpegArchive(
      userDataDir,
      resolvedDependency,
      options,
    );

    const extractArchive = options.extractArchive || expandZipArchive;
    if (extractArchive === expandZipArchive) {
      validateZipArchiveBuffer(archive, tmpRoot, resolvedDependency);
    }

    atomicWriteBuffer(archivePath, archive);
    emitProgress(options, { stage: 'installing' });
    await extractArchive(archivePath, tmpRoot, resolvedDependency, options);

    const extractedExecutable = path.join(
      extractedRoot,
      resolvedDependency.executableRelativePath,
    );
    if (!fs.existsSync(extractedExecutable)) {
      throw new Error(
        `FFmpeg archive did not contain ${resolvedDependency.executableRelativePath}`,
      );
    }

    fs.rmSync(installDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(installDir), { recursive: true });
    fs.renameSync(extractedRoot, installDir);
    writeDependencyNotices(installDir, resolvedDependency);
    writeDependencyManifest(manifestPath, resolvedDependency, options);
    fs.rmSync(cachePath, { force: true });
    emitProgress(options, { stage: 'ready', percent: 100 });
    return executablePath;
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

// systemFfmpegPath is config.json's opt-in path (see systemFfmpeg.js's
// detectSystemFfmpeg()) — main only ever writes it after re-detecting and
// smoke-testing it itself, so a non-null value here is trusted, but the
// file can still have vanished since (uninstalled, PATH changed) without
// the app restarting, so existence is still checked at call time exactly
// like the managed path below.
function getPreparedFfmpegPath(userDataDir, systemFfmpegPath = null) {
  if (systemFfmpegPath) {
    if (!fs.existsSync(systemFfmpegPath)) {
      throw createMissingDependencyError({
        ...getFfmpegDependency(),
        name: '系統 FFmpeg',
      });
    }
    return systemFfmpegPath;
  }

  const dependency = getFfmpegDependency();
  const { executablePath } = getFfmpegPaths(userDataDir, dependency);
  if (!fs.existsSync(executablePath)) {
    throw createMissingDependencyError(dependency);
  }
  return executablePath;
}

module.exports = {
  ensureFfmpegDependency,
  getPreparedFfmpegPath,
};
