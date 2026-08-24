import { describe, expect, it, vi } from 'vitest';
import { useMusicAnalysisBenchmarkReview } from './useMusicAnalysisBenchmarkReview.js';

describe('useMusicAnalysisBenchmarkReview', () => {
  it('loads a review and selects the first case', async () => {
    const review = {
      schemaVersion: 1,
      benchmarkId: 'tuki-15',
      cases: [{ id: 'case-01', trackId: 'track-01' }],
    };
    const bridge = {
      openMusicAnalysisBenchmarkReview: vi.fn(async () => review),
    };
    const workbench = useMusicAnalysisBenchmarkReview(bridge);

    await workbench.open();

    expect(workbench.dataset.value).toEqual(review);
    expect(workbench.selectedCase.value).toEqual(review.cases[0]);
    expect(workbench.loading.value).toBe(false);
    expect(workbench.error.value).toBeNull();
  });

  it('preserves an existing review when the picker is cancelled', async () => {
    const review = {
      schemaVersion: 1,
      benchmarkId: 'tuki-15',
      cases: [{ id: 'case-01', trackId: 'track-01' }],
    };
    const bridge = {
      openMusicAnalysisBenchmarkReview: vi
        .fn()
        .mockResolvedValueOnce(review)
        .mockResolvedValueOnce(null),
    };
    const workbench = useMusicAnalysisBenchmarkReview(bridge);

    await workbench.open();
    await workbench.open();

    expect(workbench.dataset.value).toEqual(review);
    expect(workbench.selectedCase.value?.id).toBe('case-01');
  });

  it('surfaces a recoverable path-free error', async () => {
    const bridge = {
      openMusicAnalysisBenchmarkReview: vi.fn(async () => {
        throw new Error('E:\\private\\predictions.json');
      }),
    };
    const workbench = useMusicAnalysisBenchmarkReview(bridge);

    await workbench.open();

    expect(workbench.error.value).toEqual({
      title: 'Benchmark 結果無法開啟',
      message: '請確認選擇的是有效的 run config，且結果屬於目前曲庫。',
      actionLabel: '重新選擇',
    });
    expect(JSON.stringify(workbench.error.value)).not.toMatch(/private/i);
  });
});
