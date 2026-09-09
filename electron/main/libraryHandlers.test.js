import { describe, expect, it, vi } from 'vitest';
import { buildFeatureConfirmation, FEATURE_IDS } from '../lib/featureGates.js';
import libraryHandlersModule from './libraryHandlers.js';

const { backfillTrackInfoWithLyricsFallback, registerLibraryHandlers } =
  libraryHandlersModule;

describe('backfillTrackInfoWithLyricsFallback', () => {
  it('keeps a successful metadata backfill when optional lyrics fail', async () => {
    const metadata = { title: 'Song', artist: 'Artist', assetsUpdated: false };
    const lyricsAcquisitionService = {
      scheduleAutomaticAcquisition: vi.fn(() => {
        throw new Error('gate closed');
      }),
    };

    await expect(
      backfillTrackInfoWithLyricsFallback('video-id', 'track-dir', {
        runner: {},
        backfillTrackInfo: vi.fn().mockResolvedValue(metadata),
        lyricsAcquisitionService,
      }),
    ).resolves.toEqual(metadata);
  });

  it('schedules lyrics without delaying or rewriting the metadata result', async () => {
    const onLyricsSaved = vi.fn();
    const lyricsAcquisitionService = {
      scheduleAutomaticAcquisition: vi.fn(() => new Promise(() => {})),
    };
    await expect(
      backfillTrackInfoWithLyricsFallback('video-id', 'track-dir', {
        backfillTrackInfo: vi
          .fn()
          .mockResolvedValue({ title: 'Song', assetsUpdated: false }),
        lyricsAcquisitionService,
        onLyricsSaved,
      }),
    ).resolves.toEqual({ title: 'Song', assetsUpdated: false });
    expect(
      lyricsAcquisitionService.scheduleAutomaticAcquisition,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'video-id', title: 'Song' }),
      'track-dir',
      { onSaved: onLyricsSaved },
    );
  });
});

describe('library metadata maintenance handlers', () => {
  function registerHandlers(overrides = {}) {
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

    registerLibraryHandlers({
      ipcMain,
      dialog: {},
      getConfig: () => config,
      resolveDownloadDir: () => 'library-dir',
      getMainWindow: vi.fn(),
      notifyLibraryUpdated: vi.fn(),
      sendBackfillStatus: vi.fn(),
      featureIds: FEATURE_IDS,
      getProviderRunner: vi.fn(),
      lyricsAcquisitionService: { scheduleAutomaticAcquisition: vi.fn() },
      listLibraryTracks: vi.fn().mockReturnValue([]),
      runLibraryBackfill: vi.fn().mockResolvedValue(0),
      ...overrides,
    });

    return handlers;
  }

  it('refreshes renderers without allowing the follow-up list to start provider backfill', async () => {
    const listLibraryTracks = vi.fn().mockReturnValue([]);
    const runLibraryBackfill = vi.fn().mockResolvedValue(0);
    const organizeLibraryMetadata = vi.fn().mockReturnValue({
      updated: 1,
      normalized: 1,
      enriched: 0,
      skipped: 0,
    });
    const notifyLibraryUpdated = vi.fn();

    const handlers = registerHandlers({
      notifyLibraryUpdated,
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

  it('records a failed background backfill server-side without pushing the raw error to the renderer', async () => {
    const rawError = new Error('ENOENT: /Users/someone/private/path/yt-dlp');
    const sendBackfillStatus = vi.fn();
    const recordDiagnostic = vi.fn();

    const handlers = registerHandlers({
      sendBackfillStatus,
      runLibraryBackfill: vi.fn().mockRejectedValue(rawError),
      recordDiagnostic,
    });

    await handlers.get('library:list')(null, {});
    // The background promise chain settles on the microtask queue after the
    // handler itself has already returned.
    await new Promise((resolve) => setImmediate(resolve));

    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'library', error: rawError }),
    );
    expect(sendBackfillStatus).toHaveBeenCalledWith({
      stage: 'error',
      isRunning: false,
    });
    const [pushedStatus] = sendBackfillStatus.mock.calls[0];
    expect(JSON.stringify(pushedStatus)).not.toContain('/Users/');
  });

  it('invalidates automatic lyrics work after validating and before deleting the track directory', async () => {
    const calls = [];
    const lyricsAcquisitionService = {
      scheduleAutomaticAcquisition: vi.fn(),
      invalidateAutomaticAcquisition: vi.fn(() => calls.push('invalidate')),
    };
    const deleteLibraryTrack = vi.fn(() => {
      calls.push('delete');
      return true;
    });
    const notifyLibraryUpdated = vi.fn();
    const handlers = registerHandlers({
      lyricsAcquisitionService,
      findLibraryTrackRecord: vi.fn().mockReturnValue({ id: 'track-1' }),
      deleteLibraryTrack,
      notifyLibraryUpdated,
    });

    await expect(
      handlers.get('library:delete-track')(null, 'track-1'),
    ).resolves.toBe(true);

    expect(calls).toEqual(['invalidate', 'delete']);
    expect(
      lyricsAcquisitionService.invalidateAutomaticAcquisition,
    ).toHaveBeenCalledWith('track-1');
    expect(notifyLibraryUpdated).toHaveBeenCalledOnce();
  });

  it('does not allocate lyrics generations for missing track ids', async () => {
    const lyricsAcquisitionService = {
      scheduleAutomaticAcquisition: vi.fn(),
      invalidateAutomaticAcquisition: vi.fn(),
    };
    const deleteLibraryTrack = vi.fn();
    const handlers = registerHandlers({
      lyricsAcquisitionService,
      findLibraryTrackRecord: vi.fn().mockReturnValue(null),
      deleteLibraryTrack,
    });

    await expect(
      handlers.get('library:delete-track')(null, 'missing-track'),
    ).resolves.toBe(false);
    expect(
      lyricsAcquisitionService.invalidateAutomaticAcquisition,
    ).not.toHaveBeenCalled();
    expect(deleteLibraryTrack).not.toHaveBeenCalled();
  });

  it('invalidates automatic lyrics work before a partial deletion can throw', async () => {
    const calls = [];
    const lyricsAcquisitionService = {
      scheduleAutomaticAcquisition: vi.fn(),
      invalidateAutomaticAcquisition: vi.fn(() => calls.push('invalidate')),
    };
    const handlers = registerHandlers({
      lyricsAcquisitionService,
      findLibraryTrackRecord: vi.fn().mockReturnValue({ id: 'track-1' }),
      deleteLibraryTrack: vi.fn(() => {
        calls.push('delete');
        throw new Error('index write failed');
      }),
    });

    await expect(
      handlers.get('library:delete-track')(null, 'track-1'),
    ).rejects.toThrow(/index write failed/i);
    expect(calls).toEqual(['invalidate', 'delete']);
  });
});

describe('local import automatic music analysis', () => {
  function registerLocalImport(overrides = {}) {
    const handlers = new Map();
    const ipcMain = {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    };
    const enqueueMusicAnalysis = vi.fn(() => true);
    const importAudioFiles = vi.fn().mockReturnValue({
      imported: [
        { id: 'local-1', title: 'One' },
        { id: 'local-2', title: 'Two' },
      ],
      skipped: [],
    });
    registerLibraryHandlers({
      ipcMain,
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ['one.mp3', 'two.mp3'],
        }),
      },
      getConfig: () => ({}),
      resolveDownloadDir: () => 'library-dir',
      getMainWindow: vi.fn(),
      notifyLibraryUpdated: vi.fn(),
      sendBackfillStatus: vi.fn(),
      featureIds: FEATURE_IDS,
      getProviderRunner: vi.fn(),
      lyricsAcquisitionService: { scheduleAutomaticAcquisition: vi.fn() },
      enqueueMusicAnalysis,
      importAudioFiles,
      ...overrides,
    });
    return { handlers, enqueueMusicAnalysis, importAudioFiles };
  }

  it('enqueues every successfully imported local track', async () => {
    const harness = registerLocalImport();

    await expect(
      harness.handlers.get('library:import-audio-files')(),
    ).resolves.toMatchObject({
      imported: [{ id: 'local-1' }, { id: 'local-2' }],
    });
    expect(harness.enqueueMusicAnalysis.mock.calls).toEqual([
      ['local-1'],
      ['local-2'],
    ]);
  });

  it('keeps the import result when optional enqueueing throws', async () => {
    const harness = registerLocalImport({
      enqueueMusicAnalysis: vi.fn(() => {
        throw new Error('private queue failure');
      }),
    });

    await expect(
      harness.handlers.get('library:import-audio-files')(),
    ).resolves.toMatchObject({
      imported: [{ id: 'local-1' }, { id: 'local-2' }],
    });
  });
});
