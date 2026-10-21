import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPrototypeCapture } from '../prototypes/capture.cjs';

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function harness(action, overrides = {}) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-test-'));
  directories.push(temporaryRoot);
  const child = new EventEmitter();
  Object.assign(child, {
    pid: 1234,
    exitCode: null,
    signalCode: null,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => close(null, 'SIGKILL')),
  });
  function close(code, signal = null) {
    child.exitCode = code;
    child.signalCode = signal;
    child.emit('close', code, signal);
  }
  const spawnProcess = vi.fn(() => {
    queueMicrotask(() => action({ child, close }));
    return child;
  });
  const spawnSyncProcess = vi.fn(() => {
    close(null, 'SIGTERM');
    return { status: 0 };
  });
  const options = {
    temporaryRoot,
    electronPath: 'test-electron',
    spawnProcess,
    spawnSyncProcess,
    platform: 'win32',
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    log: vi.fn(),
    captureTimeoutMs: 50,
    closeTimeoutMs: 50,
    ...overrides,
  };
  return { options, temporaryRoot, child, spawnProcess, spawnSyncProcess };
}

describe('shared prototype capture lifecycle', () => {
  it.each([
    [
      'ui-component-lab',
      'UTAWAKUI_UI_LAB_USER_DATA',
      'UTAWAKUI_UI_LAB_COMPLETE:',
    ],
    [
      'studio-library-workspace',
      'UTAWAKUI_CAPTURE_USER_DATA',
      'UTAWAKUI_CAPTURE_COMPLETE:',
    ],
  ])(
    'uses the fixed %s app and owns its profile',
    async (name, envKey, marker) => {
      vi.stubEnv('ELECTRON_RUN_AS_NODE', '1');
      const h = harness(({ child }) => {
        child.stdout.write(marker.slice(0, 8));
        child.stdout.write(`${marker.slice(8)}0\n`);
      });
      await expect(runPrototypeCapture(name, h.options)).resolves.toBe(0);
      const [executable, [appDirectory], config] = h.spawnProcess.mock.calls[0];
      expect(executable).toBe('test-electron');
      expect(appDirectory).toBe(
        path.resolve('prototypes', name, 'capture-app'),
      );
      expect(config.windowsHide).toBe(true);
      expect(config.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
      expect(path.dirname(config.env[envKey])).toBe(h.temporaryRoot);
      expect(fs.existsSync(config.env[envKey])).toBe(false);
      expect(fs.readdirSync(h.temporaryRoot)).toEqual([]);
      expect(h.spawnSyncProcess).toHaveBeenCalledWith(
        'taskkill.exe',
        ['/pid', '1234', '/t', '/f'],
        { stdio: 'ignore', windowsHide: true },
      );
    },
  );

  it.each(['../outside', 'constructor', '', undefined])(
    'rejects unknown profile %s before creating a profile',
    async (name) => {
      const h = harness(() => {});
      await expect(runPrototypeCapture(name, h.options)).rejects.toThrow(
        /Usage:/,
      );
      expect(h.spawnProcess).not.toHaveBeenCalled();
      expect(fs.readdirSync(h.temporaryRoot)).toEqual([]);
    },
  );

  it('preserves a reported failure while still cleaning its child and profile', async () => {
    const h = harness(({ child }) =>
      child.stdout.write('UTAWAKUI_UI_LAB_COMPLETE:1\n'),
    );
    await expect(
      runPrototypeCapture('ui-component-lab', h.options),
    ).resolves.toBe(1);
    expect(fs.readdirSync(h.temporaryRoot)).toEqual([]);
  });

  it('rejects early exit without a completion report', async () => {
    const h = harness(({ close }) => close(0));
    await expect(
      runPrototypeCapture('ui-component-lab', h.options),
    ).rejects.toThrow(/before completion/);
    expect(h.spawnSyncProcess).not.toHaveBeenCalled();
    expect(fs.readdirSync(h.temporaryRoot)).toEqual([]);
  });

  it('preserves spawn errors and cleans the profile', async () => {
    const failure = new Error('spawn failed');
    const h = harness(({ child }) => child.emit('error', failure));
    h.child.pid = undefined;
    h.options.closeTimeoutMs = 1;
    await expect(
      runPrototypeCapture('ui-component-lab', h.options),
    ).rejects.toBe(failure);
    expect(fs.readdirSync(h.temporaryRoot)).toEqual([]);
  });

  it('terminates only the owned PID on timeout and cleans the profile', async () => {
    const h = harness(() => {}, { captureTimeoutMs: 1 });
    await expect(
      runPrototypeCapture('ui-component-lab', h.options),
    ).rejects.toThrow(/deadline/);
    expect(h.spawnSyncProcess.mock.calls[0][1]).toEqual([
      '/pid',
      '1234',
      '/t',
      '/f',
    ]);
    expect(fs.readdirSync(h.temporaryRoot)).toEqual([]);
  });

  it('falls back to killing its child when taskkill fails', async () => {
    const h = harness(({ child }) =>
      child.stdout.write('UTAWAKUI_UI_LAB_COMPLETE:0\n'),
    );
    h.spawnSyncProcess.mockImplementation(() => ({ status: 1 }));
    await expect(
      runPrototypeCapture('ui-component-lab', h.options),
    ).resolves.toBe(0);
    expect(h.child.kill).toHaveBeenCalledWith('SIGKILL');
  });
});
