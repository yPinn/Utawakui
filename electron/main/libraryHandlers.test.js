import { describe, expect, it, vi } from 'vitest';
import libraryHandlersModule from './libraryHandlers.js';

const { backfillTrackInfoWithLyricsFallback } = libraryHandlersModule;

describe('backfillTrackInfoWithLyricsFallback', () => {
  it('keeps a successful metadata backfill when optional lyrics fail', async () => {
    const metadata = { title: 'Song', artist: 'Artist', assetsUpdated: false };
    const lyricsAcquisitionService = {
      saveIfAbsent: vi.fn().mockRejectedValue(new Error('gate closed')),
    };

    await expect(
      backfillTrackInfoWithLyricsFallback('video-id', 'track-dir', {
        runner: {},
        backfillTrackInfo: vi.fn().mockResolvedValue(metadata),
        lyricsAcquisitionService,
      }),
    ).resolves.toEqual(metadata);
  });

  it('marks assets updated when optional lyrics are stored', async () => {
    const lyricsAcquisitionService = {
      saveIfAbsent: vi.fn().mockResolvedValue(true),
    };
    await expect(
      backfillTrackInfoWithLyricsFallback('video-id', 'track-dir', {
        backfillTrackInfo: vi
          .fn()
          .mockResolvedValue({ title: 'Song', assetsUpdated: false }),
        lyricsAcquisitionService,
      }),
    ).resolves.toMatchObject({ title: 'Song', assetsUpdated: true });
  });
});
