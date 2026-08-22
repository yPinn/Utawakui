import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { describe, expect, it, vi } from 'vitest';
import { createAudioPythonProcessJob } from './audioPythonProcessJob.js';

class FakeChildProcess extends EventEmitter {
  constructor() {
    super();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.stdin = {
      end: vi.fn(),
    };
    this.kill = vi.fn(() => true);
  }
}

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
    const { child, job, spawnImpl } = startJob();

    expect(spawnImpl).toHaveBeenCalledWith(
      'C:\\runtime\\python.exe',
      ['C:\\app\\audio_python_worker.py'],
      {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
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
    await expect(malformed.job.result).rejects.toThrow(/protocol/i);
    expect(malformed.child.kill).toHaveBeenCalledOnce();

    const unknown = startJob();
    unknown.child.stdout.write(`${JSON.stringify({ type: 'mystery' })}\n`);
    await expect(unknown.job.result).rejects.toThrow(/protocol/i);
    expect(unknown.child.kill).toHaveBeenCalledOnce();

    const oversized = startJob({ maxMessageBytes: 32 });
    oversized.child.stdout.write('x'.repeat(33));
    await expect(oversized.job.result).rejects.toThrow(/protocol/i);
    expect(oversized.child.kill).toHaveBeenCalledOnce();
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
    await expect(invalidProgress.job.result).rejects.toThrow(/protocol/i);

    const duplicateDone = startJob();
    duplicateDone.child.stdout.write(
      `${JSON.stringify({ type: 'done', result: { ok: true } })}\n`,
    );
    duplicateDone.child.stdout.write(
      `${JSON.stringify({ type: 'done', result: { ok: true } })}\n`,
    );
    await expect(duplicateDone.job.result).rejects.toThrow(/protocol/i);
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
    await expect(failure.job.result).rejects.toThrow(/protocol/i);
    failure.child.emit('close', 1, null);
    expect(failureCleanup).toHaveBeenCalledOnce();
  });
});
