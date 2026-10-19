import { describe, expect, it } from 'vitest';
import { importBatchProgress } from './importBatch.js';

describe('import batch count progress', () => {
  it('uses a fixed download denominator and separates local, failed, cancelled and finalization', () => {
    const batch = {
      phase: 'finalizing',
      tracks: [
        { downloadRequired: true, status: 'done' },
        { downloadRequired: true, status: 'error' },
        { downloadRequired: true, status: 'cancelled' },
        { downloadRequired: true, status: 'downloading' },
        { downloadRequired: true, status: 'pending' },
        { downloadRequired: false, alreadyDownloaded: true, status: 'pending' },
      ],
    };
    expect(importBatchProgress(batch)).toMatchObject({
      total: 5,
      completed: 1,
      failed: 1,
      cancelled: 1,
      active: 1,
      pending: 1,
      processed: 3,
      phaseLabel: '正在整理清單',
    });
    batch.tracks[1].status = 'pending';
    expect(importBatchProgress(batch)).toMatchObject({
      total: 5,
      processed: 2,
    });
  });
  it('does not invent a download percentage for an already-local collection', () => {
    expect(
      importBatchProgress({
        phase: 'completed',
        tracks: [
          {
            alreadyDownloaded: true,
            downloadRequired: false,
            status: 'pending',
          },
        ],
      }),
    ).toMatchObject({ total: 0, processed: 0, phaseLabel: '已完成' });
  });
});
