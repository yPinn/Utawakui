import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, expect, it } from 'vitest';
import { startCandidateJob } from './job.cjs';
const require = createRequire(import.meta.url);
const store = require('../../../electron/lib/library/lyricsAcousticEstimates');
const roots = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((p) => fs.rmSync(p, { recursive: true, force: true })),
);
async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-'));
  roots.push(root);
  const trackDir = path.join(root, 'track');
  fs.mkdirSync(path.join(trackDir, 'lyrics'), { recursive: true });
  fs.writeFileSync(path.join(trackDir, 'audio.wav'), 'fixture');
  fs.writeFileSync(path.join(trackDir, 'lyrics/main.vtt'), 'fixture');
  const source = { filename: 'main.vtt', offsetMs: 100 };
  const method = {
    ...(await store.prepareAcousticEstimateContext(trackDir, source)).method,
    kind: 'model',
    id: 'candidate',
    modelManifestSha256: 'a'.repeat(64),
    environmentLockSha256: 'b'.repeat(64),
  };
  const context = await store.prepareAcousticEstimateContext(trackDir, source, {
    method,
  });
  const canonical = {
    documentId: 'doc',
    normalizerProfileId: context.source.normalizerProfileId,
    source: { filename: 'main.vtt', sha256: context.source.sha256 },
    granularity: 'T1',
    lines: [{ lineId: 'line', text: '你好世界', startMs: 1000, endMs: 4000 }],
  };
  const sidecar = store.acousticEstimatePath(trackDir, source.filename);
  fs.mkdirSync(path.dirname(sidecar), { recursive: true });
  fs.writeFileSync(sidecar, 'previous estimate');
  const group = {
    capture: async () =>
      Buffer.from(new Float32Array(16000 * 5).fill(0.1).buffer),
    check() {},
    close: async () => {},
    pids: () => [],
  };
  return {
    trackDir,
    source,
    canonical,
    sidecar,
    durationMs: 5000,
    language: 'zh',
    jobsRoot: path.join(root, 'jobs'),
    binding: {
      method,
      kind: 'qwen',
      config: { ffmpegPath: 'fixture' },
      assertCurrent: async () => {},
    },
    groupFactory: () => group,
    sessionFactory: async () => ({
      initialize: async () => ({}),
      infer: async () => ({
        spans: [
          { text: '你', start: 1, end: 1.5 },
          { text: '好', start: 1.5, end: 2 },
          { text: '世', start: 2.5, end: 3 },
          { text: '界', start: 3, end: 3.5 },
        ],
      }),
    }),
  };
}
it('publishes original ranges with one offset and no owned workers', async () => {
  const args = await setup();
  const result = await startCandidateJob(args).result;
  expect(
    result.estimate.preview.lines[0].chunks.map((c) => [c.from, c.startMs]),
  ).toEqual([
    [0, 1000],
    [2, 2600],
  ]);
  expect(result.metrics.remainingOwnedPids).toEqual([]);
  expect(fs.readdirSync(args.jobsRoot)).toEqual([]);
});
it.each(['short-pcm', 'outside-window'])(
  'refuses %s instead of publishing plausible cuts',
  async (mode) => {
    const args = await setup();
    if (mode === 'short-pcm')
      args.groupFactory = () => ({
        capture: async () =>
          Buffer.from(new Float32Array(16000).fill(0.1).buffer),
        check() {},
        close: async () => {},
        pids: () => [],
      });
    else
      args.sessionFactory = async () => ({
        initialize: async () => ({}),
        infer: async () => ({
          spans: [
            { text: '你', start: 1, end: 2 },
            { text: '好', start: 2, end: 3 },
            { text: '世', start: 3, end: 8 },
            { text: '界', start: 8, end: 9 },
          ],
        }),
      });
    await expect(startCandidateJob(args).result).rejects.toThrow();
    expect(fs.readFileSync(args.sidecar, 'utf8')).toBe('previous estimate');
  },
);
it.each(['load', 'infer', 'binding', 'cancel', 'deadline', 'source'])(
  'preserves old estimate and lyrics on %s failure',
  async (mode) => {
    const args = await setup();
    const sourceBefore = fs.readFileSync(
      path.join(args.trackDir, 'lyrics/main.vtt'),
    );
    let job;
    args.sessionFactory = async () => ({
      initialize: async () => {
        if (mode === 'load') throw Error('load');
        return {};
      },
      infer: async () => {
        if (mode === 'cancel') await job.cancel();
        if (mode === 'deadline') await new Promise((r) => setTimeout(r, 30));
        if (mode === 'source')
          fs.appendFileSync(
            path.join(args.trackDir, 'lyrics/main.vtt'),
            'changed',
          );
        if (mode === 'infer') throw Error('infer');
        return { spans: [] };
      },
    });
    if (mode === 'binding')
      args.binding.assertCurrent = async () => {
        throw Error('binding');
      };
    if (mode === 'deadline') args.timeoutMs = 20;
    job = startCandidateJob(args);
    await expect(job.result).rejects.toThrow();
    expect(fs.readFileSync(args.sidecar, 'utf8')).toBe('previous estimate');
    if (mode !== 'source')
      expect(
        fs.readFileSync(path.join(args.trackDir, 'lyrics/main.vtt')),
      ).toEqual(sourceBefore);
    // Under load the deadline can expire during preflight, before any workspace exists.
    if (fs.existsSync(args.jobsRoot))
      expect(fs.readdirSync(args.jobsRoot)).toEqual([]);
    else expect(mode).toBe('deadline');
  },
);
it('declines text mismatch, silence, unsupported script and preserves T2', async () => {
  const args = await setup();
  args.sessionFactory = async () => ({
    initialize: async () => ({}),
    infer: async () => ({ spans: [{ text: '再見', start: 1, end: 2 }] }),
  });
  expect(
    (await startCandidateJob(args).result).estimate.preview.lines[0].status,
  ).toBe('unsupported');
  args.canonical.lines[0].segments = [{ text: '你好世界', startMs: 1000 }];
  expect(
    (await startCandidateJob(args).result).estimate.preview.lines[0].reason,
  ).toBe('no-evidence');
  delete args.canonical.lines[0].segments;
  args.canonical.lines[0].text = 'hello';
  expect(
    (await startCandidateJob(args).result).estimate.preview.lines[0].reason,
  ).toBe('unsupported-language');
  args.canonical.lines[0].text = '你好世界';
  args.groupFactory = () => ({
    capture: async () => Buffer.alloc(16000 * 5 * 4),
    check() {},
    close: async () => {},
    pids: () => [],
  });
  expect(
    (await startCandidateJob(args).result).estimate.preview.lines[0].reason,
  ).toBe('no-evidence');
});
