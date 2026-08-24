import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioPythonRuntimeHost } from './audioPythonRuntimeHost.js';
import { prepareStructureAnalysisArtifacts } from './audioPythonArtifactPreparation.js';

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-artifacts-'));
  tempDirs.push(dir);
  return dir;
}

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function artifact(filename, bytes) {
  return {
    filename,
    url: `https://downloads.example.test/${filename}`,
    sizeBytes: bytes.length,
    sha256: hash(bytes),
  };
}

function createHarness() {
  const host = createAudioPythonRuntimeHost({
    userDataDir: makeTempDir(),
    appPath: makeTempDir(),
    isPackaged: false,
  });
  const bytes = {
    runtime: Buffer.from('runtime-archive'),
    wheel: Buffer.from('wheel-archive'),
    model: Buffer.from('small0-weights'),
  };
  const runtimeManifest = {
    familyId: 'cpython-3.14.x',
    version: '3.14.7',
    artifact: artifact('python.zip', bytes.runtime),
  };
  const environmentLock = {
    environmentId: 'analysis-structure',
    runtime: {
      familyId: 'cpython-3.14.x',
      pythonVersion: '3.14.7',
    },
    packages: [
      {
        name: 'beat-this',
        version: '1.1.0',
        artifact: artifact('beat_this.whl', bytes.wheel),
      },
    ],
    probeImports: ['beat_this'],
  };
  const modelManifest = {
    kind: 'analysis',
    id: 'beat-this-small0',
    version: '1.1.0-small0',
    files: [
      {
        role: 'weights',
        ...artifact('small0.ckpt', bytes.model),
      },
    ],
  };
  const refs = {
    runtime: {
      familyId: runtimeManifest.familyId,
      artifactHash: runtimeManifest.artifact.sha256,
    },
    environment: {
      id: environmentLock.environmentId,
      lockHash: 'a'.repeat(64),
    },
    model: {
      kind: modelManifest.kind,
      id: modelManifest.id,
      version: modelManifest.version,
      manifestHash: 'b'.repeat(64),
    },
  };
  const byUrl = new Map([
    [runtimeManifest.artifact.url, bytes.runtime],
    [environmentLock.packages[0].artifact.url, bytes.wheel],
    [modelManifest.files[0].url, bytes.model],
  ]);
  const downloadArtifact = vi.fn(async (item) => byUrl.get(item.url));
  const extractArchive = vi.fn(async ({ destinationDir, artifact: item }) => {
    fs.mkdirSync(destinationDir, { recursive: true });
    if (item.filename.endsWith('.zip')) {
      fs.writeFileSync(path.join(destinationDir, 'python.exe'), 'python');
    } else {
      fs.mkdirSync(path.join(destinationDir, 'beat_this'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(destinationDir, 'beat_this', '__init__.py'),
        '',
      );
    }
  });
  const probeEnvironment = vi.fn().mockResolvedValue(undefined);
  return {
    host,
    runtimeManifest,
    environmentLock,
    modelManifest,
    refs,
    downloadArtifact,
    extractArchive,
    probeEnvironment,
  };
}

describe('audio Python artifact preparation', () => {
  it('publishes complete immutable runtime, environment, and model directories', async () => {
    const harness = createHarness();
    const progress = [];

    await prepareStructureAnalysisArtifacts({
      ...harness,
      emitProgress: (item) => progress.push(item),
    });

    const runtime = harness.host.getRuntimeArtifactPaths(
      harness.refs.runtime.familyId,
      harness.refs.runtime.artifactHash,
    );
    const environment = harness.host.getEnvironmentPaths(
      harness.refs.environment.id,
      harness.refs.environment.lockHash,
    );
    const model = harness.host.getModelPaths(
      harness.refs.model.kind,
      harness.refs.model.id,
      harness.refs.model.version,
    );
    expect(fs.existsSync(runtime.pythonPath)).toBe(true);
    expect(fs.existsSync(environment.manifestPath)).toBe(true);
    expect(
      fs.existsSync(path.join(environment.sitePackagesPath, 'beat_this')),
    ).toBe(true);
    expect(fs.readFileSync(path.join(model.installDir, 'small0.ckpt'))).toEqual(
      Buffer.from('small0-weights'),
    );
    expect(harness.probeEnvironment).toHaveBeenCalledWith(
      expect.objectContaining({
        pythonPath: runtime.pythonPath,
        environmentPath: environment.sitePackagesPath,
        probeImports: ['beat_this'],
        expectedPythonVersion: '3.14.7',
        expectedPackages: { 'beat-this': '1.1.0' },
      }),
    );
    expect(progress).toContainEqual({
      stage: 'verifying-environment',
      percent: 82,
    });
    const percentages = progress.map(({ percent }) => percent);
    expect(percentages).toEqual(
      [...percentages].sort((left, right) => left - right),
    );
  });

  it('rejects a hash mismatch and leaves no published runtime directory', async () => {
    const harness = createHarness();
    harness.downloadArtifact.mockResolvedValue(Buffer.from('tampered'));

    await expect(prepareStructureAnalysisArtifacts(harness)).rejects.toThrow(
      /integrity/i,
    );

    const runtime = harness.host.getRuntimeArtifactPaths(
      harness.refs.runtime.familyId,
      harness.refs.runtime.artifactHash,
    );
    expect(fs.existsSync(runtime.installDir)).toBe(false);
  });

  it('does not download a model when the exact environment probe fails', async () => {
    const harness = createHarness();
    harness.probeEnvironment.mockRejectedValue(new Error('wrong package'));

    await expect(prepareStructureAnalysisArtifacts(harness)).rejects.toThrow(
      'wrong package',
    );

    const environment = harness.host.getEnvironmentPaths(
      harness.refs.environment.id,
      harness.refs.environment.lockHash,
    );
    const model = harness.host.getModelPaths(
      harness.refs.model.kind,
      harness.refs.model.id,
      harness.refs.model.version,
    );
    expect(fs.existsSync(environment.installDir)).toBe(false);
    expect(fs.existsSync(model.installDir)).toBe(false);
    expect(harness.downloadArtifact).not.toHaveBeenCalledWith(
      harness.modelManifest.files[0],
      expect.anything(),
    );
  });

  it('reuses a complete immutable installation without redownloading', async () => {
    const harness = createHarness();
    await prepareStructureAnalysisArtifacts(harness);
    harness.downloadArtifact.mockClear();

    await prepareStructureAnalysisArtifacts(harness);

    expect(harness.downloadArtifact).not.toHaveBeenCalled();
    expect(harness.probeEnvironment).toHaveBeenCalledTimes(2);
  });
});
