import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioPythonRuntimeHost } from './audioPythonRuntimeHost.js';
import { createAudioPythonRuntimeProbeJob } from './audioPythonRuntimeProbe.js';

const HASH = 'a'.repeat(64);
const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-host-probe-'));
  tempDirs.push(dir);
  return dir;
}

describe('createAudioPythonRuntimeProbeJob', () => {
  it('probes only an app-derived runtime artifact, not a capability package', () => {
    const userDataDir = makeTempDir();
    const appPath = makeTempDir();
    const host = createAudioPythonRuntimeHost({
      userDataDir,
      appPath,
      isPackaged: false,
    });
    const runtimePaths = host.getRuntimeArtifactPaths('cpython-3.13.x', HASH);
    fs.mkdirSync(path.dirname(runtimePaths.pythonPath), { recursive: true });
    fs.writeFileSync(runtimePaths.pythonPath, 'python');
    const workerPath = path.join(
      appPath,
      'resources',
      'audio-processing',
      'audio_python_worker.py',
    );
    fs.mkdirSync(path.dirname(workerPath), { recursive: true });
    fs.writeFileSync(workerPath, '# worker');
    const createProcessJob = vi.fn(() => ({
      result: Promise.resolve({
        protocolVersion: 1,
        hostReady: true,
        pythonVersion: [3, 13, 7],
        isolated: true,
        noUserSite: true,
      }),
    }));

    createAudioPythonRuntimeProbeJob({
      host,
      runtimeFamilyId: 'cpython-3.13.x',
      artifactHash: HASH,
      createProcessJob,
    });

    expect(createProcessJob).toHaveBeenCalledWith({
      executablePath: runtimePaths.pythonPath,
      workerPath,
      request: { operation: 'probe-host' },
      emitProgress: undefined,
    });
    expect(JSON.stringify(createProcessJob.mock.calls)).not.toMatch(
      /audio-separator|model|environment/i,
    );
  });

  it('rejects unrecognized host fields before they can escape the adapter', async () => {
    const userDataDir = makeTempDir();
    const appPath = makeTempDir();
    const host = createAudioPythonRuntimeHost({
      userDataDir,
      appPath,
      isPackaged: false,
      existsSync: () => true,
    });
    const job = createAudioPythonRuntimeProbeJob({
      host,
      runtimeFamilyId: 'cpython-3.13.x',
      artifactHash: HASH,
      existsSync: () => true,
      createProcessJob: () => ({
        result: Promise.resolve({
          protocolVersion: 1,
          hostReady: true,
          pythonVersion: [3, 13, 7],
          isolated: true,
          noUserSite: true,
          privatePath: 'C:\\private\\runtime',
        }),
      }),
    });

    await expect(job.result).rejects.toThrow(/probe protocol/i);
  });

  it('fails before spawning when the runtime artifact is absent', () => {
    const host = createAudioPythonRuntimeHost({
      userDataDir: makeTempDir(),
      appPath: path.resolve('.'),
      isPackaged: false,
    });
    const createProcessJob = vi.fn();

    expect(() =>
      createAudioPythonRuntimeProbeJob({
        host,
        runtimeFamilyId: 'cpython-3.13.x',
        artifactHash: HASH,
        createProcessJob,
      }),
    ).toThrow(/runtime artifact is not installed/i);
    expect(createProcessJob).not.toHaveBeenCalled();
  });
});
