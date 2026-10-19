import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { afterEach, expect, it } from 'vitest';
import { startQualityJob, validateFrozenCases } from './qualityRun.cjs';
import { sha } from './assets.cjs';
const require = createRequire(import.meta.url),
  store = require('../../../electron/lib/library/lyricsAcousticEstimates');
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-'));
  roots.push(root);
  const qdir = path.join(root, 'qwen'),
    source = { filename: 'main.vtt', kind: 'manual', offsetMs: 0 };
  fs.mkdirSync(path.join(qdir, 'lyrics'), { recursive: true });
  fs.writeFileSync(path.join(qdir, 'lyrics/main.vtt'), 'fixture');
  fs.writeFileSync(path.join(qdir, 'audio.wav'), 'audio');
  const basic = await store.prepareAcousticEstimateContext(qdir, source),
    method = {
      ...basic.method,
      kind: 'model',
      id: 'qwen-candidate-research',
      modelManifestSha256: 'a'.repeat(64),
      environmentLockSha256: 'b'.repeat(64),
    };
  const canonical = {
    documentId: 'doc',
    granularity: 'T1',
    normalizerProfileId: basic.source.normalizerProfileId,
    source: { filename: 'main.vtt', sha256: basic.source.sha256 },
    lines: [{ lineId: 'line', text: '你好世界', startMs: 1000, endMs: 4000 }],
  };
  const chunks = [
      [
        { chunkId: 'one', from: 0, to: 2, startMs: 1000 },
        { chunkId: 'two', from: 2, to: 4, startMs: 2500 },
      ],
    ],
    plan = { index: 0, startMs: 0, endMs: 5000, lineIds: ['line'] };
  const context = await store.prepareAcousticEstimateContext(qdir, source, {
    method,
  });
  const estimate = await store.saveTrackAcousticEstimate(
    qdir,
    source,
    store.createAcousticEstimate(context, canonical, chunks),
    { method },
  );
  const item = { id: 'fixture', language: 'zh', durationMs: 5000, offsetMs: 0 };
  const config = {
      qwen: { pythonPath: 'fixture', ffmpegPath: 'fixture' },
      vadModelPath: 'fixture',
      vadSha256: 'c'.repeat(64),
    },
    asrCases = {},
    asrBindings = {},
    asrSourceDirs = {};
  for (const kind of ['base', 'small']) {
    const dir = path.join(root, kind);
    asrSourceDirs[kind] = dir;
    fs.mkdirSync(path.join(dir, 'lyrics'), { recursive: true });
    fs.copyFileSync(
      path.join(qdir, 'lyrics/main.vtt'),
      path.join(dir, 'lyrics/main.vtt'),
    );
    fs.copyFileSync(path.join(qdir, 'audio.wav'), path.join(dir, 'audio.wav'));
    const am = {
      ...method,
      id: `${kind}-candidate-research`,
      modelManifestSha256: (kind === 'base' ? 'd' : 'e').repeat(64),
    };
    const ac = await store.prepareAcousticEstimateContext(dir, source, {
      method: am,
    });
    const ae = await store.saveTrackAcousticEstimate(
      dir,
      source,
      store.createAcousticEstimate(ac, canonical, chunks),
      { method: am },
    );
    const rawRoot = path.join(root, kind + '-raw');
    fs.mkdirSync(rawRoot);
    const filename = 'candidate-test-w0.json';
    const bytes = Buffer.from(
      JSON.stringify({
        model: { type: kind },
        params: { language: 'zh' },
        transcription: [
          {
            tokens: [
              {
                id: 1,
                text: Buffer.from('你好').toString('latin1'),
                offsets: { from: 1000 },
              },
              {
                id: 2,
                text: Buffer.from('世界').toString('latin1'),
                offsets: { from: 2500 },
              },
            ],
          },
        ],
      }),
      'latin1',
    );
    fs.writeFileSync(path.join(rawRoot, filename), bytes);
    config[kind] = { rawEvidenceRoot: rawRoot };
    asrCases[kind] = {
      method: am,
      canonical,
      estimate: ae,
      metrics: {
        windows: [{ ...plan, raw: { filename, sha256: sha(bytes) } }],
      },
    };
    asrBindings[kind] = { method: am, assertCurrent: async () => {} };
  }
  let closed = false;
  const group = {
    check() {
      if (closed) throw Error('closed');
    },
    close: async () => {
      closed = true;
    },
    pids: () => [],
    capture: async () => Buffer.from(new Float32Array(80000).fill(0.1).buffer),
    rpc: () => ({
      request: async (m) => ({
        ok: true,
        result:
          m.command === 'initialize'
            ? { ready: true }
            : { probabilities: Array(157).fill(0.9), peakRssBytes: 1 },
      }),
    }),
  };
  const args = {
    bindings: {
      config,
      qwen: { method, assertCurrent: async () => {} },
      asr: asrBindings,
    },
    item,
    old: { canonical, estimate, metrics: { windows: [plan] } },
    asrCases,
    asrSourceDirs,
    trackSourceDir: qdir,
    outputRoot: path.join(root, 'output'),
    methodSeed: 'f'.repeat(64),
    selectedProfiles: ['base-combined'],
    groupFactory: () => group,
  };
  return { args, root, source, group };
}
it('publishes after closing workers without treating normal close as cancellation', async () => {
  const { args } = await setup();
  const r = await startQualityJob(args).result;
  expect(
    r.outputs['base-combined'].estimate.preview.lines[0].chunks,
  ).toHaveLength(2);
  expect(r.remainingOwnedPids).toEqual([]);
  expect(fs.readdirSync(path.join(args.outputRoot, 'jobs'))).toEqual([]);
  expect(
    (
      await store.loadTrackAcousticEstimate(
        path.join(args.outputRoot, 'base-combined/fixture'),
        { filename: 'main.vtt', offsetMs: 0 },
      )
    ).status,
  ).toBe('stale');
});
it.each([
  'audio',
  'lyrics',
  'cancel',
  'binding',
  'ASR-audio',
  'raw',
  'deadline',
])('preserves prior estimate on %s failure', async (mode) => {
  const { args } = await setup(),
    dir = path.join(
      args.outputRoot,
      'base-combined/fixture/lyrics/acoustic-estimates',
    );
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'main.vtt.json');
  fs.writeFileSync(file, 'previous');
  let job;
  if (mode === 'ASR-audio')
    fs.writeFileSync(path.join(args.asrSourceDirs.base, 'audio.wav'), 'wrong');
  if (mode === 'raw')
    fs.appendFileSync(
      path.join(
        args.bindings.config.base.rawEvidenceRoot,
        'candidate-test-w0.json',
      ),
      'changed',
    );
  if (mode === 'binding')
    args.bindings.qwen.assertCurrent = async () => {
      throw Error('binding');
    };
  if (mode === 'deadline') args.timeoutMs = 1;
  args.onProgress = (e) => {
    if (e.stage === 'vad-window-done') {
      if (mode === 'audio')
        fs.appendFileSync(
          path.join(args.trackSourceDir, 'audio.wav'),
          'changed',
        );
      if (mode === 'lyrics')
        fs.appendFileSync(
          path.join(args.trackSourceDir, 'lyrics/main.vtt'),
          'changed',
        );
      if (mode === 'cancel') void job.cancel();
    }
  };
  job = startQualityJob(args);
  await expect(job.result).rejects.toThrow();
  expect(fs.readFileSync(file, 'utf8')).toBe('previous');
  if (fs.existsSync(path.join(args.outputRoot, 'jobs')))
    expect(fs.readdirSync(path.join(args.outputRoot, 'jobs'))).toEqual([]);
});
it('rejects a receipt from different canonical/input or case order', () => {
  const c = { id: 'one', canonical: { lines: [] } },
    items = [{ id: 'one' }],
    prior = { inputSha256: 'a', referenceSha256: 'b', cases: [c] },
    asr = { base: { ...prior } };
  expect(() => validateFrozenCases(items, prior, asr)).not.toThrow();
  expect(() =>
    validateFrozenCases(items, prior, { base: { ...prior, inputSha256: 'c' } }),
  ).toThrow('context');
  expect(() =>
    validateFrozenCases(items, { ...prior, cases: [{ ...c, id: 'two' }] }, asr),
  ).toThrow('identity');
});
