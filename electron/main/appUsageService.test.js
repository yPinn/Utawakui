import { describe, expect, it, vi } from 'vitest';
import appUsageServiceModule from './appUsageService.js';

const { createAppUsageService } = appUsageServiceModule;

function createIntervalControls() {
  const calls = [];
  const scheduleInterval = vi.fn((callback, intervalMs) => {
    const timer = { unref: vi.fn() };
    calls.push({ callback, intervalMs, timer });
    return timer;
  });
  const clearIntervalFn = vi.fn();
  return { scheduleInterval, clearIntervalFn, calls };
}

function metric(pid, cpuSeconds, workingSetKb) {
  return {
    pid,
    cpu: { cumulativeCPUUsage: cpuSeconds },
    memory: { workingSetSize: workingSetKb },
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createAppUsageService', () => {
  it('samples Electron processes on every tick and publishes cpu/ram (no heavy job)', async () => {
    let call = 0;
    const snapshots = [
      [metric(100, 1, 1000)],
      [metric(100, 3.5, 1000)], // +2.5s cpu over 3s on a 5-core box = 2.5/(3*5)=16.7%
    ];
    const getAppMetrics = vi.fn(() => snapshots[Math.min(call++, 1)]);
    const publishStatus = vi.fn();
    const { scheduleInterval, calls } = createIntervalControls();
    let time = 0;
    const now = vi.fn(() => time);

    const service = createAppUsageService({
      getAppMetrics,
      cpuCount: 5,
      totalMemoryBytes: 1000 * 1024 * 10,
      publishStatus,
      scheduleInterval,
      intervalMs: 3000,
      now,
    });

    service.start();
    expect(scheduleInterval).toHaveBeenCalledWith(expect.any(Function), 3000);
    expect(calls[0].timer.unref).toHaveBeenCalledOnce();

    time = 3000;
    await calls[0].callback();
    await flush();

    expect(publishStatus).toHaveBeenCalledOnce();
    expect(publishStatus).toHaveBeenCalledWith({
      cpuPercent: 16.7,
      ramPercent: 10,
    });
    expect(service.getStatus()).toEqual({ cpuPercent: 16.7, ramPercent: 10 });
  });

  it('does not sample child processes when no heavy job is active', async () => {
    const getAppMetrics = vi.fn(() => [metric(100, 0, 0)]);
    const sampleChildProcessTree = vi.fn(async () => []);
    const { scheduleInterval, calls } = createIntervalControls();

    const service = createAppUsageService({
      getAppMetrics,
      cpuCount: 4,
      totalMemoryBytes: 1_000_000,
      isHeavyJobActive: () => false,
      sampleChildProcessTree,
      scheduleInterval,
    });

    service.start();
    await calls[0].callback();
    await flush();

    expect(sampleChildProcessTree).not.toHaveBeenCalled();
  });

  it('folds descendant child processes into the reading while a heavy job is active', async () => {
    let call = 0;
    const electronSnapshots = [[metric(1, 0, 0)], [metric(1, 0, 0)]];
    const getAppMetrics = vi.fn(() => electronSnapshots[Math.min(call++, 1)]);
    const childRows = [
      [{ pid: 50, ppid: 1, cpuSeconds: 0, workingSetBytes: 2000 }],
      [{ pid: 50, ppid: 1, cpuSeconds: 2, workingSetBytes: 2000 }],
    ];
    let childCall = 0;
    const sampleChildProcessTree = vi.fn(
      async () => childRows[Math.min(childCall++, 1)],
    );
    const { scheduleInterval, calls } = createIntervalControls();
    let time = 0;
    const now = vi.fn(() => time);

    const service = createAppUsageService({
      getAppMetrics,
      cpuCount: 2,
      totalMemoryBytes: 2000 * 10,
      isHeavyJobActive: () => true,
      sampleChildProcessTree,
      rootPid: 1,
      scheduleInterval,
      now,
    });

    service.start();
    time = 2000;
    await calls[0].callback();
    await flush();
    time = 4000;
    await calls[0].callback();
    await flush();

    expect(sampleChildProcessTree).toHaveBeenCalledTimes(2);
    // 2s cpu delta over 2s elapsed on a 2-core box = 2/(2*2) = 50%.
    expect(service.getStatus()).toEqual({ cpuPercent: 50, ramPercent: 10 });
  });

  it('excludes pids selectDescendantPids does not return, even if present in the raw rows', async () => {
    const getAppMetrics = vi.fn(() => [metric(1, 0, 0)]);
    // pid 99 is unrelated to the app's process tree (ppid points elsewhere).
    const sampleChildProcessTree = vi.fn(async () => [
      { pid: 99, ppid: 12345, cpuSeconds: 5, workingSetBytes: 999_999 },
    ]);
    const { scheduleInterval, calls } = createIntervalControls();
    let time = 0;
    const now = vi.fn(() => time);

    const service = createAppUsageService({
      getAppMetrics,
      cpuCount: 4,
      totalMemoryBytes: 1_000_000,
      isHeavyJobActive: () => true,
      sampleChildProcessTree,
      rootPid: 1,
      scheduleInterval,
      now,
    });

    service.start();
    time = 2000;
    await calls[0].callback();
    await flush();

    // pid 99 isn't a descendant of rootPid 1, so its 999_999 bytes/5s of cpu
    // must not be folded in: ramPercent stays 0, not driven by the excluded pid.
    expect(service.getStatus()).toEqual({ cpuPercent: 0, ramPercent: 0 });
  });

  it('does not start a second timer if already started', () => {
    const getAppMetrics = vi.fn(() => []);
    const { scheduleInterval } = createIntervalControls();
    const service = createAppUsageService({
      getAppMetrics,
      cpuCount: 4,
      totalMemoryBytes: 1000,
      scheduleInterval,
    });

    service.start();
    service.start();

    expect(scheduleInterval).toHaveBeenCalledOnce();
  });

  it('stops the timer and further ticks no longer fire', () => {
    const getAppMetrics = vi.fn(() => []);
    const publishStatus = vi.fn();
    const { scheduleInterval, clearIntervalFn, calls } =
      createIntervalControls();
    const service = createAppUsageService({
      getAppMetrics,
      cpuCount: 4,
      totalMemoryBytes: 1000,
      publishStatus,
      scheduleInterval,
      clearIntervalFn,
    });

    service.start();
    service.stop();

    expect(clearIntervalFn).toHaveBeenCalledWith(calls[0].timer);

    service.stop();
    expect(clearIntervalFn).toHaveBeenCalledOnce();
  });

  it('records a logger error and keeps the previous status if a sample throws', async () => {
    let call = 0;
    const getAppMetrics = vi.fn(() => {
      call += 1;
      if (call === 1) return [metric(1, 0, 0)];
      throw new Error('boom');
    });
    const publishStatus = vi.fn();
    const error = vi.fn();
    const { scheduleInterval, calls } = createIntervalControls();

    const service = createAppUsageService({
      getAppMetrics,
      cpuCount: 4,
      totalMemoryBytes: 1000,
      publishStatus,
      scheduleInterval,
      logger: { error },
    });

    service.start();
    await calls[0].callback();
    await flush();

    expect(error).toHaveBeenCalledOnce();
    expect(publishStatus).not.toHaveBeenCalled();
    expect(service.getStatus()).toEqual({ cpuPercent: null, ramPercent: null });
  });

  it('skips a tick that arrives while the previous one is still awaiting child sampling', async () => {
    let resolveChildSample;
    const sampleChildProcessTree = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveChildSample = resolve;
        }),
    );
    const getAppMetrics = vi.fn(() => [metric(1, 0, 0)]);
    const { scheduleInterval, calls } = createIntervalControls();

    const service = createAppUsageService({
      getAppMetrics,
      cpuCount: 4,
      totalMemoryBytes: 1000,
      isHeavyJobActive: () => true,
      sampleChildProcessTree,
      scheduleInterval,
    });

    service.start();
    const firstTick = calls[0].callback();
    calls[0].callback();
    expect(sampleChildProcessTree).toHaveBeenCalledOnce();

    resolveChildSample([]);
    await firstTick;
    await flush();

    expect(sampleChildProcessTree).toHaveBeenCalledOnce();
  });
});
