import { describe, expect, it, vi } from 'vitest';
import {
  createPerformanceProjection,
  summarizeSamples,
  readMetrics,
  parseProbeArguments,
  collectProbeRuntimeFiles,
  summarizeAlpha,
  probeExpectedText,
  inspectProbeModuleGraph,
} from './outputPerformanceProbe.mjs';
import { parseOutputSnapshot } from '../shared/outputContract.js';
import { parseOutputStreamEnvelope } from '../shared/outputStreamContract.js';

describe('F5 synthetic workload and resource evidence', () => {
  it('reports an imported module missing from the HTTP allowlist before opening a template', async () => {
    const responses = {
      '/overlay/lyrics/lyrics.mjs':
        "import './host.mjs'; export { frame } from '/shared/state.mjs';",
      '/overlay/lyrics/host.mjs': "import '/shared/state.mjs';",
      '/shared/state.mjs': "import {\n phrases\n} from './phrases.mjs';",
    };
    const fetchModule = async (url) => {
      const route = new URL(url).pathname;
      return new Response(responses[route] ?? '{}', {
        status: Object.hasOwn(responses, route) ? 200 : 404,
        headers: { 'content-type': 'text/javascript' },
      });
    };
    const failed = await inspectProbeModuleGraph(
      'http://127.0.0.1:1234',
      ['lyrics'],
      fetchModule,
    );
    expect(failed.status).toBe('failed');
    expect(failed.failures).toContainEqual({
      route: '/shared/phrases.mjs',
      reason: 'HTTP 404',
    });
    responses['/shared/phrases.mjs'] = 'export const phrases = [];';
    const passed = await inspectProbeModuleGraph(
      'http://127.0.0.1:1234',
      ['lyrics'],
      fetchModule,
    );
    expect(passed.status).toBe('passed');
    expect(passed.routes).toHaveLength(4);
  });
  it('bounds module inspection and rejects non-JavaScript or external imports without fetching them', async () => {
    for (const [body, type, reason] of [
      ['{}', 'application/json', 'content-type'],
      [
        "import 'https://example.invalid/private.mjs';",
        'text/javascript',
        'external-import',
      ],
    ]) {
      const fetchModule = vi.fn(
        async () => new Response(body, { headers: { 'content-type': type } }),
      );
      const result = await inspectProbeModuleGraph(
        'http://127.0.0.1:1234',
        ['lyrics'],
        fetchModule,
      );
      expect(result.status).toBe('failed');
      expect(result.failures[0].reason).toContain(reason);
      expect(fetchModule).toHaveBeenCalledTimes(1);
    }
    const result = await inspectProbeModuleGraph(
      'http://127.0.0.1:1234',
      ['lyrics'],
      async () => {
        throw Error('network-down');
      },
    );
    expect(result.failures[0].reason).toBe('fetch-failed');
  });
  it('compares active KTV and Kinetic phrases instead of mistaking a full line for the visible phrase', () => {
    const snapshot = createPerformanceProjection({ state: 'paused' }).snapshot;
    for (const templateId of ['karaoke-stack', 'kinetic-pop'])
      expect(probeExpectedText({ kind: 'lyrics', templateId }, snapshot)).toBe(
        '並べてみる',
      );
    for (const templateId of ['ornate-vertical', 'live-stage', 'manga-frame'])
      expect(probeExpectedText({ kind: 'lyrics', templateId }, snapshot)).toBe(
        '試験の言葉を 並べてみる',
      );
    expect(
      probeExpectedText(
        { kind: 'setlist', templateId: 'queue-board' },
        snapshot,
      ),
    ).toBe('合成測試曲 0');
    expect(
      probeExpectedText(
        { kind: 'now-playing', templateId: 'art-card' },
        snapshot,
      ),
    ).toBe('合成測試曲 0');
  });
  it('records raw Electron bitmap alpha without claiming OBS composition', () => {
    expect(
      summarizeAlpha(
        Buffer.from([0, 0, 0, 0, 10, 20, 30, 128, 20, 20, 20, 255]),
      ),
    ).toEqual({ pixels: 3, transparent: 1, partial: 1, opaque: 1 });
    expect(() => summarizeAlpha(Buffer.alloc(3))).toThrow();
  });
  it('freezes the loaded Output closure rather than unrelated shared Performer work', () => {
    const files = collectProbeRuntimeFiles();
    for (const expected of [
      'overlay/lyrics/lyrics.mjs',
      'shared/presentation/state.mjs',
      'overlay/shared/lifecycle.mjs',
      'electron/lib/outputDeliveryQueue.js',
      'node_modules/gsap/dist/gsap.min.js',
    ])
      expect(files).toContain(expected);
    expect(files).not.toContain('shared/performerViewContract.mjs');
    expect(files).not.toContain('shared/presentation/performerFrame.mjs');
    expect(files.filter((f) => /\.(?:woff2?|ttf)$/.test(f))).toHaveLength(5);
    expect(files.some((f) => f.includes('.test.'))).toBe(false);
  });
  it('advances the real-time workload without mutating canonical player or fixture data', () => {
    const a = createPerformanceProjection({
      elapsedMs: 5000,
      revision: 1,
      nowMs: 100000,
    });
    const b = createPerformanceProjection({
      elapsedMs: 37000,
      revision: 2,
      nowMs: 132000,
    });
    expect(a.snapshot.playback.status).toBe('playing');
    expect(a.snapshot.playback.positionMs).toBe(5000);
    expect(b.snapshot.playback.track.id).not.toBe(a.snapshot.playback.track.id);
    expect(b.snapshot.lyrics.lines[0].text).toBe('合成確認1');
    expect(b.snapshot.lyrics.reading).toBeUndefined();
    expect(a.sourceEpoch).toBe(b.sourceEpoch);
    for (const projection of [
      a,
      b,
      createPerformanceProjection({ state: 'empty' }),
      createPerformanceProjection({ state: 'paused' }),
      createPerformanceProjection({ sourceStatus: 'unavailable' }),
    ]) {
      expect(() => parseOutputSnapshot(projection.snapshot)).not.toThrow();
      const e = projection.streams.state;
      expect(() =>
        parseOutputStreamEnvelope(
          {
            contractVersion: 3,
            bootId: projection.bootId,
            sourceEpoch: 'audit-epoch',
            stream: 'state.snapshot',
            kind: 'full',
            ...e,
          },
          projection.bootId,
        ),
      ).not.toThrow();
    }
    expect(
      createPerformanceProjection({ state: 'paused', elapsedMs: 7000 }).snapshot
        .playback.positionMs,
    ).toBe(5000);
    expect(() => createPerformanceProjection({ state: 'not-real' })).toThrow();
  });
  it('distinguishes CPU, process working set and unavailable VRAM without coercing unknowns to zero', () => {
    const m = readMetrics(
      [
        {
          type: 'Browser',
          cpu: { percentCPUUsage: 2 },
          memory: { workingSetSize: 100 },
        },
        {
          type: 'GPU',
          cpu: { percentCPUUsage: 3 },
          memory: { workingSetSize: 50 },
        },
      ],
      { clients: 3, delivery: { queuedBytes: 12, droppedMessages: 0 } },
    );
    expect(m.cpuPercent).toBe(5);
    expect(m.workingSetKb).toBe(150);
    expect(m.gpuProcessWorkingSetKb).toBe(50);
    expect(m.gpuVramKb).toBeNull();
    expect(m.queuedBytes).toBe(12);
    expect(readMetrics([], {}).cpuPercent).toBeNull();
  });
  it('splits warmup and steady observations and uses descriptive ranges, not invented budgets', () => {
    const samples = [
      { elapsedMs: 0, workingSetKb: 20, cpuPercent: 5, queuedBytes: 0 },
      { elapsedMs: 60000, workingSetKb: 30, cpuPercent: 2, queuedBytes: 0 },
      { elapsedMs: 120000, workingSetKb: 40, cpuPercent: 3, queuedBytes: 4 },
    ];
    const s = summarizeSamples(samples, 60000);
    expect(s.warmup.samples).toBe(1);
    expect(s.steady.samples).toBe(2);
    expect(s.steady.workingSetKb.delta).toBe(10);
    expect(s.steady.cpuPercent.max).toBe(3);
    expect(s.budgets).toBeNull();
    expect(summarizeSamples([], 60000).steady.workingSetKb).toBeNull();
  });
  it('only accepts bounded development probe modes and registered durations', () => {
    expect(
      parseProbeArguments(['--mode', 'baseline', '--template', 'art-card'])
        .templates,
    ).toEqual(['art-card']);
    expect(() =>
      parseProbeArguments(['--mode', 'baseline', '--template', '../bad']),
    ).toThrow();
    expect(parseProbeArguments(['--mode', 'soak'])).toEqual({
      mode: 'soak',
      minutes: 5,
    });
    expect(
      parseProbeArguments(['--mode', 'soak', '--minutes', '60']).minutes,
    ).toBe(60);
    for (const a of [
      ['--url', 'http://x'],
      ['--minutes', '0'],
      ['--minutes', '61'],
      ['--mode', 'wat'],
      ['--mode'],
      ['--mode', 'soak', '--mode', 'integration'],
    ])
      expect(() => parseProbeArguments(a)).toThrow();
    expect(parseProbeArguments(['--mode', 'integration'])).toEqual({
      mode: 'integration',
      minutes: 5,
    });
  });
});
