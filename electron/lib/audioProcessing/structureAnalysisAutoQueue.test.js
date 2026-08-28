import { describe, expect, it, vi } from 'vitest';
import { createStructureAnalysisAutoQueue } from './structureAnalysisAutoQueue.js';

function createHarness(overrides = {}) {
  const tasks = [];
  const retries = [];
  const config = {
    autoAnalyzeMusicStructure: true,
    featureConfirmations: { 'audio-processing-flow': { enabled: true } },
  };
  const analysisService = {
    getActiveJob: vi.fn(() => null),
    run: vi.fn().mockResolvedValue({ ok: true }),
  };
  const batchService = { hasActiveBatch: vi.fn(() => false) };
  const capabilityService = {
    getStatus: vi.fn(() => ({ status: 'ready', installed: true })),
  };
  const inspectTrack = vi.fn().mockResolvedValue({
    signals: { reason: 'missing', level: null },
  });
  const onTrackComplete = vi.fn();
  const logger = { error: vi.fn() };
  const queue = createStructureAnalysisAutoQueue({
    getConfig: () => config,
    isFeatureEnabled: (value) =>
      value.featureConfirmations['audio-processing-flow']?.enabled === true,
    featureId: 'audio-processing-flow',
    capabilityService,
    analysisService,
    batchService,
    inspectTrack,
    currentProfileIds: ['beat-this-small0-cpu-v3'],
    onTrackComplete,
    logger,
    scheduleTask: (task) => tasks.push(task),
    scheduleRetry: (task) => retries.push(task),
    ...overrides,
  });

  async function runNext(collection = tasks) {
    const task = collection.shift();
    expect(task).toBeTypeOf('function');
    await task();
    expect(queue.getStatus().running).toBe(false);
  }

  return {
    queue,
    config,
    analysisService,
    batchService,
    capabilityService,
    inspectTrack,
    onTrackComplete,
    logger,
    tasks,
    retries,
    runNext,
  };
}

describe('structure-analysis automatic queue', () => {
  it('accepts work only when the preference, gate, and capability are ready', () => {
    const disabledPreference = createHarness();
    disabledPreference.config.autoAnalyzeMusicStructure = false;
    expect(disabledPreference.queue.enqueue('track-1')).toBe(false);

    const disabledGate = createHarness();
    disabledGate.config.featureConfirmations = {};
    expect(disabledGate.queue.enqueue('track-1')).toBe(false);

    const missingCapability = createHarness();
    missingCapability.capabilityService.getStatus.mockReturnValue({
      status: 'missing',
      installed: false,
    });
    expect(missingCapability.queue.enqueue('track-1')).toBe(false);

    expect(disabledPreference.tasks).toHaveLength(0);
    expect(disabledGate.tasks).toHaveLength(0);
    expect(missingCapability.tasks).toHaveLength(0);
  });

  it('deduplicates track ids and analyzes accepted work sequentially', async () => {
    const harness = createHarness();

    expect(harness.queue.enqueue('track-1')).toBe(true);
    expect(harness.queue.enqueue('track-1')).toBe(true);
    expect(harness.queue.enqueue('track-2')).toBe(true);
    expect(harness.tasks).toHaveLength(1);

    await harness.runNext();
    await harness.runNext();

    expect(harness.analysisService.run.mock.calls).toEqual([
      [{ trackId: 'track-1' }],
      [{ trackId: 'track-2' }],
    ]);
    expect(harness.onTrackComplete.mock.calls).toEqual([
      ['track-1'],
      ['track-2'],
    ]);
  });

  it('skips a sidecar that is already current for a supported profile', async () => {
    const harness = createHarness();
    harness.inspectTrack.mockResolvedValue({
      analysisProfileId: 'beat-this-small0-cpu-v3',
      signals: { reason: 'current', level: 'M1' },
    });

    harness.queue.enqueue('track-1');
    await harness.runNext();

    expect(harness.analysisService.run).not.toHaveBeenCalled();
    expect(harness.onTrackComplete).not.toHaveBeenCalled();
  });

  it('waits behind a manual job or batch without losing queued work', async () => {
    const harness = createHarness();
    harness.batchService.hasActiveBatch.mockReturnValue(true);

    harness.queue.enqueue('track-1');
    await harness.runNext();
    expect(harness.retries).toHaveLength(1);
    expect(harness.analysisService.run).not.toHaveBeenCalled();

    harness.batchService.hasActiveBatch.mockReturnValue(false);
    await harness.runNext(harness.retries);
    expect(harness.analysisService.run).toHaveBeenCalledWith({
      trackId: 'track-1',
    });
  });

  it('contains one analysis failure and continues with the next track', async () => {
    const harness = createHarness();
    harness.analysisService.run
      .mockRejectedValueOnce(new Error('private model path failed'))
      .mockResolvedValueOnce({ ok: true });

    harness.queue.enqueue('track-1');
    harness.queue.enqueue('track-2');
    await harness.runNext();
    await harness.runNext();

    expect(harness.onTrackComplete).toHaveBeenCalledOnce();
    expect(harness.onTrackComplete).toHaveBeenCalledWith('track-2');
    expect(harness.logger.error).toHaveBeenCalledWith(
      'Automatic music analysis failed',
      expect.any(Error),
    );
  });

  it('rejects unsafe ids without inspecting filesystem state', () => {
    const harness = createHarness();

    expect(harness.queue.enqueue('../outside')).toBe(false);
    expect(harness.inspectTrack).not.toHaveBeenCalled();
    expect(harness.tasks).toHaveLength(0);
  });
});
