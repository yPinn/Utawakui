import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { runProbe } from './probe.js';
afterEach(() => vi.unstubAllEnvs());
describe('bounded environment load probes', () => {
  it('bounds input and diagnostics and excludes inherited execution overrides', async () => {
    vi.stubEnv('NODE_OPTIONS', '--require=private-secret');
    vi.stubEnv('PYTHONPATH', 'private-secret');
    expect(
      await runProbe(
        process.execPath,
        [
          '-e',
          'process.stdin.resume();process.stdin.on("end",()=>console.log(JSON.stringify({ready:!process.env.NODE_OPTIONS&&!process.env.PYTHONPATH})))',
        ],
        { input: 'x'.repeat(32768) },
      ),
    ).toEqual({ ready: true });
    await expect(
      runProbe(process.execPath, ['-e', 'process.stdin.resume()'], {
        input: 'x'.repeat(32769),
      }),
    ).rejects.toThrow('input budget');
    expect(
      await runProbe(process.execPath, [
        '-e',
        'process.stderr.write("x".repeat(8192));console.log(JSON.stringify({ready:true}))',
      ]),
    ).toEqual({ ready: true });
    await expect(
      runProbe(process.execPath, [
        '-e',
        'process.stderr.write("x".repeat(8193));console.log(JSON.stringify({ready:true}))',
      ]),
    ).rejects.toThrow('diagnostic budget');
  });
  it('does not settle cancellation until the owned process emits close', async () => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = new EventEmitter();
    proc.stdin.end = () => {};
    proc.kill = vi.fn();
    const controller = new AbortController();
    let settled = false;
    const pending = runProbe('synthetic', [], {
      signal: controller.signal,
      spawnImpl: () => proc,
    });
    const outcome = pending.catch((error) => {
      settled = true;
      return error;
    });
    controller.abort();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(proc.kill).toHaveBeenCalled();
    proc.emit('close', null);
    expect((await outcome).name).toBe('AbortError');
  });
  it('accepts only a successful bounded JSON receipt', async () => {
    expect(
      await runProbe(process.execPath, [
        '-e',
        'console.log(JSON.stringify({ready:true}))',
      ]),
    ).toEqual({ ready: true });
    await expect(
      runProbe(process.execPath, ['-e', 'console.log("not-json")']),
    ).rejects.toThrow();
    await expect(
      runProbe(process.execPath, [
        '-e',
        'process.stdout.write("x".repeat(9000))',
      ]),
    ).rejects.toThrow();
    await expect(
      runProbe(process.execPath, ['-e', 'process.exit(2)']),
    ).rejects.toThrow();
  });
  it('waits for a cancelled process to close and enforces a deadline', async () => {
    const controller = new AbortController();
    const pending = runProbe(
      process.execPath,
      ['-e', 'setInterval(()=>{},1000)'],
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(
      runProbe(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
        timeoutMs: 20,
      }),
    ).rejects.toThrow();
    await expect(runProbe('not-an-executable', [])).rejects.toThrow();
  });
});
