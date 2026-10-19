import { describe, it, expect } from 'vitest';
import processTools from './process.cjs';
const { createProcessGroup } = processTools;
const echo = `process.stdin.on('data', b => process.stdout.write(b));`;

describe('owned research worker lifetime', () => {
  it('rejects oversized requests, unexpected response ids and duplicate pending requests', async () => {
    const group = createProcessGroup({ timeoutMs: 5000, maxMessageBytes: 100 });
    const worker = group.rpc(process.execPath, [
      '-e',
      'setInterval(()=>{},1000)',
    ]);
    await expect(
      worker.request({ id: 1, data: 'x'.repeat(200) }),
    ).rejects.toThrow(/byte limit/);
    const pending = worker.request({ id: 2 }).catch((e) => e.message);
    await expect(worker.request({ id: 3 })).rejects.toThrow(/pending/);
    await group.close();
    expect(await pending).toMatch(/cancel|closed/);
    for (const response of ['{"id":99}\n', '{"id":1}\n{"id":1}\n']) {
      const unexpected = createProcessGroup({ timeoutMs: 5000 });
      const child = unexpected.rpc(process.execPath, [
        '-e',
        `process.stdin.once('data',()=>process.stdout.write(${JSON.stringify(response)}));setInterval(()=>{},1000)`,
      ]);
      await expect(child.request({ id: 1 })).rejects.toThrow(/protocol/);
      await unexpected.close();
    }
  });
  it('rejects unsuccessful decoding and a worker that closes without a response', async () => {
    const group = createProcessGroup({ timeoutMs: 5000 });
    await expect(
      group.capture(process.execPath, ['-e', 'process.exit(2)'], 100),
    ).rejects.toThrow(/decode failed/);
    const worker = group.rpc(process.execPath, ['-e', 'process.exit(0)']);
    await expect(worker.request({ id: 1 })).rejects.toThrow();
    await expect(worker.request({ id: 2 })).rejects.toThrow(/closed/);
    await group.close();
  });
  it('exchanges bounded JSON and waits for every owned worker to close', async () => {
    const group = createProcessGroup({ timeoutMs: 5000 });
    const worker = group.rpc(process.execPath, ['-e', echo]);
    const result = await worker.request({ id: 1, text: '合成' });
    expect(result).toEqual({ id: 1, text: '合成' });
    expect(group.pids().length).toBe(1);
    await group.close();
    expect(group.pids()).toEqual([]);
  });
  it('cancels both workers and rejects an in-flight request', async () => {
    const group = createProcessGroup({ timeoutMs: 5000 });
    const worker = group.rpc(process.execPath, [
      '-e',
      'setInterval(()=>{},1000)',
    ]);
    group.rpc(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
    const pending = worker.request({ id: 1 }).catch((e) => e.message);
    await group.close();
    expect(await pending).toMatch(/cancel|closed/);
    expect(group.pids()).toEqual([]);
  });
  it('rejects oversized output and malformed JSON, preserving bounded diagnostics', async () => {
    for (const code of [
      `process.stdout.write('x'.repeat(1000));setInterval(()=>{},1000)`,
      `process.stdout.write('bad\n');setInterval(()=>{},1000)`,
    ]) {
      const group = createProcessGroup({
        timeoutMs: 5000,
        maxMessageBytes: 100,
      });
      const worker = group.rpc(process.execPath, ['-e', code]);
      await expect(worker.request({ id: 1 })).rejects.toThrow();
      await group.close();
      expect(group.pids()).toEqual([]);
    }
  });
  it('terminates on deadline and handles spawn failures', async () => {
    const group = createProcessGroup({ timeoutMs: 30 });
    const worker = group.rpc(process.execPath, [
      '-e',
      'setInterval(()=>{},1000)',
    ]);
    await expect(worker.request({ id: 1 })).rejects.toThrow();
    await group.close();
    const absent = createProcessGroup({ timeoutMs: 2000 });
    await expect(
      absent.capture('Z:/definitely-missing.exe', [], 100),
    ).rejects.toThrow();
    await absent.close();
  });
  it('bounds binary decoding and rejects commands after cancellation', async () => {
    const group = createProcessGroup({ timeoutMs: 5000 });
    expect(
      await group.capture(
        process.execPath,
        ['-e', `process.stdout.write('pcm')`],
        10,
      ),
    ).toEqual(Buffer.from('pcm'));
    await expect(
      group.capture(
        process.execPath,
        ['-e', `process.stdout.write('too much')`],
        2,
      ),
    ).rejects.toThrow();
    await group.close();
    expect(() => group.rpc(process.execPath, ['-e', echo])).toThrow();
  });
});
