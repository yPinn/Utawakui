import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import { buildFeatureConfirmation, FEATURE_IDS } from '../lib/featureGates.js';
import libraryHandlersModule from './libraryHandlers.js';

function parseAppError(error) {
  const raw = String(error?.message || '');
  const index = raw.indexOf(APP_ERROR_PREFIX);
  expect(index).toBeGreaterThanOrEqual(0);
  return JSON.parse(raw.slice(index + APP_ERROR_PREFIX.length));
}

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
      requireFeatureGate: vi.fn(),
      openExternal: vi.fn(),
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

  it('does not project an unavailable library as an empty track list', async () => {
    const failure = new Error('library unavailable');
    const listLibraryTracks = vi.fn().mockReturnValue([]);
    const handlers = registerHandlers({
      resolveDownloadDir: () => {
        throw failure;
      },
      listLibraryTracks,
    });

    await expect(handlers.get('library:list')()).rejects.toBe(failure);
    expect(listLibraryTracks).not.toHaveBeenCalled();
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
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const lyricsAcquisitionService = {
      scheduleAutomaticAcquisition: vi.fn(),
      invalidateAutomaticAcquisition: vi.fn(() => calls.push('invalidate')),
    };
    const handlers = registerHandlers({
      recordDiagnostic,
      lyricsAcquisitionService,
      findLibraryTrackRecord: vi.fn().mockReturnValue({ id: 'track-1' }),
      deleteLibraryTrack: vi.fn(() => {
        calls.push('delete');
        throw new Error('index write failed: /Users/someone/library.json');
      }),
    });

    const error = await handlers
      .get('library:delete-track')(null, 'track-1')
      .catch((err) => err);

    const payload = parseAppError(error);
    expect(payload.code).toBe('LIBRARY_DELETE_TRACK_FAILED');
    expect(payload.context.diagnosticRecorded).toBe(true);
    expect(String(payload.message)).not.toMatch(/Users/);
    expect(calls).toEqual(['invalidate', 'delete']);
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'library', operation: 'delete-track' }),
    );
  });

  it('records a metadata refresh failure and rethrows a safe AppError', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const handlers = registerHandlers({
      recordDiagnostic,
      organizeLibraryMetadata: vi.fn(() => {
        throw new Error('corrupt sidecar');
      }),
    });

    const error = await handlers
      .get('library:refresh-metadata')()
      .catch((err) => err);

    const payload = parseAppError(error);
    expect(payload.code).toBe('LIBRARY_REFRESH_METADATA_FAILED');
    expect(payload.context.diagnosticRecorded).toBe(true);
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'library',
        operation: 'refresh-metadata',
      }),
    );
  });

  it('records a local import failure and rethrows a safe AppError', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const handlers = registerHandlers({
      recordDiagnostic,
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ['one.mp3'],
        }),
      },
      importAudioFiles: vi.fn(() => {
        throw new Error('disk full');
      }),
    });

    const error = await handlers
      .get('library:import-audio-files')()
      .catch((err) => err);

    const payload = parseAppError(error);
    expect(payload.code).toBe('LIBRARY_IMPORT_AUDIO_FAILED');
    expect(payload.context.diagnosticRecorded).toBe(true);
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'library',
        operation: 'import-audio-files',
      }),
    );
  });

  it('records an update-track-metadata failure and rethrows a safe AppError', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const handlers = registerHandlers({
      recordDiagnostic,
      updateLibraryTrackMetadata: vi.fn(() => {
        throw new Error('index write failed');
      }),
    });

    const error = await handlers
      .get('library:update-track-metadata')(null, 'track-1', { title: 'x' })
      .catch((err) => err);

    const payload = parseAppError(error);
    expect(payload.code).toBe('LIBRARY_UPDATE_METADATA_FAILED');
    expect(payload.context.diagnosticRecorded).toBe(true);
  });

  it('records a choose-track-artwork write failure and rethrows a safe AppError', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const handlers = registerHandlers({
      recordDiagnostic,
      listLibraryTracks: vi
        .fn()
        .mockReturnValue([{ id: 'track-1', sourceType: 'local-file' }]),
      dialog: {
        showOpenDialog: vi
          .fn()
          .mockResolvedValue({ canceled: false, filePaths: ['cover.jpg'] }),
      },
      writeLibraryTrackArtworkFile: vi.fn(() => {
        throw new Error('disk full');
      }),
    });

    const error = await handlers
      .get('library:choose-track-artwork')(null, 'track-1')
      .catch((err) => err);

    const payload = parseAppError(error);
    expect(payload.code).toBe('LIBRARY_CHOOSE_ARTWORK_FAILED');
    expect(payload.context.diagnosticRecorded).toBe(true);
  });

  it('records a clear-track-artwork failure and rethrows a safe AppError', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const handlers = registerHandlers({
      recordDiagnostic,
      listLibraryTracks: vi
        .fn()
        .mockReturnValue([{ id: 'track-1', sourceType: 'local-file' }]),
      deleteLibraryTrackArtworkFile: vi.fn(() => {
        throw new Error('permission denied');
      }),
    });

    const error = await handlers
      .get('library:clear-track-artwork')(null, 'track-1')
      .catch((err) => err);

    const payload = parseAppError(error);
    expect(payload.code).toBe('LIBRARY_CLEAR_ARTWORK_FAILED');
    expect(payload.context.diagnosticRecorded).toBe(true);
  });

  it('allows a provider-backed managed track to use the local artwork picker', async () => {
    const writeLibraryTrackArtworkFile = vi
      .fn()
      .mockReturnValue('thumbnail.jpg');
    const listLibraryTracks = vi
      .fn()
      .mockReturnValueOnce([{ id: 'track-1', sourceType: 'provider' }])
      .mockReturnValueOnce([
        {
          id: 'track-1',
          sourceType: 'provider',
          thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
        },
      ]);
    const handlers = registerHandlers({
      listLibraryTracks,
      writeLibraryTrackArtworkFile,
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ['cover.jpg'],
        }),
      },
    });

    await expect(
      handlers.get('library:choose-track-artwork')(null, 'track-1'),
    ).resolves.toMatchObject({
      id: 'track-1',
      thumbnailUrl: expect.any(String),
    });
    expect(writeLibraryTrackArtworkFile).toHaveBeenCalledWith(
      'library-dir',
      'track-1',
      'cover.jpg',
    );
  });

  it('rechecks the provider gate and delegates bounded artwork search to the main-owned service', async () => {
    const requireFeatureGate = vi.fn();
    const artworkDiscoveryService = {
      search: vi.fn().mockResolvedValue({ status: 'ok', candidates: [] }),
    };
    const track = { id: 'track-1', title: 'Song', artist: 'Artist' };
    const handlers = registerHandlers({
      requireFeatureGate,
      artworkDiscoveryService,
      listLibraryTracks: vi.fn().mockReturnValue([track]),
    });

    await expect(
      handlers.get('library:search-track-artwork')(null, 'track-1', {
        title: 'Edited query',
        artist: 'Artist',
      }),
    ).resolves.toEqual({ status: 'ok', candidates: [] });
    expect(requireFeatureGate).toHaveBeenCalledWith(FEATURE_IDS.PROVIDER_FLOW);
    expect(artworkDiscoveryService.search).toHaveBeenCalledWith(track, {
      title: 'Edited query',
      artist: 'Artist',
    });
  });

  it('records private provider context while returning only the coarse public reason', async () => {
    const recordDiagnostic = vi.fn(() => ({ ok: true }));
    const createArtworkService = vi.fn(({ onProviderFailure }) => ({
      search: vi.fn(async () => {
        onProviderFailure({
          stage: 'musicbrainz-recording-search',
          reason: 'service-unavailable',
          httpStatus: 503,
          failureCount: 2,
        });
        return { status: 'error', reason: 'provider-unavailable' };
      }),
    }));
    const handlers = registerHandlers({
      artworkDiscoveryService: null,
      createArtworkService,
      recordDiagnostic,
      listLibraryTracks: vi
        .fn()
        .mockReturnValue([{ id: 'track-1', title: 'Song' }]),
    });

    const result = await handlers.get('library:search-track-artwork')(
      null,
      'track-1',
      { title: 'Song' },
    );

    expect(result).toEqual({
      status: 'error',
      reason: 'provider-unavailable',
    });
    expect(JSON.stringify(result)).not.toMatch(
      /musicbrainz|service-unavailable|503/iu,
    );
    expect(recordDiagnostic).toHaveBeenCalledWith({
      process: 'main',
      level: 'warning',
      source: 'artwork',
      operation: 'provider-search',
      code: 'ARTWORK_PROVIDER_UNAVAILABLE',
      message: 'Artwork provider search failed',
      context: {
        stage: 'musicbrainz-recording-search',
        reason: 'service-unavailable',
        httpStatus: 503,
        failureCount: 2,
        retryable: true,
      },
    });
  });

  it('applies only an opaque candidate id, refreshes the library, and opens only the resolved MusicBrainz page', async () => {
    const requireFeatureGate = vi.fn();
    const notifyLibraryUpdated = vi.fn();
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const updated = {
      id: 'track-1',
      thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
    };
    const artworkDiscoveryService = {
      apply: vi.fn().mockResolvedValue({
        status: 'ok',
        filename: 'thumbnail.jpg',
      }),
      sourcePage: vi
        .fn()
        .mockReturnValue(
          'https://musicbrainz.org/release-group/11111111-1111-4111-8111-111111111111',
        ),
    };
    const listLibraryTracks = vi
      .fn()
      .mockReturnValueOnce([{ id: 'track-1', title: 'Song' }])
      .mockReturnValueOnce([updated])
      .mockReturnValueOnce([{ id: 'track-1', title: 'Song' }]);
    const handlers = registerHandlers({
      requireFeatureGate,
      notifyLibraryUpdated,
      openExternal,
      artworkDiscoveryService,
      listLibraryTracks,
    });

    await expect(
      handlers.get('library:apply-track-artwork')(
        null,
        'track-1',
        'candidate-1',
      ),
    ).resolves.toEqual({ status: 'ok', track: updated });
    expect(artworkDiscoveryService.apply).toHaveBeenCalledWith(
      'library-dir',
      'track-1',
      'candidate-1',
    );
    expect(notifyLibraryUpdated).toHaveBeenCalledOnce();

    await expect(
      handlers.get('library:open-track-artwork-source')(
        null,
        'track-1',
        'candidate-1',
      ),
    ).resolves.toBe(true);
    expect(openExternal).toHaveBeenCalledWith(
      'https://musicbrainz.org/release-group/11111111-1111-4111-8111-111111111111',
    );
    expect(requireFeatureGate).toHaveBeenCalledTimes(2);
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
