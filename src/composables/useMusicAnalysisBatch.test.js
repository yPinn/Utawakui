import { computed } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useMusicAnalysisBatch } from './useMusicAnalysisBatch.js';

function runningBatch() {
  return {
    batch: {
      batchId: 'batch-1',
      status: 'running',
      force: false,
      total: 2,
      completed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
      activeTrackId: 'track-1',
      percent: 25,
      items: [
        {
          trackId: 'track-1',
          status: 'running',
          jobId: 'job-1',
          stage: 'analyzing',
          percent: 50,
        },
        { trackId: 'track-2', status: 'pending' },
      ],
    },
  };
}

function createHarness(trackValues) {
  let listener;
  const unsubscribe = vi.fn();
  const tracks = computed(
    () =>
      trackValues ?? [{ id: 'track-1' }, { id: 'track-2' }, { id: 'track-3' }],
  );
  const bridge = {
    getMusicStructureBatchStatus: vi.fn().mockResolvedValue({ batch: null }),
    startMusicStructureBatch: vi.fn((trackIds, force) => {
      structuredClone({ trackIds, force });
      return Promise.resolve(runningBatch());
    }),
    cancelMusicStructureBatch: vi.fn().mockResolvedValue({ cancelled: true }),
    onMusicStructureBatchProgress: vi.fn((callback) => {
      listener = callback;
      return unsubscribe;
    }),
  };
  const onStatusChange = vi.fn();
  const batch = useMusicAnalysisBatch({ tracks, bridge, onStatusChange });
  return {
    batch,
    bridge,
    emit: (value) => listener?.(value),
    onStatusChange,
    unsubscribe,
  };
}

describe('useMusicAnalysisBatch', () => {
  it('maintains an allowlisted selection and sends a cloneable batch intent', async () => {
    const harness = createHarness();
    harness.batch.toggleTrack('track-1');
    harness.batch.toggleTrack('unknown');
    harness.batch.selectTracks(['track-2', 'track-3', 'unknown']);

    expect(harness.batch.selectedTrackIds.value).toEqual([
      'track-1',
      'track-2',
      'track-3',
    ]);

    await harness.batch.start({ force: true });

    expect(harness.bridge.startMusicStructureBatch).toHaveBeenCalledWith(
      ['track-1', 'track-2', 'track-3'],
      true,
    );
    expect(harness.batch.batch.value?.batchId).toBe('batch-1');
  });

  it('restores main-owned status, projects row states, and handles progress', async () => {
    const harness = createHarness();
    harness.bridge.getMusicStructureBatchStatus.mockResolvedValue(
      runningBatch(),
    );

    await harness.batch.initialize();

    expect(harness.batch.active.value).toBe(true);
    expect(harness.batch.selectedTrackIds.value).toEqual([
      'track-1',
      'track-2',
    ]);
    expect(harness.batch.itemsByTrackId.value['track-1']).toMatchObject({
      status: 'running',
      percent: 50,
    });
    expect(harness.onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ batchId: 'batch-1' }),
    );

    harness.emit({
      batch: {
        ...runningBatch().batch,
        status: 'completed',
        completed: 2,
        succeeded: 1,
        skipped: 1,
        activeTrackId: null,
        percent: 100,
        items: [
          { trackId: 'track-1', status: 'completed', percent: 100 },
          { trackId: 'track-2', status: 'skipped' },
        ],
      },
    });

    expect(harness.batch.active.value).toBe(false);
    expect(harness.batch.summary.value).toBe('完成 1 首，略過 1 首');
    expect(harness.batch.selectedTrackIds.value).toEqual([
      'track-1',
      'track-2',
    ]);
  });

  it('caps renderer selection at the main-process batch limit', () => {
    const tracks = Array.from({ length: 502 }, (_, index) => ({
      id: `track-${index}`,
    }));
    const harness = createHarness(tracks);

    harness.batch.selectTracks(tracks.map(({ id }) => id));

    expect(harness.batch.selectedTrackIds.value).toHaveLength(500);
    expect(harness.batch.error.value).toBe('單次最多選取 500 首曲目。');
  });

  it('sets or clears only the requested allowlisted tracks', () => {
    const harness = createHarness();

    harness.batch.setTracksSelected(['track-1', 'track-2', 'unknown'], true);
    harness.batch.setTracksSelected(['track-2', 'unknown'], false);

    expect(harness.batch.selectedTrackIds.value).toEqual(['track-1']);
  });

  it('cancels through the batch endpoint and cleans up its listener', async () => {
    const harness = createHarness();
    harness.bridge.getMusicStructureBatchStatus.mockResolvedValue(
      runningBatch(),
    );
    await harness.batch.initialize();

    await expect(harness.batch.cancel()).resolves.toBe(true);
    expect(harness.batch.selectedTrackIds.value).toEqual([
      'track-1',
      'track-2',
    ]);
    harness.emit({
      batch: {
        ...runningBatch().batch,
        status: 'cancelled',
        cancelled: 2,
        activeTrackId: null,
        percent: 100,
        items: [
          { trackId: 'track-1', status: 'cancelled' },
          { trackId: 'track-2', status: 'cancelled' },
        ],
      },
    });
    harness.batch.clearSelection();
    expect(harness.batch.selectedTrackIds.value).toEqual([]);

    harness.batch.dispose();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
  });

  it('rejects malformed main snapshots without exposing their payload', async () => {
    const harness = createHarness();
    await harness.batch.initialize();

    harness.emit({
      batch: {
        batchId: 'batch-evil',
        status: 'running',
        total: 99999,
        items: [{ trackId: 'C:\\private', status: 'running' }],
      },
    });

    expect(harness.batch.batch.value).toBeNull();
    expect(harness.batch.error.value).toBe(
      '批次分析狀態無效，請重新啟動後再試。',
    );
  });
});
