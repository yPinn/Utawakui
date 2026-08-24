import { describe, expect, it, vi } from 'vitest';
import { createStructureAnalysisBatchService } from './structureAnalysisBatchService.js';

function current(level = 'M1') {
  return { signals: { level, reason: 'current' } };
}

function missing() {
  return { signals: { level: 'M0', reason: 'missing' } };
}

function createHarness(overrides = {}) {
  const analysisService = {
    run: vi.fn(async ({ trackId, onProgress }) => {
      onProgress?.({
        jobId: `job-${trackId}`,
        trackId,
        stage: 'analyzing',
        percent: 50,
      });
      if (trackId === 'broken') throw new Error('private path failed');
      return { trackId, signals: { level: 'M1', reason: 'current' } };
    }),
    getActiveJob: vi.fn(() => null),
    cancelActiveJob: vi.fn(async () => true),
  };
  const inspectTrack = vi.fn(async (trackId) =>
    trackId === 'current' ? current() : missing(),
  );
  const onTrackComplete = vi.fn();
  const service = createStructureAnalysisBatchService({
    analysisService,
    inspectTrack,
    onTrackComplete,
    createBatchId: () => 'batch-1',
    ...overrides,
  });
  return { service, analysisService, inspectTrack, onTrackComplete };
}

async function waitForTerminal(service) {
  await vi.waitFor(() =>
    expect(service.getStatus().batch?.status).toMatch(/completed|cancelled/),
  );
  return service.getStatus().batch;
}

describe('structure-analysis batch service', () => {
  it('skips current sidecars, continues after failure, and exposes bounded totals', async () => {
    const harness = createHarness();
    const updates = [];

    expect(
      harness.service.start({
        trackIds: ['current', 'fresh', 'broken', 'fresh'],
        force: false,
        onUpdate: (status) => updates.push(status),
      }),
    ).toMatchObject({
      batch: { batchId: 'batch-1', status: 'running', total: 3 },
    });

    const batch = await waitForTerminal(harness.service);
    expect(batch).toMatchObject({
      status: 'completed',
      total: 3,
      completed: 3,
      succeeded: 1,
      failed: 1,
      skipped: 1,
      cancelled: 0,
      activeTrackId: null,
      percent: 100,
    });
    expect(batch.items).toEqual([
      { trackId: 'current', status: 'skipped' },
      { trackId: 'fresh', status: 'completed', percent: 100 },
      { trackId: 'broken', status: 'failed', reason: 'analysis-failed' },
    ]);
    expect(harness.analysisService.run).toHaveBeenCalledTimes(2);
    expect(harness.onTrackComplete).toHaveBeenCalledWith('fresh');
    expect(updates.at(-1)).toEqual({ batch });
    expect(JSON.stringify(batch)).not.toContain('private path');
  });

  it('force-analyzes a current M1 or M2 sidecar', async () => {
    const harness = createHarness({
      inspectTrack: vi.fn(async (trackId) =>
        current(trackId === 'm2' ? 'M2' : 'M1'),
      ),
    });

    harness.service.start({ trackIds: ['current', 'm2'], force: true });
    const batch = await waitForTerminal(harness.service);

    expect(batch.succeeded).toBe(2);
    expect(batch.skipped).toBe(0);
    expect(harness.analysisService.run).toHaveBeenCalledTimes(2);
  });

  it('cancels the active analysis and marks the remaining queue cancelled', async () => {
    let rejectCurrent;
    let activeJob = null;
    const analysisService = {
      run: vi.fn(({ trackId }) => {
        activeJob = { jobId: 'job-first', trackId };
        return new Promise((_resolve, reject) => {
          rejectCurrent = reject;
        });
      }),
      getActiveJob: vi.fn(() => activeJob),
      cancelActiveJob: vi.fn(async () => {
        rejectCurrent(new Error('audio-processing job cancelled'));
        return true;
      }),
    };
    const harness = createHarness({ analysisService });

    harness.service.start({ trackIds: ['first', 'second'] });
    await vi.waitFor(() =>
      expect(harness.service.getStatus().batch?.activeTrackId).toBe('first'),
    );
    await expect(harness.service.cancel()).resolves.toBe(true);
    const batch = await waitForTerminal(harness.service);

    expect(batch).toMatchObject({
      status: 'cancelled',
      completed: 2,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      cancelled: 2,
    });
    expect(batch.items.map(({ status }) => status)).toEqual([
      'cancelled',
      'cancelled',
    ]);
    expect(analysisService.cancelActiveJob).toHaveBeenCalledOnce();
    expect(analysisService.run).toHaveBeenCalledOnce();
  });

  it('cancels safely while the current track sidecar is still being checked', async () => {
    let finishInspection;
    const inspectTrack = vi.fn(
      () =>
        new Promise((resolve) => {
          finishInspection = resolve;
        }),
    );
    const harness = createHarness({ inspectTrack });

    harness.service.start({ trackIds: ['first', 'second'] });
    await vi.waitFor(() =>
      expect(harness.service.getStatus().batch?.activeTrackId).toBe('first'),
    );
    await expect(harness.service.cancel()).resolves.toBe(true);
    finishInspection(missing());
    const batch = await waitForTerminal(harness.service);

    expect(batch.status).toBe('cancelled');
    expect(batch.items.map(({ status }) => status)).toEqual([
      'cancelled',
      'cancelled',
    ]);
    expect(harness.analysisService.run).not.toHaveBeenCalled();
  });

  it('rejects unbounded input, a second batch, and a pre-existing manual job', async () => {
    let finish;
    const analysisService = {
      run: vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
      getActiveJob: vi.fn(() => null),
      cancelActiveJob: vi.fn(),
    };
    const harness = createHarness({ analysisService });

    expect(() => harness.service.start({ trackIds: [] })).toThrow(/track ids/i);
    expect(() =>
      harness.service.start({
        trackIds: Array.from({ length: 501 }, (_, i) => `t-${i}`),
      }),
    ).toThrow(/track ids/i);
    expect(() => harness.service.start({ trackIds: ['../outside'] })).toThrow(
      /track ids/i,
    );

    harness.service.start({ trackIds: ['first'] });
    expect(() => harness.service.start({ trackIds: ['second'] })).toThrow(
      /already running/i,
    );
    await vi.waitFor(() => expect(analysisService.run).toHaveBeenCalledOnce());
    finish({ trackId: 'first' });
    await waitForTerminal(harness.service);

    analysisService.getActiveJob.mockReturnValue({
      jobId: 'manual',
      trackId: 'manual-track',
    });
    expect(() => harness.service.start({ trackIds: ['second'] })).toThrow(
      /analysis job/i,
    );
  });
});
