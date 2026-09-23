import { describe, expect, it, vi } from 'vitest';
import systemUsageServiceModule from './systemUsageService.js';

const { createSystemUsageService } = systemUsageServiceModule;

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

function fakeOs({ cpuSnapshots, totalmem = 1000, freemem = 500 }) {
  let call = 0;
  return {
    cpus: vi.fn(() => cpuSnapshots[Math.min(call++, cpuSnapshots.length - 1)]),
    totalmem: () => totalmem,
    freemem: () => freemem,
  };
}

function cpu(idle, other) {
  return { times: { user: other, nice: 0, sys: other, idle, irq: 0 } };
}

describe('createSystemUsageService', () => {
  it('samples on every interval tick and publishes cpu/ram', () => {
    // total delta = 25 (user) + 25 (sys) + 50 (idle) = 100; idle delta = 50
    // -> 50% busy.
    const os = fakeOs({
      cpuSnapshots: [[cpu(0, 0)], [cpu(50, 25)]],
      totalmem: 1000,
      freemem: 250,
    });
    const publishStatus = vi.fn();
    const { scheduleInterval, calls } = createIntervalControls();

    const service = createSystemUsageService({
      os,
      publishStatus,
      scheduleInterval,
      intervalMs: 3000,
    });

    service.start();
    expect(scheduleInterval).toHaveBeenCalledWith(expect.any(Function), 3000);
    expect(calls[0].timer.unref).toHaveBeenCalledOnce();
    expect(publishStatus).not.toHaveBeenCalled();

    calls[0].callback();

    expect(publishStatus).toHaveBeenCalledOnce();
    expect(publishStatus).toHaveBeenCalledWith({
      cpuPercent: 50,
      ramPercent: 75,
    });
    expect(service.getStatus()).toEqual({
      cpuPercent: 50,
      ramPercent: 75,
    });
  });

  it('does not start a second timer if already started', () => {
    const os = fakeOs({ cpuSnapshots: [[cpu(100, 50)]] });
    const { scheduleInterval } = createIntervalControls();
    const service = createSystemUsageService({ os, scheduleInterval });

    service.start();
    service.start();

    expect(scheduleInterval).toHaveBeenCalledOnce();
  });

  it('stops the timer and further ticks no longer fire', () => {
    const os = fakeOs({ cpuSnapshots: [[cpu(100, 50)], [cpu(150, 100)]] });
    const publishStatus = vi.fn();
    const { scheduleInterval, clearIntervalFn, calls } =
      createIntervalControls();
    const service = createSystemUsageService({
      os,
      publishStatus,
      scheduleInterval,
      clearIntervalFn,
    });

    service.start();
    service.stop();

    expect(clearIntervalFn).toHaveBeenCalledWith(calls[0].timer);

    // stop() should be a no-op the second time (nothing left to clear).
    service.stop();
    expect(clearIntervalFn).toHaveBeenCalledOnce();
  });

  it('records a logger error and keeps the previous status if a sample throws', () => {
    // Succeeds once for start()'s baseline read, then throws on the tick's
    // own os.cpus() call — the failure under test is mid-sampling, not
    // start() itself.
    let cpusCallCount = 0;
    const os = {
      cpus: vi.fn(() => {
        cpusCallCount += 1;
        if (cpusCallCount === 1) return [cpu(100, 50)];
        throw new Error('boom');
      }),
      totalmem: () => 1000,
      freemem: () => 500,
    };
    const publishStatus = vi.fn();
    const error = vi.fn();
    const { scheduleInterval, calls } = createIntervalControls();
    const service = createSystemUsageService({
      os,
      publishStatus,
      scheduleInterval,
      logger: { error },
    });

    service.start();
    calls[0].callback();

    expect(error).toHaveBeenCalledOnce();
    expect(publishStatus).not.toHaveBeenCalled();
    expect(service.getStatus()).toEqual({
      cpuPercent: null,
      ramPercent: null,
    });
  });
});
