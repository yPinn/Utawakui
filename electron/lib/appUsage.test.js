import { describe, expect, it } from 'vitest';
import appUsageModule from './appUsage.js';

const { collectElectronSnapshot, sampleCpuPercent, sampleMemoryPercent } =
  appUsageModule;

describe('collectElectronSnapshot', () => {
  it('converts getAppMetrics rows into a pid-keyed map, KB working set to bytes', () => {
    const snapshot = collectElectronSnapshot([
      {
        pid: 100,
        cpu: { cumulativeCPUUsage: 2.5 },
        memory: { workingSetSize: 1024 },
      },
      {
        pid: 200,
        cpu: { cumulativeCPUUsage: 0.75 },
        memory: { workingSetSize: 512 },
      },
    ]);
    expect(snapshot.get(100)).toEqual({
      cpuSeconds: 2.5,
      workingSetBytes: 1024 * 1024,
    });
    expect(snapshot.get(200)).toEqual({
      cpuSeconds: 0.75,
      workingSetBytes: 512 * 1024,
    });
  });

  it('skips rows without a finite pid and defaults missing cpu/memory fields to 0', () => {
    const snapshot = collectElectronSnapshot([
      { pid: undefined, cpu: { cumulativeCPUUsage: 1 } },
      { pid: 300, cpu: {}, memory: {} },
    ]);
    expect(snapshot.size).toBe(1);
    expect(snapshot.get(300)).toEqual({ cpuSeconds: 0, workingSetBytes: 0 });
  });

  it('returns an empty map for non-array input', () => {
    expect(collectElectronSnapshot(null).size).toBe(0);
  });
});

describe('sampleCpuPercent', () => {
  it('returns null on the first sample (no previous snapshot yet)', () => {
    expect(sampleCpuPercent(null, new Map([[1, 5]]), 3000, 4)).toBeNull();
  });

  it('returns null when elapsed time is zero or negative', () => {
    const snapshot = new Map([[1, 5]]);
    expect(sampleCpuPercent(snapshot, snapshot, 0, 4)).toBeNull();
    expect(sampleCpuPercent(snapshot, snapshot, -10, 4)).toBeNull();
  });

  it('returns null when cpuCount is not a usable positive number', () => {
    expect(sampleCpuPercent(new Map(), new Map(), 3000, 0)).toBeNull();
  });

  it('only diffs pids present in both snapshots', () => {
    // pid 1 used 1.5s of CPU over 3s elapsed on a 4-core machine: 1.5 / (3*4) = 12.5%.
    // pid 2 only exists in the current snapshot (just started) and is ignored.
    const previous = new Map([[1, 1.0]]);
    const current = new Map([
      [1, 2.5],
      [2, 0.4],
    ]);
    expect(sampleCpuPercent(previous, current, 3000, 4)).toBe(12.5);
  });

  it('ignores a pid whose cpu seconds went down (pid reused between samples)', () => {
    const previous = new Map([[1, 5]]);
    const current = new Map([[1, 1]]);
    expect(sampleCpuPercent(previous, current, 3000, 4)).toBe(0);
  });

  it('clamps to 100% when the delta exceeds the elapsed*core budget', () => {
    const previous = new Map([[1, 0]]);
    const current = new Map([[1, 100]]);
    expect(sampleCpuPercent(previous, current, 1000, 1)).toBe(100);
  });
});

describe('sampleMemoryPercent', () => {
  it('computes used/total as a percent rounded to 2 decimals', () => {
    expect(sampleMemoryPercent(5_242_880, 1_000_000_000)).toBe(0.52);
  });

  it('returns null when total memory is not a usable positive number', () => {
    expect(sampleMemoryPercent(100, 0)).toBeNull();
    expect(sampleMemoryPercent(100, NaN)).toBeNull();
  });

  it('clamps to 100% and treats a negative used value as 0', () => {
    expect(sampleMemoryPercent(-1, 1000)).toBe(0);
    expect(sampleMemoryPercent(5000, 1000)).toBe(100);
  });
});
