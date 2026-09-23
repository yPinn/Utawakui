import { describe, expect, it } from 'vitest';
import systemUsageModule from './systemUsage.js';

const { sampleCpuPercent, sampleMemoryPercent } = systemUsageModule;

function cpu(idle, other) {
  // "other" spreads across user/nice/sys/irq so totalDelta isn't just idle.
  return { times: { user: other, nice: 0, sys: other, idle, irq: 0 } };
}

describe('sampleCpuPercent', () => {
  it('returns null on the first sample (no previous snapshot yet)', () => {
    expect(sampleCpuPercent(null, [cpu(100, 50)])).toBeNull();
  });

  it('returns null when the core count changes between samples', () => {
    expect(
      sampleCpuPercent([cpu(100, 50)], [cpu(100, 50), cpu(100, 50)]),
    ).toBeNull();
  });

  it('returns null when the two snapshots are identical (no time elapsed)', () => {
    const snapshot = [cpu(100, 50)];
    expect(sampleCpuPercent(snapshot, snapshot)).toBeNull();
  });

  it('computes 0% when every delta tick was idle', () => {
    const previous = [cpu(100, 50)];
    const current = [cpu(200, 50)];
    expect(sampleCpuPercent(previous, current)).toBe(0);
  });

  it('computes 100% when no delta tick was idle', () => {
    const previous = [cpu(100, 50)];
    const current = [cpu(100, 150)];
    expect(sampleCpuPercent(previous, current)).toBe(100);
  });

  it('computes a mid-range percent across multiple cores', () => {
    // Each core: total delta = 25 (user) + 25 (sys) + 50 (idle) = 100;
    // idle delta = 50 -> 50% busy per core, same across both cores.
    const previous = [cpu(0, 0), cpu(0, 0)];
    const current = [cpu(50, 25), cpu(50, 25)];
    expect(sampleCpuPercent(previous, current)).toBe(50);
  });
});

describe('sampleMemoryPercent', () => {
  it('computes used/total as a rounded percent', () => {
    const value = sampleMemoryPercent({
      totalmem: () => 16_000_000_000,
      freemem: () => 4_000_000_000,
    });
    expect(value).toBe(75);
  });

  it('returns null when total memory is not a usable positive number', () => {
    expect(
      sampleMemoryPercent({ totalmem: () => 0, freemem: () => 0 }),
    ).toBeNull();
    expect(
      sampleMemoryPercent({ totalmem: () => NaN, freemem: () => 0 }),
    ).toBeNull();
  });

  it('clamps to 100% if free memory is reported as negative (never below zero)', () => {
    const value = sampleMemoryPercent({
      totalmem: () => 1000,
      freemem: () => -1,
    });
    expect(value).toBe(100);
  });
});
