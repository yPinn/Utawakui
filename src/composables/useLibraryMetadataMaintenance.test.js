import { describe, expect, it, vi } from 'vitest';
import { useLibraryMetadataMaintenance } from './useLibraryMetadataMaintenance.js';

describe('useLibraryMetadataMaintenance', () => {
  it('reports normalized, enriched, and skipped track counts', async () => {
    const refreshMetadata = vi.fn().mockResolvedValue({
      updated: 3,
      normalized: 2,
      enriched: 2,
      skipped: 1,
    });
    const maintenance = useLibraryMetadataMaintenance({
      refreshMetadata,
      recordError: vi.fn(),
    });

    await maintenance.run();

    expect(refreshMetadata).toHaveBeenCalledOnce();
    expect(maintenance.state).toMatchObject({
      isRunning: false,
      result: {
        updated: 3,
        normalized: 2,
        enriched: 2,
        skipped: 1,
      },
      error: null,
    });
    expect(maintenance.message.value).toBe(
      '已整理 3 首曲目（名稱或歌手 2 首、其他資訊 2 首）；略過 1 首手動或不確定內容',
    );
  });

  it('keeps the running state stable until the library operation settles', async () => {
    let resolveRefresh;
    const refreshMetadata = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const maintenance = useLibraryMetadataMaintenance({
      refreshMetadata,
      recordError: vi.fn(),
    });

    const pending = maintenance.run();
    expect(maintenance.state.isRunning).toBe(true);
    await expect(maintenance.run()).resolves.toBeNull();
    expect(refreshMetadata).toHaveBeenCalledOnce();

    resolveRefresh({ updated: 0, normalized: 0, enriched: 0, skipped: 0 });
    await pending;

    expect(maintenance.state.isRunning).toBe(false);
    expect(maintenance.message.value).toBe('沒有需要整理的資訊');
  });

  it('bounds malformed summaries and reports skipped-only results', async () => {
    const refreshMetadata = vi
      .fn()
      .mockResolvedValueOnce({ updated: -1, normalized: '2' })
      .mockResolvedValueOnce({ skipped: 2 });
    const maintenance = useLibraryMetadataMaintenance({
      refreshMetadata,
      recordError: vi.fn(),
    });

    await maintenance.run();
    expect(maintenance.state.result).toEqual({
      updated: 0,
      normalized: 0,
      enriched: 0,
      skipped: 0,
    });

    await maintenance.run();
    expect(maintenance.message.value).toBe(
      '沒有自動變更；略過 2 首手動或不確定內容',
    );
  });

  it('exposes only bounded diagnostic copy when maintenance fails', async () => {
    const errorNotice = {
      title: '曲目資訊整理未完成',
      message: '目前無法整理曲目資訊，請再試一次。',
    };
    const recordError = vi.fn().mockReturnValue(errorNotice);
    const maintenance = useLibraryMetadataMaintenance({
      refreshMetadata: vi.fn().mockRejectedValue(new Error('EACCES C:\\Music')),
      recordError,
    });

    await maintenance.run();

    expect(maintenance.state.error).toEqual(errorNotice);
    expect(maintenance.message.value).toBe('');
    expect(recordError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        code: 'LIBRARY_METADATA_REFRESH_FAILED',
        operation: 'refresh-library-metadata',
      }),
    );
  });
});
