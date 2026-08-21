'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const registry = require('../../shared/featureDependencies.json');
const { createAppError } = require('./appError');
const { FEATURE_IDS } = require('./featureGates');
const {
  atomicWriteBuffer,
  atomicWriteText,
  atomicWriteJson,
} = require('./atomicWrite');
const {
  buildProviderRuntimePaths,
  ensureBgutilPluginPackageMarkers,
  getProviderRuntimePaths,
  isProviderRuntimeInstalled,
  writePythonPathConfig,
} = require('./providerRuntime');

const FEATURE_DEPENDENCIES_DIRNAME = 'dependencies';
const FFMPEG_DEPENDENCY_ID = 'ffmpeg-gyan-essentials';
const YTDLP_DEPENDENCY_ID = 'yt-dlp-provider-tool';
const DEFAULT_MAX_FEATURE_DEPENDENCY_DOWNLOAD_BYTES = 512 * 1024 * 1024;
const SEPARATION_MODEL_DEPENDENCY_IDS = Object.freeze({
  kara2: 'uvr-mdxnet-kara-2',
  'inst-hq3': 'uvr-mdxnet-inst-hq-3',
});

function getFeatureDependency(
  dependencyId,
  dependencies = registry.dependencies,
) {
  return (
    dependencies.find((dependency) => dependency.id === dependencyId) || null
  );
}

function getFeatureDependencies(dependencies = registry.dependencies) {
  return dependencies.slice();
}

function getFfmpegDependency() {
  const dependency = getFeatureDependency(FFMPEG_DEPENDENCY_ID);
  if (!dependency)
    throw new Error(`missing feature dependency: ${FFMPEG_DEPENDENCY_ID}`);
  return dependency;
}

function getYtdlpDependency() {
  const dependency = getFeatureDependency(YTDLP_DEPENDENCY_ID);
  if (!dependency)
    throw new Error(`missing feature dependency: ${YTDLP_DEPENDENCY_ID}`);
  return dependency;
}

function getSeparationModelDependency(modelId) {
  const dependencyId = SEPARATION_MODEL_DEPENDENCY_IDS[modelId];
  if (!dependencyId) throw new Error(`unknown separation model: ${modelId}`);
  const dependency = getFeatureDependency(dependencyId);
  if (!dependency)
    throw new Error(`missing feature dependency: ${dependencyId}`);
  return dependency;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getFfmpegPaths(userDataDir, dependency = getFfmpegDependency()) {
  const installVersion = dependency.installVersion || dependency.version;
  const installDir = path.join(
    userDataDir,
    FEATURE_DEPENDENCIES_DIRNAME,
    'ffmpeg',
    installVersion,
  );
  return {
    installDir,
    manifestPath: path.join(installDir, 'manifest.json'),
    executablePath: path.join(installDir, dependency.executableRelativePath),
  };
}

function getYtdlpPaths(userDataDir, dependency = getYtdlpDependency()) {
  if (dependency.kind !== 'runtime') {
    throw new Error(`unsupported yt-dlp dependency manifest: ${dependency.id}`);
  }
  return getProviderRuntimePaths(userDataDir);
}

function getModelDependencyPaths(userDataDir, dependency) {
  const installDir = path.join(
    userDataDir,
    FEATURE_DEPENDENCIES_DIRNAME,
    'models',
    dependency.id,
    dependency.version,
  );
  return {
    installDir,
    manifestPath: path.join(installDir, 'manifest.json'),
    filePath: path.join(installDir, dependency.fileRelativePath),
    legacyPath: path.join(userDataDir, 'models', dependency.fileRelativePath),
  };
}

function getManagedDependencyInstallDir(userDataDir, dependency) {
  if (dependency.id === YTDLP_DEPENDENCY_ID) {
    return getYtdlpPaths(userDataDir, dependency).installDir;
  }

  if (dependency.id === FFMPEG_DEPENDENCY_ID) {
    return getFfmpegPaths(userDataDir, dependency).installDir;
  }

  if (dependency.kind === 'model') {
    return getModelDependencyPaths(userDataDir, dependency).installDir;
  }

  throw new Error(`unsupported feature dependency: ${dependency.id}`);
}

function emitProgress(options, payload) {
  options.onProgress?.(payload);
}

function readContentLength(response) {
  const value = response.headers?.get?.('content-length');
  const total = Number(value);
  return Number.isFinite(total) && total > 0 ? total : null;
}

function downloadSizeLimit(dependency) {
  const maxDownloadSize = Number(dependency?.maxDownloadSize);
  if (Number.isSafeInteger(maxDownloadSize) && maxDownloadSize > 0) {
    return maxDownloadSize;
  }

  const expectedSize = Number(dependency?.expectedSize);
  return Number.isSafeInteger(expectedSize) && expectedSize > 0
    ? expectedSize
    : DEFAULT_MAX_FEATURE_DEPENDENCY_DOWNLOAD_BYTES;
}

function dependencyDownloadLabel(dependency) {
  return dependency?.role || dependency?.id || dependency?.name || 'dependency';
}

function assertDownloadSizeWithinLimit(size, dependency) {
  const limit = downloadSizeLimit(dependency);
  if (size > limit) {
    throw new Error(
      `Downloaded ${dependencyDownloadLabel(dependency)} exceeds allowed size (${size} > ${limit})`,
    );
  }
}

function zipEntrySegments(entryName) {
  return String(entryName).replaceAll('\\', '/').split('/').filter(Boolean);
}

function validateZipEntryName(entryName, destinationDir, dependency) {
  const normalizedName = String(entryName || '');
  const label = dependencyDownloadLabel(dependency);
  if (
    normalizedName.length === 0 ||
    path.isAbsolute(normalizedName) ||
    path.win32.isAbsolute(normalizedName) ||
    zipEntrySegments(normalizedName).includes('..')
  ) {
    throw new Error(
      `Archive entry extracts outside the destination for ${label}: ${normalizedName}`,
    );
  }

  const resolvedDestination = path.resolve(destinationDir);
  const resolvedEntry = path.resolve(resolvedDestination, normalizedName);
  const relative = path.relative(resolvedDestination, resolvedEntry);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Archive entry extracts outside the destination for ${label}: ${normalizedName}`,
    );
  }
}

function findZipEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function validateZipArchiveBuffer(buffer, destinationDir, dependency) {
  const eocdOffset = findZipEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) {
    throw new Error(
      `Invalid feature dependency archive for ${dependencyDownloadLabel(dependency)}`,
    );
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (
    centralDirectoryOffset < 0 ||
    centralDirectoryEnd > eocdOffset ||
    centralDirectoryEnd > buffer.length
  ) {
    throw new Error(
      `Invalid feature dependency archive for ${dependencyDownloadLabel(dependency)}`,
    );
  }

  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > centralDirectoryEnd) {
      throw new Error(
        `Invalid feature dependency archive for ${dependencyDownloadLabel(dependency)}`,
      );
    }
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(
        `Invalid feature dependency archive for ${dependencyDownloadLabel(dependency)}`,
      );
    }

    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const filenameStart = offset + 46;
    const filenameEnd = filenameStart + filenameLength;
    if (filenameEnd > centralDirectoryEnd) {
      throw new Error(
        `Invalid feature dependency archive for ${dependencyDownloadLabel(dependency)}`,
      );
    }
    validateZipEntryName(
      buffer.toString('utf8', filenameStart, filenameEnd),
      destinationDir,
      dependency,
    );
    offset = filenameEnd + extraLength + commentLength;
  }
}

async function readResponseBuffer(response, options = {}, dependency = null) {
  const total = readContentLength(response);
  if (total) assertDownloadSizeWithinLimit(total, dependency);

  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    assertDownloadSizeWithinLimit(buffer.length, dependency);
    emitProgress(options, { stage: 'downloading', percent: 100 });
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let lastPercent = -1;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    received += chunk.length;
    assertDownloadSizeWithinLimit(received, dependency);

    if (total) {
      const percent = Math.min(100, Math.floor((received / total) * 100));
      if (percent !== lastPercent) {
        lastPercent = percent;
        emitProgress(options, { stage: 'downloading', percent });
      }
    } else {
      emitProgress(options, { stage: 'downloading' });
    }
  }

  if (total && lastPercent < 100) {
    emitProgress(options, { stage: 'downloading', percent: 100 });
  }
  return Buffer.concat(chunks);
}

async function downloadBuffer(
  url,
  fetchImpl = fetch,
  options = {},
  dependency = null,
) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download feature dependency: HTTP ${response.status}`,
    );
  }
  return readResponseBuffer(response, options, dependency);
}

async function downloadText(url, fetchImpl = fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download feature dependency metadata: HTTP ${response.status}`,
    );
  }
  return (await response.text()).trim();
}

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

function resolvePowerShellPath() {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const windowsPowerShell = path.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  return fs.existsSync(windowsPowerShell)
    ? windowsPowerShell
    : 'powershell.exe';
}

function expandZipArchive(
  archivePath,
  destinationDir,
  _dependency,
  options = {},
) {
  return new Promise((resolve, reject) => {
    const spawnImpl = options.spawnImpl || spawn;
    const proc = spawnImpl(resolvePowerShellPath(), [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      [
        '& {',
        'param([string]$ArchivePath, [string]$DestinationPath)',
        'Add-Type -AssemblyName System.IO.Compression.FileSystem',
        '$root = [System.IO.Path]::GetFullPath($DestinationPath)',
        'if (-not $root.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {',
        '$root = $root + [System.IO.Path]::DirectorySeparatorChar',
        '}',
        '$archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)',
        'try {',
        'foreach ($entry in $archive.Entries) {',
        '$target = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($DestinationPath, $entry.FullName));',
        'if (-not $target.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {',
        'throw "Archive entry extracts outside the destination: $($entry.FullName)"',
        '}',
        '}',
        '} finally {',
        '$archive.Dispose()',
        '}',
        'Expand-Archive -LiteralPath $ArchivePath -DestinationPath $DestinationPath -Force',
        '}',
      ].join(' '),
      archivePath,
      destinationDir,
    ]);
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `failed to extract feature dependency archive (code ${code}): ${stderr}`,
          ),
        );
        return;
      }
      resolve();
    });
  });
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

function requireDependencyArtifact(dependency, role) {
  const artifact = dependency.artifacts?.find((item) => item.role === role);
  if (!artifact) {
    throw new Error(`missing provider runtime artifact: ${role}`);
  }
  return artifact;
}

async function downloadVerifiedArtifact(artifact, options = {}) {
  const buffer = await downloadBuffer(
    artifact.downloadUrl,
    options.fetchImpl,
    options,
    artifact,
  );
  emitProgress(options, { stage: 'verifying' });
  const actualSha = sha256(buffer);
  if (actualSha !== artifact.sha256) {
    throw new Error(
      `Downloaded ${artifact.role} checksum ${actualSha} does not match expected ${artifact.sha256}`,
    );
  }
  return buffer;
}

async function extractZipBuffer(
  buffer,
  destinationDir,
  artifact,
  options = {},
) {
  const extractArchive = options.extractArchive || expandZipArchive;
  if (extractArchive === expandZipArchive) {
    validateZipArchiveBuffer(buffer, destinationDir, artifact);
  }

  const archivePath = path.join(destinationDir, `${artifact.role}.zip`);
  atomicWriteBuffer(archivePath, buffer);
  try {
    await extractArchive(archivePath, destinationDir, artifact, options);
  } finally {
    fs.rmSync(archivePath, { force: true });
  }
}

async function installProviderRuntimeArtifacts(
  paths,
  dependency,
  options = {},
) {
  const pythonArtifact = requireDependencyArtifact(dependency, 'python-embed');
  const ytDlpArtifact = requireDependencyArtifact(dependency, 'yt-dlp-wheel');
  const providerArtifact = requireDependencyArtifact(
    dependency,
    'bgutil-provider-exe',
  );
  const pluginArtifact = requireDependencyArtifact(dependency, 'bgutil-plugin');

  fs.mkdirSync(paths.pythonDir, { recursive: true });
  fs.mkdirSync(paths.sitePackagesDir, { recursive: true });
  fs.mkdirSync(paths.pluginPackageDir, { recursive: true });
  fs.mkdirSync(path.dirname(paths.bgutilProviderPath), { recursive: true });
  fs.mkdirSync(paths.cacheDir, { recursive: true });

  emitProgress(options, { stage: 'downloading' });
  const pythonArchive = await downloadVerifiedArtifact(pythonArtifact, options);
  emitProgress(options, { stage: 'installing' });
  await extractZipBuffer(
    pythonArchive,
    paths.pythonDir,
    pythonArtifact,
    options,
  );
  writePythonPathConfig(paths);

  emitProgress(options, { stage: 'downloading' });
  const ytDlpWheel = await downloadVerifiedArtifact(ytDlpArtifact, options);
  emitProgress(options, { stage: 'installing' });
  await extractZipBuffer(ytDlpWheel, paths.sitePackagesDir, ytDlpArtifact, {
    ...options,
    extractArchive: options.extractWheel || options.extractArchive,
  });

  emitProgress(options, { stage: 'downloading' });
  const providerExe = await downloadVerifiedArtifact(providerArtifact, options);
  atomicWriteBuffer(paths.bgutilProviderPath, providerExe);

  emitProgress(options, { stage: 'downloading' });
  const pluginZip = await downloadVerifiedArtifact(pluginArtifact, options);
  emitProgress(options, { stage: 'installing' });
  await extractZipBuffer(pluginZip, paths.pluginPackageDir, pluginArtifact, {
    ...options,
    extractArchive: options.extractPlugin || options.extractArchive,
  });
  ensureBgutilPluginPackageMarkers(paths);
}

function writeDependencyNotices(installDir, dependency) {
  const dependencyRole = (() => {
    if (dependency.id === YTDLP_DEPENDENCY_ID) {
      return 'This provider runtime is managed by Utawakui for the provider-flow feature.';
    }
    if (dependency.kind === 'model') {
      return 'This model is managed by Utawakui for the audio-processing-flow feature.';
    }
    return 'This FFmpeg binary is managed by Utawakui for the audio-processing-flow feature.';
  })();
  atomicWriteText(
    path.join(installDir, 'SOURCE.txt'),
    [
      `${dependency.name} ${dependency.version}`,
      `Source: ${dependency.sourceUrl}`,
      dependency.downloadUrl
        ? `Download: ${dependency.downloadUrl}`
        : `Bundled source: ${dependency.bundledRelativePath}`,
      `License: ${dependency.license}`,
      `License info: ${dependency.licenseUrl}`,
      '',
      dependencyRole,
      'It is stored under the current user profile and is removed when Utawakui app data is cleaned.',
      '',
    ].join('\n'),
  );
  atomicWriteText(
    path.join(installDir, 'LICENSE.txt'),
    [
      `${dependency.name} is distributed under ${dependency.license}.`,
      `See ${dependency.licenseUrl} and ${dependency.sourceUrl} for upstream licensing details.`,
      '',
    ].join('\n'),
  );
}

function writeDependencyManifest(manifestPath, dependency, options = {}) {
  atomicWriteJson(manifestPath, {
    id: dependency.id,
    featureId: dependency.featureId,
    name: dependency.name,
    version: dependency.version,
    license: dependency.license,
    sourceUrl: dependency.sourceUrl,
    ...(dependency.downloadUrl ? { downloadUrl: dependency.downloadUrl } : {}),
    ...(Array.isArray(dependency.artifacts)
      ? {
          artifacts: dependency.artifacts.map((artifact) => ({
            role: artifact.role,
            name: artifact.name,
            version: artifact.version,
            sourceUrl: artifact.sourceUrl,
            downloadUrl: artifact.downloadUrl,
            sha256: artifact.sha256,
          })),
        }
      : {}),
    ...(dependency.bundledRelativePath
      ? { bundledRelativePath: dependency.bundledRelativePath }
      : {}),
    sha256: dependency.sha256,
    installedAt: (options.now || (() => new Date()))().toISOString(),
    ...(dependency.executableRelativePath
      ? { executableRelativePath: dependency.executableRelativePath }
      : {}),
    ...(dependency.fileRelativePath
      ? { fileRelativePath: dependency.fileRelativePath }
      : {}),
    ...(dependency.modelId ? { modelId: dependency.modelId } : {}),
  });
}

function readDependencyManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function readInstalledAt(manifestPath) {
  const manifest = readDependencyManifest(manifestPath);
  return typeof manifest?.installedAt === 'string'
    ? manifest.installedAt
    : null;
}

function readInstalledVersion(manifestPath) {
  const manifest = readDependencyManifest(manifestPath);
  return typeof manifest?.version === 'string' ? manifest.version : null;
}

function isModelFileValid(filePath, dependency, options = {}) {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  if (stat.size !== dependency.expectedSize) return false;
  if (options.verifySha) {
    return sha256(fs.readFileSync(filePath)) === dependency.sha256;
  }
  return true;
}

function buildDependencyStatus(userDataDir, dependency, systemFfmpegPath) {
  if (dependency.id === YTDLP_DEPENDENCY_ID) {
    const paths = getYtdlpPaths(userDataDir, dependency);
    const installed = isProviderRuntimeInstalled(paths);
    return {
      ...dependency,
      installed,
      installedAt: installed ? readInstalledAt(paths.manifestPath) : null,
      installedVersion: installed
        ? readInstalledVersion(paths.manifestPath)
        : null,
    };
  }

  if (dependency.id === FFMPEG_DEPENDENCY_ID) {
    // A live systemFfmpegPath always wins over the managed install's own
    // presence — separationHandlers.js resolves the same way (see
    // getPreparedFfmpegPath above), so the Settings row must agree with
    // what a separation run would actually use.
    if (systemFfmpegPath && fs.existsSync(systemFfmpegPath)) {
      return {
        ...dependency,
        installed: true,
        source: 'system',
        installedAt: null,
        installedVersion: null,
      };
    }

    const paths = getFfmpegPaths(userDataDir, dependency);
    const installed = fs.existsSync(paths.executablePath);
    return {
      ...dependency,
      installed,
      source: 'managed',
      installedAt: installed ? readInstalledAt(paths.manifestPath) : null,
      installedVersion: installed
        ? readInstalledVersion(paths.manifestPath)
        : null,
    };
  }

  if (dependency.kind === 'model') {
    const paths = getModelDependencyPaths(userDataDir, dependency);
    const installed = isModelFileValid(paths.filePath, dependency, {
      verifySha: true,
    });
    const legacyAvailable =
      !installed &&
      isModelFileValid(paths.legacyPath, dependency, { verifySha: true });
    return {
      ...dependency,
      installed,
      installedAt: installed ? readInstalledAt(paths.manifestPath) : null,
      installedVersion: installed
        ? readInstalledVersion(paths.manifestPath)
        : null,
      canMigrate: legacyAvailable,
    };
  }

  return {
    ...dependency,
    installed: false,
    installedAt: null,
  };
}

function listFeatureDependencyStatuses(
  userDataDir,
  dependencies = getFeatureDependencies(),
  systemFfmpegPath = null,
) {
  return dependencies.map((dependency) =>
    buildDependencyStatus(userDataDir, dependency, systemFfmpegPath),
  );
}

function createMissingDependencyError(dependency) {
  const isProviderTool = dependency.featureId === FEATURE_IDS.PROVIDER_FLOW;
  return createAppError({
    code: 'FEATURE_DEPENDENCY_MISSING',
    severity: 'warning',
    title: isProviderTool ? '需要先準備外部來源工具' : '需要先準備音訊處理項目',
    message: isProviderTool
      ? `請先到設定頁準備「${dependency.name}」，再使用外部來源。`
      : `請先到設定頁準備「${dependency.name}」，再執行這項音訊處理。`,
    actionLabel: '前往設定',
    context: {
      featureId: dependency.featureId,
      dependencyId: dependency.id,
    },
  });
}

async function ensureYtdlpDependency(userDataDir, options = {}) {
  const dependency = options.dependency || getYtdlpDependency();
  if (
    dependency.featureId !== FEATURE_IDS.PROVIDER_FLOW ||
    dependency.platform !== 'win32' ||
    dependency.kind !== 'runtime'
  ) {
    throw new Error(`unsupported yt-dlp dependency manifest: ${dependency.id}`);
  }

  return ensureProviderRuntimeDependency(userDataDir, dependency, options);
}

async function ensureProviderRuntimeDependency(
  userDataDir,
  dependency,
  options,
) {
  const paths = getProviderRuntimePaths(userDataDir);
  if (isProviderRuntimeInstalled(paths)) {
    writeDependencyNotices(paths.installDir, dependency);
    if (!fs.existsSync(paths.manifestPath)) {
      writeDependencyManifest(paths.manifestPath, dependency, options);
    }
    return paths;
  }

  const dependenciesRoot = path.dirname(paths.installDir);
  fs.mkdirSync(dependenciesRoot, { recursive: true });
  const tmpInstallDir = path.join(
    dependenciesRoot,
    `.ytdlp-${process.pid}-${Date.now()}.tmp`,
  );
  const tmpPaths = buildProviderRuntimePaths(tmpInstallDir);

  try {
    fs.rmSync(tmpInstallDir, { recursive: true, force: true });
    fs.mkdirSync(tmpInstallDir, { recursive: true });
    await installProviderRuntimeArtifacts(tmpPaths, dependency, options);
    writeDependencyNotices(tmpPaths.installDir, dependency);
    writeDependencyManifest(tmpPaths.manifestPath, dependency, options);
    fs.rmSync(paths.installDir, { recursive: true, force: true });
    fs.renameSync(tmpInstallDir, paths.installDir);
    emitProgress(options, { stage: 'ready', percent: 100 });
    return paths;
  } finally {
    fs.rmSync(tmpInstallDir, { recursive: true, force: true });
  }
}

function getPreparedYtdlpPath(userDataDir) {
  const dependency = getYtdlpDependency();
  const paths = getYtdlpPaths(userDataDir, dependency);
  if (!isProviderRuntimeInstalled(paths)) {
    throw createMissingDependencyError(dependency);
  }
  return paths;
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

function validateDownloadedModel(buffer, dependency) {
  if (buffer.length !== dependency.expectedSize) {
    throw new Error(
      `Downloaded model size ${buffer.length} does not match expected ${dependency.expectedSize}`,
    );
  }
  const actualSha = sha256(buffer);
  if (actualSha !== dependency.sha256) {
    throw new Error(
      `Downloaded model checksum ${actualSha} does not match expected ${dependency.sha256}`,
    );
  }
}

function installModelBuffer(userDataDir, dependency, buffer, options = {}) {
  emitProgress(options, { stage: 'verifying' });
  validateDownloadedModel(buffer, dependency);
  const { installDir, manifestPath, filePath } = getModelDependencyPaths(
    userDataDir,
    dependency,
  );
  fs.mkdirSync(installDir, { recursive: true });
  atomicWriteBuffer(filePath, buffer);
  writeDependencyNotices(installDir, dependency);
  writeDependencyManifest(manifestPath, dependency, options);
  emitProgress(options, { stage: 'ready', percent: 100 });
  return filePath;
}

async function ensureModelDependency(userDataDir, modelId, options = {}) {
  const dependency =
    options.dependency || getSeparationModelDependency(modelId);
  if (
    dependency.featureId !== FEATURE_IDS.AUDIO_PROCESSING_FLOW ||
    dependency.kind !== 'model'
  ) {
    throw new Error(`unsupported model dependency manifest: ${dependency.id}`);
  }

  const paths = getModelDependencyPaths(userDataDir, dependency);
  if (isModelFileValid(paths.filePath, dependency, { verifySha: true })) {
    writeDependencyNotices(paths.installDir, dependency);
    if (!fs.existsSync(paths.manifestPath)) {
      writeDependencyManifest(paths.manifestPath, dependency, options);
    }
    return paths.filePath;
  }

  if (isModelFileValid(paths.legacyPath, dependency, { verifySha: true })) {
    return installModelBuffer(
      userDataDir,
      dependency,
      fs.readFileSync(paths.legacyPath),
      options,
    );
  }

  const buffer = await downloadBuffer(
    dependency.downloadUrl,
    options.fetchImpl,
    options,
    dependency,
  );
  return installModelBuffer(userDataDir, dependency, buffer, options);
}

function getPreparedSeparationModelPath(userDataDir, modelId) {
  const dependency = getSeparationModelDependency(modelId);
  const { filePath } = getModelDependencyPaths(userDataDir, dependency);
  if (!isModelFileValid(filePath, dependency, { verifySha: true })) {
    throw createMissingDependencyError(dependency);
  }
  return filePath;
}

async function prepareFeatureDependency(
  userDataDir,
  dependencyId,
  options = {},
) {
  const dependency = getFeatureDependency(
    dependencyId,
    options.registryDependencies,
  );
  if (!dependency)
    throw new Error(`unknown feature dependency: ${dependencyId}`);

  if (dependency.id === FFMPEG_DEPENDENCY_ID) {
    await ensureFfmpegDependency(userDataDir, options);
    return buildDependencyStatus(userDataDir, dependency);
  }

  if (dependency.id === YTDLP_DEPENDENCY_ID) {
    await ensureYtdlpDependency(userDataDir, options);
    return buildDependencyStatus(userDataDir, dependency);
  }

  if (dependency.kind === 'model') {
    await ensureModelDependency(userDataDir, dependency.modelId, {
      ...options,
      dependency,
    });
    return buildDependencyStatus(userDataDir, dependency);
  }

  throw new Error(`unsupported feature dependency: ${dependency.id}`);
}

function removeFeatureDependency(userDataDir, dependencyId, options = {}) {
  const dependency = getFeatureDependency(
    dependencyId,
    options.registryDependencies,
  );
  if (!dependency)
    throw new Error(`unknown feature dependency: ${dependencyId}`);

  const installDir = getManagedDependencyInstallDir(userDataDir, dependency);
  fs.rmSync(installDir, { recursive: true, force: true });
  return buildDependencyStatus(userDataDir, dependency);
}

async function repairFeatureDependency(
  userDataDir,
  dependencyId,
  options = {},
) {
  removeFeatureDependency(userDataDir, dependencyId, options);
  return prepareFeatureDependency(userDataDir, dependencyId, options);
}

module.exports = {
  FFMPEG_DEPENDENCY_ID,
  YTDLP_DEPENDENCY_ID,
  SEPARATION_MODEL_DEPENDENCY_IDS,
  getFeatureDependency,
  getFeatureDependencies,
  getFfmpegDependency,
  getYtdlpDependency,
  getSeparationModelDependency,
  getFfmpegPaths,
  getYtdlpPaths,
  getModelDependencyPaths,
  getManagedDependencyInstallDir,
  listFeatureDependencyStatuses,
  ensureYtdlpDependency,
  ensureFfmpegDependency,
  ensureModelDependency,
  getPreparedYtdlpPath,
  getPreparedFfmpegPath,
  getPreparedSeparationModelPath,
  prepareFeatureDependency,
  removeFeatureDependency,
  repairFeatureDependency,
  sha256,
};
