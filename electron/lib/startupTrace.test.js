import { describe, expect, it, vi } from 'vitest';
import startupTraceModule from './startupTrace.js';

const {
  createStartupBaselineMetadata,
  createStartupTrace,
  parseExternalStartupMilestone,
  readStartupTraceOptions,
  registerStartupTraceHandler,
} = startupTraceModule;

describe('startup trace contract', () => {
  it('is inert by default and does not touch its writer', async () => {
    const writeLine = vi.fn();
    const trace = createStartupTrace({ writeLine });

    expect(trace.enabled).toBe(false);
    expect(trace.record('process-start', { atUnixMs: 1000 })).toBe(false);
    await expect(trace.flush()).resolves.toBeUndefined();
    expect(writeLine).not.toHaveBeenCalled();
  });

  it('correlates fixed milestones in one clock domain and suppresses duplicates', async () => {
    const lines = [];
    const trace = createStartupTrace({
      enabled: true,
      sessionId: 'trace-1',
      timeOriginMs: 1000,
      now: () => 1300,
      writeLine: (line) => lines.push(line),
    });

    expect(trace.record('process-start', { atUnixMs: 1000 })).toBe(true);
    expect(
      trace.record('first-paint', {
        process: 'renderer',
        atUnixMs: 1123.4567,
      }),
    ).toBe(true);
    expect(
      trace.record('first-paint', {
        process: 'renderer',
        atUnixMs: 1200,
      }),
    ).toBe(false);
    await trace.flush();

    expect(lines.map(JSON.parse)).toEqual([
      {
        version: 1,
        sessionId: 'trace-1',
        name: 'process-start',
        process: 'main',
        atUnixMs: 1000,
        elapsedMs: 0,
      },
      {
        version: 1,
        sessionId: 'trace-1',
        name: 'first-paint',
        process: 'renderer',
        atUnixMs: 1123.457,
        elapsedMs: 123.457,
      },
    ]);
  });

  it('allows only bounded aggregate baseline metadata', async () => {
    const lines = [];
    const trace = createStartupTrace({
      enabled: true,
      sessionId: 'trace-1',
      timeOriginMs: 1000,
      now: () => 2000,
      writeLine: (line) => lines.push(line),
    });

    trace.record('baseline-complete', {
      atUnixMs: 1500,
      metadata: {
        cpuPercent: 12.34567,
        workingSetKb: 2048,
        peakWorkingSetKb: 4096,
        processCount: 4,
        outputQueuedBytes: 0,
        outputClients: 1,
        gpuAccelerationEnabled: true,
      },
    });
    await trace.flush();

    expect(JSON.parse(lines[0]).metadata).toEqual({
      cpuPercent: 12.346,
      workingSetKb: 2048,
      peakWorkingSetKb: 4096,
      processCount: 4,
      outputQueuedBytes: 0,
      outputClients: 1,
      gpuAccelerationEnabled: true,
    });
    expect(() =>
      trace.record('electron-ready', {
        atUnixMs: 1600,
        metadata: { title: 'private song title' },
      }),
    ).toThrow(TypeError);
  });

  it('reduces Electron and Output status to aggregate baseline metadata', () => {
    expect(
      createStartupBaselineMetadata({
        appMetrics: [
          {
            cpu: { percentCPUUsage: 2.25 },
            memory: { workingSetSize: 1024, peakWorkingSetSize: 2048 },
          },
          {
            cpu: { percentCPUUsage: 1.75 },
            memory: { workingSetSize: 512, peakWorkingSetSize: 768 },
          },
        ],
        gpuFeatureStatus: { gpu_compositing: 'enabled' },
        outputStatus: {
          clients: 2,
          delivery: { queuedBytes: 128 },
        },
      }),
    ).toEqual({
      cpuPercent: 4,
      workingSetKb: 1536,
      peakWorkingSetKb: 2816,
      processCount: 2,
      outputQueuedBytes: 128,
      outputClients: 2,
      gpuAccelerationEnabled: true,
    });
  });

  it('normalizes unavailable aggregate metrics without leaking raw status', () => {
    expect(
      createStartupBaselineMetadata({
        appMetrics: [{ cpu: {}, memory: { workingSetSize: -1 } }],
        gpuFeatureStatus: null,
        outputStatus: null,
      }),
    ).toEqual({
      cpuPercent: 0,
      workingSetKb: 0,
      peakWorkingSetKb: 0,
      processCount: 1,
      outputQueuedBytes: 0,
      outputClients: 0,
      gpuAccelerationEnabled: false,
    });
  });

  it.each([
    ['unknown milestone', { name: 'track-loaded', atUnixMs: 1100 }],
    [
      'wrong process',
      { name: 'first-paint', process: 'overlay', atUnixMs: 1100 },
    ],
    ['invalid clock', { name: 'first-paint', atUnixMs: 'now' }],
    ['before origin', { name: 'first-paint', atUnixMs: 999 }],
    ['too far ahead', { name: 'first-paint', atUnixMs: 7001 }],
  ])('rejects %s', (_label, value) => {
    expect(() =>
      parseExternalStartupMilestone(value, {
        expectedProcess: 'renderer',
        timeOriginMs: 1000,
        nowMs: 2000,
      }),
    ).toThrow(TypeError);
  });

  it('serializes writes and fails open when trace storage is unavailable', async () => {
    const order = [];
    const onError = vi.fn();
    const trace = createStartupTrace({
      enabled: true,
      sessionId: 'trace-1',
      timeOriginMs: 1000,
      now: () => 2000,
      onError,
      writeLine: async (line) => {
        order.push(JSON.parse(line).name);
        if (order.length === 1) throw new Error('disk full');
      },
    });

    trace.record('process-start', { atUnixMs: 1000 });
    trace.record('electron-ready', { atUnixMs: 1100 });
    await expect(trace.flush()).resolves.toBeUndefined();
    expect(order).toEqual(['process-start', 'electron-ready']);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('parses explicit trace flags without enabling normal launches', () => {
    expect(readStartupTraceOptions(['app.exe'])).toEqual({
      enabled: false,
      exitOnComplete: false,
      filePath: null,
    });
    expect(
      readStartupTraceOptions([
        'app.exe',
        '--startup-trace',
        '--startup-trace-exit',
        '--startup-trace-file=C:\\temp\\trace.jsonl',
      ]),
    ).toEqual({
      enabled: true,
      exitOnComplete: true,
      filePath: 'C:\\temp\\trace.jsonl',
    });
  });

  it('accepts renderer milestones only from the attached window', () => {
    const listeners = new Map();
    const ipcMain = {
      on: vi.fn((channel, listener) => listeners.set(channel, listener)),
    };
    const trace = { enabled: true, record: vi.fn() };
    const allowedSender = { id: 1 };
    registerStartupTraceHandler({
      ipcMain,
      trace,
      getAllowedSender: () => allowedSender,
    });

    const listener = listeners.get('startup-trace:milestone');
    listener({ sender: { id: 2 } }, { name: 'first-paint', atUnixMs: 1200 });
    listener(
      { sender: allowedSender },
      { name: 'first-paint', atUnixMs: 1200 },
    );

    expect(trace.record).toHaveBeenCalledOnce();
    expect(trace.record).toHaveBeenCalledWith('first-paint', {
      process: 'renderer',
      atUnixMs: 1200,
    });
  });
});
