import { describe, expect, it, vi } from 'vitest';
import { buildFeatureConfirmation, FEATURE_IDS } from '../lib/featureGates.js';
import libraryHandlersModule from './libraryHandlers.js';

const { backfillTrackInfoWithLyricsFallback, registerLibraryHandlers } =
  libraryHandlersModule;

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

describe('library metadata maintenance handlers', () => {
  it('refreshes renderers without allowing the follow-up list to start provider backfill', async () => {
    const handlers = new Map();
    const ipcMain = {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    };
    const config = {
      featureConfirmations: {
        [FEATURE_IDS.PROVIDER_FLOW]: buildFeatureConfirmation(
          FEATURE_IDS.PROVIDER_FLOW,
        ),
      },
    };
    const listLibraryTracks = vi.fn().mockReturnValue([]);
    const runLibraryBackfill = vi.fn().mockResolvedValue(0);
    const organizeLibraryMetadata = vi.fn().mockReturnValue({
      updated: 1,
      normalized: 1,
      enriched: 0,
      skipped: 0,
    });
    const notifyLibraryUpdated = vi.fn();

    registerLibraryHandlers({
      ipcMain,
      dialog: {},
      getConfig: () => config,
      resolveDownloadDir: () => 'library-dir',
      getMainWindow: vi.fn(),
      notifyLibraryUpdated,
      sendBackfillStatus: vi.fn(),
      featureIds: FEATURE_IDS,
      getProviderRunner: vi.fn(),
      lyricsAcquisitionService: { saveIfAbsent: vi.fn() },
      listLibraryTracks,
      runLibraryBackfill,
      organizeLibraryMetadata,
    });

    await handlers.get('library:refresh-metadata')();
    expect(notifyLibraryUpdated).toHaveBeenCalledWith({
      allowProviderBackfill: false,
    });

    await handlers.get('library:list')(null, {
      allowProviderBackfill: false,
    });
    expect(listLibraryTracks).toHaveBeenCalledWith('library-dir');
    expect(runLibraryBackfill).not.toHaveBeenCalled();
  });
});
