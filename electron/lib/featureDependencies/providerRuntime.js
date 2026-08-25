'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteBuffer } = require('../atomicWrite');
const { FEATURE_IDS } = require('../featureGates');
const {
  buildProviderRuntimePaths,
  ensureBgutilPluginPackageMarkers,
  getMissingProviderRuntimeArtifacts,
  getProviderRuntimePaths,
  isProviderRuntimeInstalled,
  writePythonPathConfig,
} = require('../providerRuntime');
const { getYtdlpDependency, getYtdlpPaths } = require('./registry');
const { downloadBuffer, emitProgress, sha256 } = require('./download');
const { expandZipArchive, validateZipArchiveBuffer } = require('./archive');
const {
  createMissingDependencyError,
  writeDependencyManifest,
  writeDependencyNotices,
} = require('./manifests');

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
    const missingArtifacts = getMissingProviderRuntimeArtifacts(tmpPaths, {
      requireManifest: false,
    });
    if (missingArtifacts.length > 0) {
      throw new Error(
        `provider runtime install did not produce required artifacts: ${missingArtifacts.join(', ')}`,
      );
    }
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

module.exports = {
  ensureYtdlpDependency,
  getPreparedYtdlpPath,
};
