'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const registry = require('../../shared/featureDependencies.json');
const { FEATURE_IDS } = require('./featureGates');
const {
  atomicWriteBuffer,
  atomicWriteText,
  atomicWriteJson,
} = require('./atomicWrite');

const FEATURE_DEPENDENCIES_DIRNAME = 'dependencies';
const FFMPEG_DEPENDENCY_ID = 'ffmpeg-gyan-essentials';
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
  const installDir = path.join(
    userDataDir,
    FEATURE_DEPENDENCIES_DIRNAME,
    'ffmpeg',
    dependency.version,
  );
  return {
    installDir,
    manifestPath: path.join(installDir, 'manifest.json'),
    executablePath: path.join(installDir, dependency.executableRelativePath),
  };
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

async function downloadBuffer(url, fetchImpl = fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download feature dependency: HTTP ${response.status}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
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

function expandZipArchive(archivePath, destinationDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn(resolvePowerShellPath(), [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force',
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
            `failed to extract FFmpeg archive (code ${code}): ${stderr}`,
          ),
        );
        return;
      }
      resolve();
    });
  });
}

function writeDependencyNotices(installDir, dependency) {
  const dependencyRole =
    dependency.kind === 'model'
      ? 'This model is managed by Utawakui for the audio-processing-flow feature.'
      : 'This FFmpeg binary is managed by Utawakui for the audio-processing-flow feature.';
  atomicWriteText(
    path.join(installDir, 'SOURCE.txt'),
    [
      `${dependency.name} ${dependency.version}`,
      `Source: ${dependency.sourceUrl}`,
      `Download: ${dependency.downloadUrl}`,
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
    downloadUrl: dependency.downloadUrl,
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

function readInstalledAt(manifestPath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return typeof manifest.installedAt === 'string'
      ? manifest.installedAt
      : null;
  } catch {
    return null;
  }
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

function buildDependencyStatus(userDataDir, dependency) {
  if (dependency.id === FFMPEG_DEPENDENCY_ID) {
    const paths = getFfmpegPaths(userDataDir, dependency);
    const installed = fs.existsSync(paths.executablePath);
    return {
      ...dependency,
      installed,
      installedAt: installed ? readInstalledAt(paths.manifestPath) : null,
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
) {
  return dependencies.map((dependency) =>
    buildDependencyStatus(userDataDir, dependency),
  );
}

function createMissingDependencyError(dependency) {
  const err = new Error(
    `請先到設定頁準備「${dependency.name}」，再執行這項音訊處理。`,
  );
  err.code = 'FEATURE_DEPENDENCY_MISSING';
  err.dependencyId = dependency.id;
  return err;
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
  const extractedRoot = path.join(tmpRoot, dependency.archiveRoot);

  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });

    const archive = await downloadBuffer(
      dependency.downloadUrl,
      options.fetchImpl,
    );
    const actualSha = sha256(archive);
    if (actualSha !== dependency.sha256) {
      throw new Error(
        `Downloaded FFmpeg checksum ${actualSha} does not match expected ${dependency.sha256}`,
      );
    }

    atomicWriteBuffer(archivePath, archive);
    await (options.extractArchive || expandZipArchive)(
      archivePath,
      tmpRoot,
      dependency,
    );

    const extractedExecutable = path.join(
      extractedRoot,
      dependency.executableRelativePath,
    );
    if (!fs.existsSync(extractedExecutable)) {
      throw new Error(
        `FFmpeg archive did not contain ${dependency.executableRelativePath}`,
      );
    }

    fs.rmSync(installDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(installDir), { recursive: true });
    fs.renameSync(extractedRoot, installDir);
    writeDependencyNotices(installDir, dependency);
    writeDependencyManifest(manifestPath, dependency, options);
    return executablePath;
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function getPreparedFfmpegPath(userDataDir) {
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
  validateDownloadedModel(buffer, dependency);
  const { installDir, manifestPath, filePath } = getModelDependencyPaths(
    userDataDir,
    dependency,
  );
  fs.mkdirSync(installDir, { recursive: true });
  atomicWriteBuffer(filePath, buffer);
  writeDependencyNotices(installDir, dependency);
  writeDependencyManifest(manifestPath, dependency, options);
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

  if (dependency.kind === 'model') {
    await ensureModelDependency(userDataDir, dependency.modelId, {
      ...options,
      dependency,
    });
    return buildDependencyStatus(userDataDir, dependency);
  }

  throw new Error(`unsupported feature dependency: ${dependency.id}`);
}

module.exports = {
  FFMPEG_DEPENDENCY_ID,
  SEPARATION_MODEL_DEPENDENCY_IDS,
  getFeatureDependency,
  getFeatureDependencies,
  getFfmpegDependency,
  getSeparationModelDependency,
  getFfmpegPaths,
  getModelDependencyPaths,
  listFeatureDependencyStatuses,
  ensureFfmpegDependency,
  ensureModelDependency,
  getPreparedFfmpegPath,
  getPreparedSeparationModelPath,
  prepareFeatureDependency,
  sha256,
};
