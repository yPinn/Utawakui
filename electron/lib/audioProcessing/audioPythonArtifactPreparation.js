'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { atomicWriteBuffer, atomicWriteText } = require('../atomicWrite');
const {
  downloadBuffer,
  expandZipArchive,
  sha256,
  validateZipArchiveBuffer,
} = require('../featureDependencies');

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function verifyArtifactBytes(buffer, artifact) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length !== artifact.sizeBytes ||
    sha256(buffer) !== artifact.sha256
  ) {
    throw new Error(
      `audio Python artifact integrity failed: ${artifact.filename}`,
    );
  }
}

function artifactDownloadDescriptor(artifact) {
  return {
    ...artifact,
    expectedSize: artifact.sizeBytes,
    maxDownloadSize: artifact.sizeBytes,
    role: artifact.filename,
  };
}

async function defaultDownloadArtifact(artifact, { onProgress } = {}) {
  return downloadBuffer(
    artifact.url,
    undefined,
    { onProgress },
    artifactDownloadDescriptor(artifact),
  );
}

async function defaultExtractArchive({ buffer, destinationDir, artifact }) {
  validateZipArchiveBuffer(
    buffer,
    destinationDir,
    artifactDownloadDescriptor(artifact),
  );
  const archivePath = path.join(
    path.dirname(destinationDir),
    `.audio-python-${process.pid}-${Date.now()}-${artifact.filename}`,
  );
  try {
    atomicWriteBuffer(archivePath, buffer);
    await expandZipArchive(
      archivePath,
      destinationDir,
      artifactDownloadDescriptor(artifact),
    );
  } finally {
    fs.rmSync(archivePath, { force: true });
  }
}

function copyDirectoryContents(sourceDir, destinationDir) {
  if (!fs.existsSync(sourceDir)) return;
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    fs.cpSync(
      path.join(sourceDir, entry.name),
      path.join(destinationDir, entry.name),
      { recursive: true, force: true },
    );
  }
}

function spreadWheelData(sitePackagesPath) {
  for (const entry of fs.readdirSync(sitePackagesPath, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory() || !entry.name.endsWith('.data')) continue;
    const dataDir = path.join(sitePackagesPath, entry.name);
    copyDirectoryContents(path.join(dataDir, 'purelib'), sitePackagesPath);
    copyDirectoryContents(path.join(dataDir, 'platlib'), sitePackagesPath);
  }
}

function safeChildEnvironment() {
  const allowed = new Set([
    'NUMBER_OF_PROCESSORS',
    'PATH',
    'PATHEXT',
    'PROCESSOR_ARCHITECTURE',
    'PROCESSOR_IDENTIFIER',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'WINDIR',
  ]);
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      allowed.has(name.toUpperCase()),
    ),
  );
}

function defaultProbeEnvironment({
  pythonPath,
  environmentPath,
  probeImports,
  expectedPythonVersion,
  expectedPackages,
  spawnImpl = spawn,
}) {
  const expression = [
    'import importlib,importlib.metadata as metadata,json,sys',
    `sys.path.insert(0,${JSON.stringify(environmentPath)})`,
    `names=${JSON.stringify(probeImports)}`,
    `expected_python=${JSON.stringify(expectedPythonVersion)}`,
    `expected_packages=${JSON.stringify(expectedPackages)}`,
    '[importlib.import_module(name) for name in names]',
    'actual_python=".".join(str(part) for part in sys.version_info[:3])',
    'actual_packages={name:metadata.version(name) for name in expected_packages}',
    'assert actual_python == expected_python',
    'assert actual_packages == expected_packages',
    'print(json.dumps({"ready":True,"pythonVersion":actual_python,"packages":actual_packages}))',
  ].join(';');
  return new Promise((resolve, reject) => {
    const child = spawnImpl(pythonPath, ['-I', '-c', expression], {
      env: safeChildEnvironment(),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderrBytes = 0;
    child.stdout.on('data', (chunk) => {
      if (stdout.length <= 8192) stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes = Math.min(8192, stderrBytes + Buffer.byteLength(chunk));
    });
    child.on('error', () =>
      reject(new Error('audio Python environment probe failed')),
    );
    child.on('close', (code) => {
      if (code !== 0 || stdout.length > 8192 || stderrBytes > 8192) {
        reject(new Error('audio Python environment probe failed'));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (
          result.ready !== true ||
          result.pythonVersion !== expectedPythonVersion ||
          JSON.stringify(result.packages) !== JSON.stringify(expectedPackages)
        ) {
          throw new Error('invalid result');
        }
        resolve(result);
      } catch {
        reject(new Error('audio Python environment probe failed'));
      }
    });
  });
}

function manifestMatches(manifestPath, expected) {
  try {
    return (
      fs.existsSync(manifestPath) &&
      JSON.stringify(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))) ===
        JSON.stringify(expected)
    );
  } catch {
    return false;
  }
}

function completeRuntime(paths, runtimeManifest) {
  return (
    fs.existsSync(paths.pythonPath) &&
    manifestMatches(paths.manifestPath, runtimeManifest)
  );
}

function completeEnvironment(paths, environmentLock) {
  return (
    fs.existsSync(paths.sitePackagesPath) &&
    fs.existsSync(paths.manifestPath) &&
    manifestMatches(paths.manifestPath, environmentLock)
  );
}

function completeModel(paths, modelManifest) {
  return (
    manifestMatches(paths.manifestPath, modelManifest) &&
    modelManifest.files.every((file) => {
      const filePath = path.join(paths.installDir, file.filename);
      if (!fs.existsSync(filePath)) return false;
      const bytes = fs.readFileSync(filePath);
      return bytes.length === file.sizeBytes && sha256(bytes) === file.sha256;
    })
  );
}

function stagingPath(installDir, label) {
  return path.join(
    path.dirname(installDir),
    `.${label}-${process.pid}-${Date.now()}-${cryptoRandomSuffix()}.tmp`,
  );
}

function cryptoRandomSuffix() {
  return require('crypto').randomBytes(4).toString('hex');
}

function publishDirectory(stagingDir, installDir) {
  const backupDir = `${installDir}.replaced-${process.pid}-${Date.now()}`;
  fs.mkdirSync(path.dirname(installDir), { recursive: true });
  let backedUp = false;
  try {
    if (fs.existsSync(installDir)) {
      fs.renameSync(installDir, backupDir);
      backedUp = true;
    }
    fs.renameSync(stagingDir, installDir);
    if (backedUp) fs.rmSync(backupDir, { recursive: true, force: true });
  } catch (error) {
    if (!fs.existsSync(installDir) && backedUp && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, installDir);
    }
    throw error;
  }
}

async function installRuntime({
  host,
  refs,
  runtimeManifest,
  force,
  downloadArtifact,
  extractArchive,
  emitProgress,
}) {
  const paths = host.getRuntimeArtifactPaths(
    refs.runtime.familyId,
    refs.runtime.artifactHash,
  );
  if (!force && completeRuntime(paths, runtimeManifest)) return paths;
  const stagingDir = stagingPath(paths.installDir, 'runtime');
  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    const buffer = await downloadArtifact(runtimeManifest.artifact, {
      onProgress: ({ percent }) =>
        emitProgress({
          stage: 'downloading-runtime',
          ...(Number.isFinite(percent)
            ? { percent: Math.round(5 + percent * 0.15) }
            : {}),
        }),
    });
    verifyArtifactBytes(buffer, runtimeManifest.artifact);
    emitProgress({ stage: 'installing-runtime', percent: 20 });
    await extractArchive({
      buffer,
      destinationDir: stagingDir,
      artifact: runtimeManifest.artifact,
    });
    if (
      !fs.existsSync(
        path.join(stagingDir, runtimeManifest.entryPoint ?? 'python.exe'),
      )
    ) {
      throw new Error('audio Python runtime archive is incomplete');
    }
    atomicWriteText(
      path.join(stagingDir, 'manifest.json'),
      jsonBytes(runtimeManifest),
    );
    publishDirectory(stagingDir, paths.installDir);
    return paths;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

async function installEnvironment({
  host,
  refs,
  environmentLock,
  force,
  downloadArtifact,
  extractArchive,
  emitProgress,
}) {
  const paths = host.getEnvironmentPaths(
    refs.environment.id,
    refs.environment.lockHash,
  );
  if (!force && completeEnvironment(paths, environmentLock)) return paths;
  const stagingDir = stagingPath(paths.installDir, 'environment');
  const sitePackagesPath = path.join(stagingDir, 'Lib', 'site-packages');
  try {
    fs.mkdirSync(sitePackagesPath, { recursive: true });
    const count = environmentLock.packages.length;
    for (const [index, packageEntry] of environmentLock.packages.entries()) {
      const start = 24 + (index / count) * 54;
      const span = 54 / count;
      const buffer = await downloadArtifact(packageEntry.artifact, {
        onProgress: ({ percent }) =>
          emitProgress({
            stage: 'downloading-environment',
            ...(Number.isFinite(percent)
              ? { percent: Math.round(start + (percent / 100) * span) }
              : {}),
          }),
      });
      verifyArtifactBytes(buffer, packageEntry.artifact);
      await extractArchive({
        buffer,
        destinationDir: sitePackagesPath,
        artifact: packageEntry.artifact,
      });
      spreadWheelData(sitePackagesPath);
    }
    emitProgress({ stage: 'installing-environment', percent: 80 });
    atomicWriteText(
      path.join(stagingDir, 'manifest.json'),
      jsonBytes(environmentLock),
    );
    publishDirectory(stagingDir, paths.installDir);
    return paths;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

async function installModel({
  host,
  refs,
  modelManifest,
  force,
  downloadArtifact,
  emitProgress,
}) {
  const paths = host.getModelPaths(
    refs.model.kind,
    refs.model.id,
    refs.model.version,
  );
  if (!force && completeModel(paths, modelManifest)) return paths;
  const stagingDir = stagingPath(paths.installDir, 'model');
  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    for (const modelFile of modelManifest.files) {
      const buffer = await downloadArtifact(modelFile, {
        onProgress: ({ percent }) =>
          emitProgress({
            stage: 'downloading-model',
            ...(Number.isFinite(percent)
              ? { percent: Math.round(84 + percent * 0.11) }
              : {}),
          }),
      });
      verifyArtifactBytes(buffer, modelFile);
      atomicWriteBuffer(path.join(stagingDir, modelFile.filename), buffer);
    }
    emitProgress({ stage: 'verifying-model', percent: 95 });
    atomicWriteText(
      path.join(stagingDir, 'manifest.json'),
      jsonBytes(modelManifest),
    );
    publishDirectory(stagingDir, paths.installDir);
    return paths;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

async function prepareStructureAnalysisArtifacts({
  host,
  runtimeManifest,
  environmentLock,
  modelManifest,
  refs,
  force = false,
  emitProgress = () => {},
  downloadArtifact = defaultDownloadArtifact,
  extractArchive = defaultExtractArchive,
  probeEnvironment = defaultProbeEnvironment,
}) {
  const runtime = await installRuntime({
    host,
    refs,
    runtimeManifest,
    force,
    downloadArtifact,
    extractArchive,
    emitProgress,
  });
  const environment = await installEnvironment({
    host,
    refs,
    environmentLock,
    force,
    downloadArtifact,
    extractArchive,
    emitProgress,
  });
  emitProgress({ stage: 'verifying-environment', percent: 82 });
  try {
    await probeEnvironment({
      pythonPath: runtime.pythonPath,
      environmentPath: environment.sitePackagesPath,
      probeImports: environmentLock.probeImports,
      expectedPythonVersion: environmentLock.runtime.pythonVersion,
      expectedPackages: Object.fromEntries(
        environmentLock.packages.map((packageEntry) => [
          packageEntry.name,
          packageEntry.version,
        ]),
      ),
    });
  } catch (error) {
    fs.rmSync(environment.installDir, { recursive: true, force: true });
    throw error;
  }
  await installModel({
    host,
    refs,
    modelManifest,
    force,
    downloadArtifact,
    emitProgress,
  });
}

module.exports = {
  defaultProbeEnvironment,
  prepareStructureAnalysisArtifacts,
  verifyArtifactBytes,
};
