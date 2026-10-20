import { describe, expect, it } from 'vitest';
import {
  conditionMetrics,
  memoryMetrics,
  assetBytes,
  findAudioClock,
  ownedMemorySamples,
} from './pairingMetrics.cjs';

describe('paired-model research metrics', () => {
  it('filters each memory snapshot by live ancestry so recycled PIDs are excluded', () => {
    const row = (pid, parentPid) => ({
      pid,
      parentPid,
      workingSetBytes: 10,
      peakWorkingSetBytes: 20,
    });
    const samples = [
      { processes: [row(1, 99), row(2, 1), row(3, 2)] },
      {
        processes: [
          row(1, 99),
          row(2, 77),
          row(3, 2),
          {
            pid: 4,
            parentPid: 1,
            workingSetBytes: null,
            peakWorkingSetBytes: null,
          },
        ],
      },
    ];
    const filtered = ownedMemorySamples(samples, 1);
    expect(filtered.samples.map((s) => s.processes.map((p) => p.pid))).toEqual([
      [1, 2, 3],
      [1],
    ]);
    expect(filtered.discardedRows).toBe(3);
    expect(samples[1].processes).toHaveLength(4);
  });
  it('rejects unknown conditions, invalid target indices and incomplete decisions before counting', () => {
    const item = {
      id: 'sample',
      variant: 'normal',
      targetIndex: 0,
      language: 'zh',
    };
    const c = {
      id: 'sample',
      canonical: { lines: [{ text: '這是一行測試' }] },
      estimate: { preview: { lines: [{ status: 'ready', chunks: [{}] }] } },
    };
    const stat = {
      id: 'sample',
      decisions: [{ reject: false, insertionWarning: false, state: 'unknown' }],
    };
    for (const update of [
      { variant: 'other' },
      { id: '' },
      { targetIndex: 2 },
      { targetIndex: -1 },
      { targetIndex: 0.5 },
    ])
      expect(() =>
        conditionMetrics([{ ...item, ...update }], [c], [stat]),
      ).toThrow();
    expect(() =>
      conditionMetrics(
        [item],
        [c],
        [{ ...stat, decisions: [{ reject: false }] }],
      ),
    ).toThrow();
    expect(() =>
      conditionMetrics(
        [item],
        [c],
        [
          {
            ...stat,
            decisions: [{ ...stat.decisions[0], missing: 'invalid' }],
          },
        ],
      ),
    ).toThrow();
  });
  it('does not assign a clock to silence, constant signals or insufficient sample pairs', () => {
    const a = new Float32Array(4000).fill(0.2);
    expect(findAudioClock(a, a).best.correlation).toBeNull();
    expect(
      findAudioClock(new Float32Array(4000), a).best.correlation,
    ).toBeNull();
    expect(() => findAudioClock(a, a, { stride: 10000 })).toThrow();
  });
  it('keeps unsupported and unknown targets in their explicit denominators', () => {
    const items = [
      'normal',
      'phrase-mismatch',
      'missing-text',
      'missing-audio',
    ].map((variant, i) => ({
      id: `case-${i}`,
      variant,
      targetIndex: 0,
      language: 'zh',
    }));
    const cases = items.map((item, i) => ({
      id: item.id,
      canonical: {
        lines: [{ text: i === 3 ? 'English only' : '這是一行測試' }],
      },
      estimate: {
        preview: {
          lines: [{ status: i === 1 ? 'unsupported' : 'ready', chunks: [{}] }],
        },
      },
    }));
    const stats = items.map((item, i) => ({
      id: item.id,
      decisions: [
        {
          reject: i === 1,
          insertionWarning: i === 2,
          state: i === 1 ? 'contradiction' : 'unknown',
          insertionState: 'unknown',
        },
      ],
    }));
    const result = conditionMetrics(items, cases, stats);
    expect(
      result.conditions.find((r) => r.variant === 'missing-audio'),
    ).toMatchObject({ total: 1, supported: 0, unsupported: 1, ready: 0 });
    expect(
      result.conditions.find((r) => r.variant === 'phrase-mismatch'),
    ).toMatchObject({ total: 1, supported: 1, ready: 0, rejected: 1 });
    expect(result.normal).toMatchObject({
      totalLines: 1,
      readyLines: 1,
      unknownContentLines: 1,
    });
    expect(
      result.conditions.find((r) => r.variant === 'missing-text').warnings,
    ).toBe(1);
    expect(() => conditionMetrics(items, cases.slice(1), stats)).toThrow();
    expect(() =>
      conditionMetrics(items, cases, [
        { ...stats[0], id: 'other' },
        ...stats.slice(1),
      ]),
    ).toThrow();
  });

  it('reports observed concurrent memory rather than summing sequential process peaks', () => {
    const result = memoryMetrics([
      {
        processes: [
          { pid: 1, workingSetBytes: 10, peakWorkingSetBytes: 20 },
          { pid: 2, workingSetBytes: 100, peakWorkingSetBytes: 150 },
        ],
      },
      {
        processes: [
          { pid: 1, workingSetBytes: 15, peakWorkingSetBytes: 20 },
          { pid: 3, workingSetBytes: 200, peakWorkingSetBytes: 300 },
        ],
      },
    ]);
    expect(result.observedConcurrentWorkingSetBytes).toBe(215);
    expect(result.maxSingleProcessPeakWorkingSetBytes).toBe(300);
    expect(result).not.toHaveProperty('trueConcurrentPeakBytes');
    expect(memoryMetrics([]).observedConcurrentWorkingSetBytes).toBeNull();
  });

  it('counts unique paths separately from identical bytes in duplicate copies', () => {
    const a = { file: 'one', bytes: 10, sha256: 'a'.repeat(64) },
      b = { file: 'two', bytes: 10, sha256: 'a'.repeat(64) };
    expect(assetBytes([a, a, b])).toEqual({
      logicalFileBytes: 20,
      contentUniqueBytes: 10,
      duplicateCopyBytes: 10,
      fileCount: 2,
    });
    expect(() => assetBytes([a, { ...a, bytes: 11 }])).toThrow();
    expect(() => assetBytes([{ ...a, bytes: -1 }])).toThrow();
  });

  it('measures signal-only clock lag without modifying either input or lyric timing', () => {
    let state = 17;
    const reference = Float32Array.from({ length: 5000 }, () => {
      state = (state * 16807) % 2147483647;
      return state / 2147483647 - 0.5;
    });
    const other = new Float32Array(reference.length);
    other.set(reference.subarray(0, -16), 16);
    const before = reference.slice();
    expect(
      findAudioClock(reference, other, { maxLagSamples: 32, stride: 1 }).best,
    ).toMatchObject({ lagSamples: 16, lagMs: 1 });
    expect(
      findAudioClock(reference, other, { maxLagSamples: 32, stride: 1 }).best
        .correlation,
    ).toBeCloseTo(1, 8);
    expect(reference).toEqual(before);
    expect(() => findAudioClock(new Float32Array(1), other)).toThrow();
  });
});
