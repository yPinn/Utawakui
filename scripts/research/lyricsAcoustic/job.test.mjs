import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, it, expect, afterEach } from 'vitest';
import jobs from './job.cjs';
const require = createRequire(import.meta.url);
const { startResearchJob } = jobs;
const store = require('../../../electron/lib/library/lyricsAcousticEstimates.js');
const { prepareAcousticPreview, selectAcousticPreviewFrame } =
  await import('../../../shared/presentation/lyricsAcousticPreview.mjs');
const roots = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((d) => fs.rmSync(d, { recursive: true, force: true })),
);
async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acoustic-job-'));
  roots.push(root);
  const trackDir = path.join(root, 'track');
  fs.mkdirSync(path.join(trackDir, 'lyrics'), { recursive: true });
  fs.writeFileSync(path.join(trackDir, 'audio.wav'), 'synthetic');
  fs.writeFileSync(path.join(trackDir, 'lyrics/main.lrc'), '[00:01]你好世界');
  const source = { filename: 'main.lrc', offsetMs: 0 };
  const method = {
    ...(await store.prepareAcousticEstimateContext(trackDir, source)).method,
    kind: 'model',
    id: 'research',
    modelManifestSha256: 'a'.repeat(64),
    environmentLockSha256: 'b'.repeat(64),
  };
  const context = await store.prepareAcousticEstimateContext(trackDir, source, {
    method,
  });
  const canonical = {
    documentId: 'doc',
    normalizerProfileId: context.source.normalizerProfileId,
    source: { filename: source.filename, sha256: context.source.sha256 },
    granularity: 'T1',
    lines: [{ lineId: 'line', text: '你好世界', startMs: 1000, endMs: 4000 }],
  };
  let closed = false;
  const calls = [];
  const group = {
    rpc: (_exe, args) => ({
      request: async (request) => {
        calls.push({ args, ...request });
        if (request.command === 'prepare')
          return {
            ok: true,
            result: { words: request.words.map((w) => w.text) },
          };
        if (request.command === 'decode')
          return {
            ok: true,
            result: {
              spans: [
                { index: 0, start: 1 },
                { index: 1, start: 1.5 },
                { index: 2, start: 2.7 },
                { index: 3, start: 3 },
              ],
              confidence: 0.99,
            },
          };
        return {
          ok: true,
          result: { ready: true, frames: 500, peakRssBytes: 100 },
        };
      },
    }),
    capture: async () =>
      Buffer.from(new Float32Array(44100 * 5).fill(0.1).buffer),
    close: async () => {
      closed = true;
    },
    check: () => {},
    pids: () => (closed ? [] : [1, 2]),
  };
  return {
    trackDir,
    source,
    canonical,
    durationMs: 5000,
    language: 'zh',
    jobsRoot: path.join(root, 'jobs'),
    binding: {
      method,
      config: {
        pythonPath: 'synthetic-python',
        ffmpegPath: 'synthetic-ffmpeg',
      },
      assertCurrent: async () => {},
    },
    groupFactory: () => group,
    group,
    calls,
  };
}

describe('private model job and existing preview', () => {
  it.each(['prepare', 'decode'])(
    'falls back for a worker declining %s instead of inventing boundaries',
    async (command) => {
      const args = await setup();
      const rpc = args.group.rpc;
      args.group.rpc = (...parameters) => {
        const worker = rpc(...parameters);
        return {
          request: (request) =>
            request.command === command
              ? Promise.resolve({ ok: false })
              : worker.request(request),
        };
      };
      const result = await startResearchJob(args).result;
      expect(result.estimate.preview.lines[0]).toMatchObject({
        status: 'unsupported',
        chunks: [],
        reason:
          command === 'prepare' ? 'unsupported-language' : 'missing-boundaries',
      });
      expect(args.group.pids()).toEqual([]);
    },
  );
  it('does not publish if the deadline expires while assets are revalidated', async () => {
    const args = await setup();
    await startResearchJob(args).result;
    const file = store.acousticEstimatePath(
      args.trackDir,
      args.source.filename,
    );
    const before = fs.readFileSync(file);
    args.binding.assertCurrent = () =>
      new Promise((resolve) => setTimeout(resolve, 100));
    await expect(
      startResearchJob({ ...args, timeoutMs: 50 }).result,
    ).rejects.toThrow(/deadline/);
    expect(fs.readFileSync(file)).toEqual(before);
  });
  it('publishes explicit-model data after closing workers and keeps default loading stale', async () => {
    const args = await setup();
    const before = JSON.stringify(args.canonical);
    const result = await startResearchJob(args).result;
    expect(args.group.pids()).toEqual([]);
    expect(fs.readdirSync(args.jobsRoot)).toEqual([]);
    expect(result.estimate.preview.methodKind).toBe('model');
    expect(
      (await store.loadTrackAcousticEstimate(args.trackDir, args.source))
        .status,
    ).toBe('stale');
    expect(JSON.stringify(args.canonical)).toBe(before);
    const prepared = prepareAcousticPreview(args.canonical, result.estimate);
    const frame = selectAcousticPreviewFrame(args.canonical, prepared, {
      enabled: true,
      positionMs: 2600,
    });
    expect(frame.timingSource).toBe('acoustic-estimate');
    expect(frame.chunks.map((c) => c.text)).toEqual(['你好', '世界']);
    expect(frame.chunks[0].state).toBe('active');
    expect(
      selectAcousticPreviewFrame(args.canonical, prepared, {
        enabled: false,
        positionMs: 2600,
      }).timingSource,
    ).toBe('line-estimate');
  });
  it('keeps cancelled or changed generations from overwriting existing estimates', async () => {
    const args = await setup();
    await startResearchJob(args).result;
    const file = store.acousticEstimatePath(
      args.trackDir,
      args.source.filename,
    );
    const before = fs.readFileSync(file);
    const changed = startResearchJob({ ...args, isCurrent: () => false });
    await expect(changed.result).rejects.toThrow();
    expect(fs.readFileSync(file)).toEqual(before);
    const cancelled = startResearchJob(args);
    await cancelled.cancel();
    await expect(cancelled.result).rejects.toThrow();
    expect(fs.readFileSync(file)).toEqual(before);
  });
  it('declines silence and mixed/unsupported text without pretending to detect singing', async () => {
    const args = await setup();
    args.group.capture = async () =>
      Buffer.from(new Float32Array(44100 * 5).buffer);
    const silent = await startResearchJob(args).result;
    expect(silent.estimate.preview.lines[0]).toMatchObject({
      status: 'unsupported',
      reason: 'no-evidence',
      chunks: [],
    });
    args.canonical.lines[0].text = '你好world';
    const mixed = await startResearchJob(args).result;
    expect(mixed.estimate.preview.lines[0].reason).toBe('unsupported-language');
    expect(args.calls.some((c) => c.command === 'infer')).toBe(false);
  });
  it('preserves T2 and declines failed boundaries, assets and unbounded intervals', async () => {
    const args = await setup();
    args.canonical.lines[0].segments = [
      { segmentId: 's1', text: '你好世界', startMs: 1000, endMs: 4000 },
    ];
    const t2 = await startResearchJob(args).result;
    expect(t2.estimate.preview.lines[0].status).toBe('unsupported');
    delete args.canonical.lines[0].segments;
    args.binding.assertCurrent = async () => {
      throw Error('asset changed');
    };
    await expect(startResearchJob(args).result).rejects.toThrow();
    expect(args.group.pids()).toEqual([]);
    args.canonical.lines[0].endMs = null;
    args.binding.assertCurrent = async () => {};
    const open = await startResearchJob(args).result;
    expect(open.estimate.preview.lines[0].reason).toBe('unresolved-interval');
  });
});
