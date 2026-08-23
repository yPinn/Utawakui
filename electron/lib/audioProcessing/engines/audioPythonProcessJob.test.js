import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioPythonProcessJob } from './audioPythonProcessJob.js';

class FakeChildProcess extends EventEmitter {
  constructor() {
    super();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.stdin = new PassThrough();
    vi.spyOn(this.stdin, 'end');
    this.kill = vi.fn(() => true);
  }
}

afterEach(() => vi.unstubAllEnvs());

function startJob(overrides = {}) {
  const child = new FakeChildProcess();
  const spawnImpl = vi.fn(() => child);
  const emitProgress = vi.fn();
  const job = createAudioPythonProcessJob({
    executablePath: 'C:\\runtime\\python.exe',
    workerPath: 'C:\\app\\audio_python_worker.py',
    request: { operation: 'probe-host' },
    emitProgress,
    spawnImpl,
    ...overrides,
  });
  return { child, emitProgress, job, spawnImpl };
}

describe('createAudioPythonProcessJob', () => {
  it('spawns one hidden process without a shell and sends one versioned request', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'must-not-reach-worker');
    const { child, job, spawnImpl } = startJob();

    expect(spawnImpl).toHaveBeenCalledWith(
      'C:\\runtime\\python.exe',
      ['-I', 'C:\\app\\audio_python_worker.py'],
      {
        env: expect.not.objectContaining({
          PYTHONHOME: expect.anything(),
          PYTHONPATH: expect.anything(),
        }),
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    const childEnv = spawnImpl.mock.calls[0][2].env;
    expect(childEnv).not.toHaveProperty('PYTHONPATH');
    expect(childEnv).not.toHaveProperty('OPENAI_API_KEY');
    expect(child.stdin.end).toHaveBeenCalledOnce();
    expect(JSON.parse(child.stdin.end.mock.calls[0][0])).toEqual({
      protocolVersion: 1,
      operation: 'probe-host',
    });

    child.stdout.write(
      `${JSON.stringify({ type: 'done', result: { hostReady: true } })}\n`,
    );
    child.emit('close', 0, null);

    await expect(job.result).resolves.toEqual({ hostReady: true });
  });

  it('parses split JSON lines and relays only normalized progress', async () => {
    const { child, emitProgress, job } = startJob();
    const progress = `${JSON.stringify({
      type: 'progress',
      stage: 'starting',
      percent: 25,
      ignored: 'private worker detail',
    })}\n`;
    child.stdout.write(progress.slice(0, 9));
    child.stdout.write(progress.slice(9));
    child.stdout.write(
      `${JSON.stringify({ type: 'done', result: { ok: true } })}\n`,
    );
    child.emit('close', 0, null);

    expect(emitProgress).toHaveBeenCalledWith({
      stage: 'starting',
      percent: 25,
    });
    await expect(job.result).resolves.toEqual({ ok: true });
  });

  it('rejects malformed, unknown, or oversized protocol messages and terminates the process', async () => {
    const malformed = startJob();
    malformed.child.stdout.write('not-json\n');
    expect(malformed.child.kill).toHaveBeenCalledOnce();
    malformed.child.emit('close', null, 'SIGTERM');
    await expect(malformed.job.result).rejects.toThrow(/protocol/i);

    const unknown = startJob();
    unknown.child.stdout.write(`${JSON.stringify({ type: 'mystery' })}\n`);
    expect(unknown.child.kill).toHaveBeenCalledOnce();
    unknown.child.emit('close', null, 'SIGTERM');
    await expect(unknown.job.result).rejects.toThrow(/protocol/i);

    const oversized = startJob({ maxMessageBytes: 32 });
    oversized.child.stdout.write('x'.repeat(33));
    expect(oversized.child.kill).toHaveBeenCalledOnce();
    oversized.child.emit('close', null, 'SIGTERM');
    await expect(oversized.job.result).rejects.toThrow(/protocol/i);
  });

  it('does not expose stderr or local paths through abnormal-exit errors', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { child, job } = startJob();
    child.stderr.write('secret path C:\\Users\\Name\\song.wav');
    child.emit('close', 9, null);

    await expect(job.result).rejects.toThrow(
      'audio Python worker exited with code 9',
    );
    await expect(job.result).rejects.not.toThrow(/Users|song\.wav/);
    expect(consoleError).toHaveBeenCalled();
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(
      /Users|song\.wav/,
    );
    consoleError.mockRestore();
  });

  it('does not expose executable paths through spawn errors', async () => {
    const { child, job } = startJob();
    child.emit(
      'error',
      new Error('spawn C:\\private\\runtime\\python.exe ENOENT'),
    );

    await expect(job.result).rejects.toThrow(
      'audio Python worker failed to start',
    );
    await expect(job.result).rejects.not.toThrow(/private|python\.exe/i);
  });

  it('rejects invalid progress and duplicate terminal messages', async () => {
    const invalidProgress = startJob();
    invalidProgress.child.stdout.write(
      `${JSON.stringify({
        type: 'progress',
        stage: 'starting',
        percent: 101,
      })}\n`,
    );
    invalidProgress.child.emit('close', null, 'SIGTERM');
    await expect(invalidProgress.job.result).rejects.toThrow(/protocol/i);

    const duplicateDone = startJob();
    duplicateDone.child.stdout.write(
      `${JSON.stringify({ type: 'done', result: { ok: true } })}\n`,
    );
    duplicateDone.child.stdout.write(
      `${JSON.stringify({ type: 'done', result: { ok: true } })}\n`,
    );
    duplicateDone.child.emit('close', null, 'SIGTERM');
    await expect(duplicateDone.job.result).rejects.toThrow(/protocol/i);
  });

  it('waits for close after stdin failure and accepts a larger caller-owned bound', async () => {
    const stdinFailure = startJob();
    stdinFailure.child.stdin.emit('error', new Error('EPIPE'));
    expect(stdinFailure.child.kill).toHaveBeenCalledOnce();
    stdinFailure.child.emit('close', null, 'SIGTERM');
    await expect(stdinFailure.job.result).rejects.toThrow(/protocol/i);

    const large = startJob({ maxMessageBytes: 128 * 1024 });
    const payload = { text: 'x'.repeat(70 * 1024) };
    large.child.stdout.write(
      `${JSON.stringify({ type: 'done', result: payload })}\n`,
    );
    large.child.emit('close', 0, null);
    await expect(large.job.result).resolves.toEqual(payload);
  });

  it('settles cancellation when a protocol failure is already terminating the worker', async () => {
    const failed = startJob();
    failed.child.stdout.write('not-json\n');
    const cancellation = failed.job.cancel();
    failed.child.emit('close', null, 'SIGTERM');

    await expect(cancellation).resolves.toBeUndefined();
    await expect(failed.job.result).rejects.toThrow(/protocol/i);
  });

  it('owns cancellation and rejects without waiting for worker output', async () => {
    const cleanup = vi.fn();
    const { child, job } = startJob({ cleanup });

    const cancellation = job.cancel();
    expect(child.kill).toHaveBeenCalledOnce();
    child.stdout.write('late worker output after cancellation\n');
    child.emit('close', null, 'SIGTERM');
    await expect(cancellation).resolves.toBeUndefined();
    await expect(job.result).rejects.toThrow(/cancelled/i);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('runs owned workspace cleanup exactly once on success or protocol failure', async () => {
    const successCleanup = vi.fn();
    const success = startJob({ cleanup: successCleanup });
    success.child.stdout.write(
      `${JSON.stringify({ type: 'done', result: { ok: true } })}\n`,
    );
    success.child.emit('close', 0, null);
    await success.job.result;
    expect(successCleanup).toHaveBeenCalledOnce();

    const failureCleanup = vi.fn();
    const failure = startJob({ cleanup: failureCleanup });
    failure.child.stdout.write('not-json\n');
    failure.child.emit('close', 1, null);
    await expect(failure.job.result).rejects.toThrow(/protocol/i);
    expect(failureCleanup).toHaveBeenCalledOnce();
  });
});
