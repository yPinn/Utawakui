import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createWaveformCache } from './cache.js';

const roots = [];
const group = 'a'.repeat(64);
it.runIf(process.platform === 'win32')(
  'accepts Windows path case variants without accepting directory redirects',
  async () => {
    const { root } = setup();
    const cache = createWaveformCache(root.toUpperCase());
    await cache.put(group, key(1), value(), () => {});
    expect(Boolean(await cache.get(group, key(1)))).toBe(true);
  },
);
const key = (n) => n.toString(16).padStart(64, '0');
const value = () => ({
  producerVersion: 'channel-extrema-rms-v2',
  sampleRate: 8000,
  channels: 1,
  frames: 8000,
  durationSec: 1,
  peaks: {
    startFrame: 0,
    endFrame: 10000,
    strideFrames: 3,
    min: new Float32Array(4096).fill(-0.5),
    max: new Float32Array(4096).fill(0.5),
    rms: new Float32Array(4096).fill(0.25),
  },
});
function setup(options = {}) {
  const root = fs.mkdtempSync(path.resolve('tasks/wave-cache-'));
  roots.push(root);
  return { root, cache: createWaveformCache(root, options) };
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => fs.rmSync(root, { recursive: true, force: true })),
);

it('round trips bounded typed peaks, prunes LRU and clears only the requested group', async () => {
  const { cache, root } = setup({ maxEntries: 2 });
  await cache.put(group, key(1), value(), () => {});
  await cache.put('b'.repeat(64), key(2), value(), () => {});
  expect((await cache.get(group, key(1))).peaks.min).toEqual(value().peaks.min);
  expect((await cache.get(group, key(1))).peaks.rms).toEqual(value().peaks.rms);
  await cache.put(group, key(3), value(), () => {});
  expect(await cache.get('b'.repeat(64), key(2))).toBeNull();
  fs.writeFileSync(path.join(root, 'timing-review.json'), 'receipt');
  await cache.clear(group);
  expect(fs.readdirSync(root)).toEqual(['timing-review.json']);
});
it('rejects old cache schemas and invalid energy rather than inventing RMS from peaks', async () => {
  const { cache, root } = setup();
  await cache.put(group, key(1), value(), () => {});
  const file = path.join(root, `${group}-${key(1)}.json`);
  const old = JSON.parse(fs.readFileSync(file, 'utf8'));
  old.version = 1;
  fs.writeFileSync(file, JSON.stringify(old));
  expect(await cache.get(group, key(1))).toBeNull();
  for (const rms of [
    undefined,
    new Float32Array(4096).fill(-1),
    new Float32Array(4096).fill(NaN),
    new Float32Array(4096).fill(0.75),
    new Float32Array(8192),
  ]) {
    const bad = value();
    bad.peaks.rms = rms;
    await expect(cache.put(group, key(2), bad, () => {})).rejects.toThrow(
      'PAYLOAD',
    );
  }
});
it('does not install after invalidation, rejects malformed summaries and treats corrupt data as miss', async () => {
  const { cache, root } = setup();
  await expect(
    cache.put(group, key(1), value(), () => {
      throw Error('STALE');
    }),
  ).rejects.toThrow('STALE');
  expect(fs.readdirSync(root)).toEqual([]);
  const bad = value();
  bad.peaks.min[0] = NaN;
  await expect(cache.put(group, key(1), bad, () => {})).rejects.toThrow();
  fs.writeFileSync(path.join(root, `${group}-${key(1)}.json`), '{');
  expect(await cache.get(group, key(1))).toBeNull();
});
it('enforces byte budgets and never reads a linked cache entry', async () => {
  const { cache, root } = setup({ maxBytes: 70000 });
  await cache.put(group, key(1), value(), () => {});
  await cache.put(group, key(2), value(), () => {});
  expect(await cache.get(group, key(1))).toBeNull();
  const outside = path.join(root, 'receipt.json');
  fs.writeFileSync(outside, 'keep');
  fs.linkSync(outside, path.join(root, `${group}-${key(3)}.json`));
  expect(await cache.get(group, key(3))).toBeNull();
  await cache.clear(group);
  expect(fs.readFileSync(outside, 'utf8')).toBe('keep');
});
it('removes abandoned owned temp files, rejects future schemas and preserves unrelated files', async () => {
  const { cache, root } = setup();
  const temp = '12345678-1234-1234-1234-123456789abc.tmp';
  fs.writeFileSync(path.join(root, temp), 'abandoned');
  fs.writeFileSync(path.join(root, 'unknown.tmp'), 'keep');
  const bad = value();
  bad.producerVersion = 'future';
  await expect(cache.put(group, key(1), bad, () => {})).rejects.toThrow(
    'PAYLOAD',
  );
  expect(fs.existsSync(path.join(root, temp))).toBe(false);
  expect(fs.existsSync(path.join(root, 'unknown.tmp'))).toBe(true);
});
