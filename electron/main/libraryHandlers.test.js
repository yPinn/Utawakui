import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import { buildFeatureConfirmation, FEATURE_IDS } from '../lib/featureGates.js';
import { AUDIO_PICKER_EXTENSIONS } from '../lib/library/constants.js';
import libraryHandlersModule from './libraryHandlers.js';
import { createLibraryTrackSnapshot } from './libraryTrackSnapshot.js';

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
      organizeLibraryMetadata: vi.fn().mockReturnValue({
        updated: 0,
        normalized: 0,
        enriched: 0,
        skipped: 0,
      }),
      captureLibraryTrackArtworkSnapshot: vi.fn().mockReturnValue([]),
      restoreLibraryTrackArtworkSnapshot: vi.fn().mockReturnValue(true),
      // Single-track lookups follow each test's listLibraryTracks sequence.
      findLibraryTrack: (dir, trackId) =>
        (overrides.listLibraryTracks?.(dir) ?? []).find(
          (track) => track.id === trackId,
        ) ?? null,
      ...overrides,
    });

    return handlers;
  }

  it('automatically organizes saved metadata once before exposing a library directory', async () => {
    let tracks = [{ id: 'track-1', artist: 'Old Artist' }];
    const listLibraryTracks = vi.fn(() => tracks);
    const organizeLibraryMetadata = vi.fn(() => {
      tracks = [{ id: 'track-1', artist: 'Canonical Artist' }];
      return { updated: 1, normalized: 1, enriched: 0, skipped: 0 };
    });
    const handlers = registerHandlers({
      listLibraryTracks,
      organizeLibraryMetadata,
    });

    await expect(handlers.get('library:list')()).resolves.toEqual(tracks);
    await expect(handlers.get('library:list')()).resolves.toEqual(tracks);

    expect(organizeLibraryMetadata).toHaveBeenCalledOnce();
    expect(organizeLibraryMetadata).toHaveBeenCalledWith(
      'library-dir',
      expect.any(Function),
    );
    expect(listLibraryTracks).toHaveBeenCalledTimes(2);
  });

  it('keeps the library readable when automatic metadata organization fails', async () => {
    const recordDiagnostic = vi.fn();
    const tracks = [{ id: 'track-1', title: 'Playable track' }];
    const organizeLibraryMetadata = vi.fn(() => {
      throw new Error('index write failed: C:\\Private\\library.json');
    });
    const handlers = registerHandlers({
      listLibraryTracks: vi.fn().mockReturnValue(tracks),
      organizeLibraryMetadata,
      recordDiagnostic,
    });

    await expect(handlers.get('library:list')()).resolves.toEqual(tracks);
    await expect(handlers.get('library:list')()).resolves.toEqual(tracks);
    expect(organizeLibraryMetadata).toHaveBeenCalledOnce();
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        process: 'main',
        level: 'error',
        source: 'library',
        operation: 'automatic-metadata-organization',
        code: 'LIBRARY_METADATA_AUTO_ORGANIZATION_FAILED',
      }),
    );
    expect(recordDiagnostic).toHaveBeenCalledOnce();
  });

  it('honors a library refresh that explicitly disables provider backfill', async () => {
    const listLibraryTracks = vi.fn().mockReturnValue([]);
    const runLibraryBackfill = vi.fn().mockResolvedValue(0);

    const handlers = registerHandlers({
      listLibraryTracks,
      runLibraryBackfill,
    });

    await handlers.get('library:list')(null, {
      allowProviderBackfill: false,
    });
    expect(listLibraryTracks).toHaveBeenCalledWith('library-dir');
    expect(runLibraryBackfill).not.toHaveBeenCalled();
  });

  it('derives the artist index from the current library without backfill', async () => {
    const tracks = [{ id: 'a', artist: 'Aimer' }];
    const listLibraryTracks = vi.fn().mockReturnValue(tracks);
    const runLibraryBackfill = vi.fn().mockResolvedValue(0);
    const index = { artists: [], trackArtistIds: {} };
    const artistIndexCache = { getIndex: vi.fn().mockResolvedValue(index) };
    const handlers = registerHandlers({
      listLibraryTracks,
      runLibraryBackfill,
      artistIndexCache,
    });

    await expect(handlers.get('library:get-artist-index')()).resolves.toBe(
      index,
    );
    expect(artistIndexCache.getIndex).toHaveBeenCalledWith(
      'library-dir',
      tracks,
    );
    expect(runLibraryBackfill).not.toHaveBeenCalled();
  });

  it('reuses the library:list scan for the artist index until the library changes', async () => {
    const tracks = [{ id: 'a', artist: 'Aimer' }];
    const listLibraryTracks = vi.fn().mockReturnValue(tracks);
    const trackSnapshot = createLibraryTrackSnapshot({ listLibraryTracks });
    const artistIndexCache = { getIndex: vi.fn().mockResolvedValue({}) };
    const handlers = registerHandlers({
      listLibraryTracks,
      trackSnapshot,
      artistIndexCache,
    });

    await handlers.get('library:list')(null, { allowProviderBackfill: false });
    await handlers.get('library:get-artist-index')();
    expect(listLibraryTracks).toHaveBeenCalledOnce();
    expect(artistIndexCache.getIndex).toHaveBeenCalledWith(
      'library-dir',
      tracks,
    );

    trackSnapshot.invalidate();
    await handlers.get('library:get-artist-index')();
    expect(listLibraryTracks).toHaveBeenCalledTimes(2);
  });

  it('keeps artist organization mutations id-only, revisioned, and main-derived', async () => {
    const tracks = [
      { id: 'a', artist: 'JJ Lin' },
      { id: 'b', artist: '林俊傑' },
    ];
    const stableId = 'artist-123e4567-e89b-42d3-a456-426614174000';
    const artistIndexCache = {
      getIndex: vi.fn(),
      mergeArtists: vi.fn().mockResolvedValue({
        status: 'ok',
        changed: true,
        artistId: stableId,
        revision: 1,
      }),
      splitArtistCredit: vi.fn().mockResolvedValue({
        status: 'ok',
        changed: true,
        artistId: stableId,
        revision: 2,
      }),
      setDisplayName: vi.fn().mockResolvedValue({
        status: 'ok',
        changed: true,
        artistId: stableId,
        revision: 3,
      }),
      undoOrganization: vi.fn().mockResolvedValue({
        status: 'ok',
        changed: true,
        revision: 4,
      }),
    };
    const notifyLibraryUpdated = vi.fn();
    const handlers = registerHandlers({
      artistIndexCache,
      notifyLibraryUpdated,
      listLibraryTracks: vi.fn().mockReturnValue(tracks),
    });

    await expect(
      handlers.get('library:merge-artists')(null, {
        artistIds: ['artist-68d52f69a4a24a1a', 'artist-882cd3bcbb49699f'],
        expectedRevision: 0,
        privatePath: 'E:\\private',
      }),
    ).resolves.toMatchObject({ status: 'ok', artistId: stableId });
    expect(artistIndexCache.mergeArtists).toHaveBeenCalledWith(
      'library-dir',
      tracks,
      ['artist-68d52f69a4a24a1a', 'artist-882cd3bcbb49699f'],
      { expectedRevision: 0 },
    );

    await handlers.get('library:split-artist-credit')(null, {
      artistId: stableId,
      creditId: 'credit-68d52f69a4a24a1a',
      expectedRevision: 1,
      rawCredit: 'ignored',
    });
    expect(artistIndexCache.splitArtistCredit).toHaveBeenCalledWith(
      'library-dir',
      tracks,
      stableId,
      'credit-68d52f69a4a24a1a',
      { expectedRevision: 1 },
    );

    await handlers.get('library:set-artist-display-name')(null, {
      artistId: stableId,
      displayName: '林俊傑',
      expectedRevision: 2,
      mbid: 'ignored',
    });
    expect(artistIndexCache.setDisplayName).toHaveBeenCalledWith(
      'library-dir',
      tracks,
      stableId,
      '林俊傑',
      { expectedRevision: 2 },
    );

    await handlers.get('library:undo-artist-organization')(null, {
      expectedRevision: 3,
      privateState: {},
    });
    expect(artistIndexCache.undoOrganization).toHaveBeenCalledWith(
      'library-dir',
      { expectedRevision: 3 },
    );
    expect(notifyLibraryUpdated).toHaveBeenCalledTimes(4);
    expect(notifyLibraryUpdated).toHaveBeenLastCalledWith({
      allowProviderBackfill: false,
    });
  });

  it('rejects malformed artist organization intents before the store boundary', async () => {
    const artistIndexCache = {
      mergeArtists: vi.fn(),
      splitArtistCredit: vi.fn(),
      setDisplayName: vi.fn(),
      undoOrganization: vi.fn(),
    };
    const handlers = registerHandlers({ artistIndexCache });

    await expect(
      handlers.get('library:merge-artists')(null, {
        artistIds: ['../escape', 'artist-0123456789abcdef'],
        expectedRevision: 0,
      }),
    ).resolves.toEqual({ status: 'error', reason: 'invalid-intent' });
    await expect(
      handlers.get('library:set-artist-display-name')(null, {
        artistId: 'artist-0123456789abcdef',
        displayName: 'x'.repeat(201),
        expectedRevision: 0,
      }),
    ).resolves.toEqual({ status: 'error', reason: 'invalid-intent' });
    expect(artistIndexCache.mergeArtists).not.toHaveBeenCalled();
    expect(artistIndexCache.setDisplayName).not.toHaveBeenCalled();
  });

  it('keeps MusicBrainz artist lookup explicit, gated, and opaque across IPC', async () => {
    const tracks = [{ id: 'a', title: 'Always Online', artist: 'JJ Lin' }];
    const candidateId = 'candidate_0123456789abcdef012345';
    const artistIdentityService = {
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        artistId: 'artist-68d52f69a4a24a1a',
        candidates: [{ candidateId, name: '林俊傑', aliases: ['JJ Lin'] }],
      }),
      apply: vi.fn().mockResolvedValue({
        status: 'ok',
        changed: true,
        artistId: 'artist-123e4567-e89b-42d3-a456-426614174000',
        revision: 1,
      }),
      cancel: vi.fn(),
    };
    const notifyLibraryUpdated = vi.fn();
    const handlers = registerHandlers({
      artistIdentityService,
      listLibraryTracks: vi.fn().mockReturnValue(tracks),
      notifyLibraryUpdated,
    });

    await expect(
      handlers.get('library:search-artist-identity-candidates')(
        null,
        'artist-68d52f69a4a24a1a',
      ),
    ).resolves.toMatchObject({
      status: 'ok',
      candidates: [{ candidateId, name: '林俊傑' }],
    });
    expect(artistIdentityService.search).toHaveBeenCalledWith(
      'library-dir',
      tracks,
      'artist-68d52f69a4a24a1a',
    );

    await handlers.get('library:apply-artist-identity-candidate')(null, {
      artistId: 'artist-68d52f69a4a24a1a',
      candidateId,
      expectedRevision: 0,
      mbid: 'must-not-cross-ipc',
      sourceUrl: 'https://musicbrainz.org/artist/private',
    });
    expect(artistIdentityService.apply).toHaveBeenCalledWith(
      'library-dir',
      tracks,
      'artist-68d52f69a4a24a1a',
      candidateId,
      0,
    );
    expect(notifyLibraryUpdated).toHaveBeenCalledWith({
      allowProviderBackfill: false,
    });
  });

  it('does not call MusicBrainz artist lookup while provider-flow is closed', async () => {
    const artistIdentityService = {
      search: vi.fn(),
      apply: vi.fn(),
      cancel: vi.fn(),
    };
    const handlers = registerHandlers({
      artistIdentityService,
      getConfig: () => ({}),
    });

    await expect(
      handlers.get('library:search-artist-identity-candidates')(
        null,
        'artist-68d52f69a4a24a1a',
      ),
    ).resolves.toEqual({ status: 'disabled' });
    expect(artistIdentityService.search).not.toHaveBeenCalled();
  });

  it('starts automatic artist identity reconciliation without renderer-derived inputs', async () => {
    const tracks = [{ id: 'a', title: 'Always Online', artist: 'JJ Lin' }];
    const notifyLibraryUpdated = vi.fn();
    const artistIdentityService = {
      reconcile: vi.fn(async (directory, currentTracks, options) => {
        await options.onApplied({ status: 'ok', changed: true });
        return { status: 'ok', attempted: 1, changed: 1 };
      }),
      search: vi.fn(),
      apply: vi.fn(),
      cancel: vi.fn(),
    };
    const handlers = registerHandlers({
      artistIdentityService,
      listLibraryTracks: vi.fn().mockReturnValue(tracks),
      notifyLibraryUpdated,
    });

    await expect(
      handlers.get('library:auto-resolve-artist-identities')(null, {
        directory: 'E:\\private',
        artistIds: ['ignored'],
      }),
    ).resolves.toEqual({ status: 'started' });
    await vi.waitFor(() =>
      expect(artistIdentityService.reconcile).toHaveBeenCalledWith(
        'library-dir',
        tracks,
        expect.objectContaining({ onApplied: expect.any(Function) }),
      ),
    );
    await vi.waitFor(() =>
      expect(notifyLibraryUpdated).toHaveBeenCalledWith({
        allowProviderBackfill: false,
      }),
    );
  });

  it('does not start automatic artist identity reconciliation while provider-flow is closed', async () => {
    const artistIdentityService = {
      reconcile: vi.fn(),
      search: vi.fn(),
      apply: vi.fn(),
      cancel: vi.fn(),
    };
    const handlers = registerHandlers({
      artistIdentityService,
      getConfig: () => ({}),
    });

    await expect(
      handlers.get('library:auto-resolve-artist-identities')(),
    ).resolves.toEqual({ status: 'disabled' });
    expect(artistIdentityService.reconcile).not.toHaveBeenCalled();
  });

  it('resolves artist photos only for valid ids behind the provider gate', async () => {
    const tracks = [{ id: 'a', artist: 'Ado' }];
    const artistPhotoService = {
      resolveFromChannel: vi
        .fn()
        .mockResolvedValue({ status: 'ok', changed: true }),
    };
    const getProviderRunner = vi.fn();
    const handlers = registerHandlers({
      listLibraryTracks: vi.fn().mockReturnValue(tracks),
      artistPhotoService,
      getProviderRunner,
    });
    const resolve = handlers.get('library:resolve-artist-photo');

    await expect(resolve(null, '../escape')).resolves.toEqual({
      status: 'error',
      reason: 'invalid-artist',
    });
    await expect(resolve(null, 'artist-0123456789abcdef')).resolves.toEqual({
      status: 'ok',
      changed: true,
    });
    expect(artistPhotoService.resolveFromChannel).toHaveBeenCalledWith(
      'library-dir',
      tracks,
      'artist-0123456789abcdef',
      { getRunner: getProviderRunner },
    );

    const closed = registerHandlers({
      artistPhotoService,
      getConfig: () => ({}),
    });
    await expect(
      closed.get('library:resolve-artist-photo')(
        null,
        'artist-0123456789abcdef',
      ),
    ).resolves.toEqual({ status: 'disabled' });
    expect(artistPhotoService.resolveFromChannel).toHaveBeenCalledTimes(1);
  });

  it('records an unexpected photo failure server-side with a bounded result', async () => {
    const recordDiagnostic = vi.fn();
    const handlers = registerHandlers({
      recordDiagnostic,
      artistPhotoService: {
        resolveFromChannel: vi
          .fn()
          .mockRejectedValue(new Error('EACCES /private/library')),
      },
    });
    await expect(
      handlers.get('library:resolve-artist-photo')(
        null,
        'artist-0123456789abcdef',
      ),
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'provider-unavailable',
    });
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'artist-photo',
        code: 'ARTIST_PHOTO_RESOLVE_FAILED',
      }),
    );
  });

  it('keeps YT Music candidate intents gated, id-only, and main-derived', async () => {
    const tracks = [{ id: 'a', artist: 'Ado' }];
    const artistPhotoCandidateService = {
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        candidates: [{ candidateId: 'candidate_abcdefghijklmn', name: 'Ado' }],
      }),
      cancel: vi.fn().mockReturnValue({ status: 'ok' }),
      loadPreview: vi.fn().mockResolvedValue({
        status: 'ok',
        candidateId: 'candidate_abcdefghijklmn',
        image: { mimeType: 'image/png', buffer: Buffer.from('preview') },
      }),
      apply: vi.fn().mockResolvedValue({ status: 'ok', changed: true }),
    };
    const notifyLibraryUpdated = vi.fn();
    const handlers = registerHandlers({
      listLibraryTracks: vi.fn().mockReturnValue(tracks),
      artistPhotoCandidateService,
      notifyLibraryUpdated,
    });
    const artistId = 'artist-0123456789abcdef';
    const candidateId = 'candidate_abcdefghijklmn';

    await expect(
      handlers.get('library:search-artist-photo-candidates')(null, artistId),
    ).resolves.toMatchObject({ status: 'ok' });
    expect(artistPhotoCandidateService.search).toHaveBeenCalledWith(
      'library-dir',
      expect.any(Function),
      artistId,
    );
    expect(artistPhotoCandidateService.search.mock.calls[0][1]()).toBe(tracks);
    await expect(
      handlers.get('library:cancel-artist-photo-candidates')(null, artistId),
    ).resolves.toEqual({ status: 'ok' });
    expect(artistPhotoCandidateService.cancel).toHaveBeenCalledWith(
      artistId,
      'library-dir',
    );
    await expect(
      handlers.get('library:load-artist-photo-candidate-preview')(
        null,
        artistId,
        candidateId,
      ),
    ).resolves.toMatchObject({ status: 'ok' });
    expect(artistPhotoCandidateService.loadPreview).toHaveBeenCalledWith(
      'library-dir',
      artistId,
      candidateId,
    );
    await expect(
      handlers.get('library:apply-artist-photo-candidate')(
        null,
        artistId,
        candidateId,
      ),
    ).resolves.toEqual({ status: 'ok', changed: true });
    expect(artistPhotoCandidateService.apply).toHaveBeenCalledWith(
      'library-dir',
      expect.any(Function),
      artistId,
      candidateId,
    );
    expect(artistPhotoCandidateService.apply.mock.calls[0][1]()).toBe(tracks);
    expect(notifyLibraryUpdated).toHaveBeenCalledWith({
      allowProviderBackfill: false,
    });

    for (const channel of [
      'library:search-artist-photo-candidates',
      'library:cancel-artist-photo-candidates',
    ]) {
      await expect(handlers.get(channel)(null, '../escape')).resolves.toEqual({
        status: 'error',
        reason: 'invalid-artist',
      });
    }
    await expect(
      handlers.get('library:load-artist-photo-candidate-preview')(
        null,
        artistId,
        'https://example.test/private',
      ),
    ).resolves.toEqual({
      status: 'error',
      reason: 'candidate-unavailable',
    });
  });

  it('rechecks the provider gate for every YT Music candidate intent', async () => {
    const artistPhotoCandidateService = {
      search: vi.fn(),
      cancel: vi.fn(),
      loadPreview: vi.fn(),
      apply: vi.fn(),
    };
    const handlers = registerHandlers({
      artistPhotoCandidateService,
      getConfig: () => ({}),
    });
    const artistId = 'artist-0123456789abcdef';
    const candidateId = 'candidate_abcdefghijklmn';

    await expect(
      handlers.get('library:search-artist-photo-candidates')(null, artistId),
    ).resolves.toEqual({ status: 'disabled' });
    await expect(
      handlers.get('library:cancel-artist-photo-candidates')(null, artistId),
    ).resolves.toEqual({ status: 'disabled' });
    await expect(
      handlers.get('library:load-artist-photo-candidate-preview')(
        null,
        artistId,
        candidateId,
      ),
    ).resolves.toEqual({ status: 'disabled' });
    await expect(
      handlers.get('library:apply-artist-photo-candidate')(
        null,
        artistId,
        candidateId,
      ),
    ).resolves.toEqual({ status: 'disabled' });
    expect(artistPhotoCandidateService.search).not.toHaveBeenCalled();
    expect(artistPhotoCandidateService.cancel).not.toHaveBeenCalled();
    expect(artistPhotoCandidateService.loadPreview).not.toHaveBeenCalled();
    expect(artistPhotoCandidateService.apply).not.toHaveBeenCalled();
  });

  it('records unexpected YT Music candidate failures without exposing private context', async () => {
    const recordDiagnostic = vi.fn();
    const artistPhotoCandidateService = {
      search: vi
        .fn()
        .mockRejectedValue(new Error('artist=secret C:\\private\\worker.py')),
      cancel: vi.fn(),
      loadPreview: vi.fn(),
      apply: vi.fn(),
    };
    const handlers = registerHandlers({
      artistPhotoCandidateService,
      recordDiagnostic,
    });

    const result = await handlers.get('library:search-artist-photo-candidates')(
      null,
      'artist-0123456789abcdef',
    );

    expect(result).toEqual({
      status: 'error',
      reason: 'provider-unavailable',
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|private|worker\.py/i);
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'artist-photo',
        operation: 'candidate-search',
        code: 'ARTIST_PHOTO_CANDIDATE_FAILED',
        error: expect.any(Error),
      }),
    );
  });

  it('chooses and clears artist photos through main-owned paths', async () => {
    const artistPhotoService = {
      chooseLocal: vi.fn().mockReturnValue({ status: 'ok', changed: true }),
      clear: vi.fn().mockReturnValue({ status: 'ok', changed: true }),
    };
    const dialog = {
      showOpenDialog: vi
        .fn()
        .mockResolvedValueOnce({ canceled: true, filePaths: [] })
        .mockResolvedValueOnce({
          canceled: false,
          filePaths: ['C:\\pictures\\ado.png'],
        }),
    };
    const handlers = registerHandlers({ artistPhotoService, dialog });
    const choose = handlers.get('library:choose-artist-photo');

    await expect(choose(null, 'artist-0123456789abcdef')).resolves.toEqual({
      status: 'cancelled',
    });
    await expect(choose(null, 'artist-0123456789abcdef')).resolves.toEqual({
      status: 'ok',
      changed: true,
    });
    expect(artistPhotoService.chooseLocal).toHaveBeenCalledWith(
      'library-dir',
      'artist-0123456789abcdef',
      'C:\\pictures\\ado.png',
    );
    await expect(choose(null, 'C:\\evil')).resolves.toEqual({
      status: 'error',
      reason: 'invalid-artist',
    });
    expect(dialog.showOpenDialog).toHaveBeenCalledTimes(2);

    await expect(
      handlers.get('library:clear-artist-photo')(
        null,
        'artist-0123456789abcdef',
      ),
    ).resolves.toEqual({ status: 'ok', changed: true });
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

  it('unlinks a deleted track from session preparation and the BGM list', async () => {
    const removeTrackFromPlaylists = vi.fn();
    const unlinkTrackFromPerformanceSessionPlan = vi.fn();
    const removeTrackFromBgmStandbyPlan = vi.fn();
    const handlers = registerHandlers({
      findLibraryTrackRecord: vi.fn().mockReturnValue({ id: 'track-1' }),
      deleteLibraryTrack: vi.fn().mockReturnValue(true),
      removeTrackFromPlaylists,
      unlinkTrackFromPerformanceSessionPlan,
      removeTrackFromBgmStandbyPlan,
    });

    await expect(
      handlers.get('library:delete-track')(null, 'track-1'),
    ).resolves.toBe(true);

    expect(removeTrackFromPlaylists).toHaveBeenCalledWith(
      'library-dir',
      'track-1',
    );
    expect(unlinkTrackFromPerformanceSessionPlan).toHaveBeenCalledWith(
      'library-dir',
      'track-1',
    );
    expect(removeTrackFromBgmStandbyPlan).toHaveBeenCalledWith(
      'library-dir',
      'track-1',
    );
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

  it('records a combined track-edit failure and rethrows a safe AppError', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const handlers = registerHandlers({
      recordDiagnostic,
      listLibraryTracks: vi
        .fn()
        .mockReturnValue([{ id: 'track-1', title: 'Original' }]),
      updateLibraryTrackMetadata: vi.fn(() => {
        throw new Error('index write failed');
      }),
    });

    const error = await handlers
      .get('library:save-track-edits')({ sender: { id: 7 } }, 'track-1', {
        title: 'x',
        artist: '',
        artwork: { action: 'keep' },
      })
      .catch((err) => err);

    const payload = parseAppError(error);
    expect(payload.code).toBe('LIBRARY_SAVE_TRACK_EDITS_FAILED');
    expect(payload.context.diagnosticRecorded).toBe(true);
  });

  it('rejects unbounded metadata before mutating artwork or the library index', async () => {
    const deleteLibraryTrackArtworkFile = vi.fn();
    const updateLibraryTrackMetadata = vi.fn();
    const handlers = registerHandlers({
      listLibraryTracks: vi
        .fn()
        .mockReturnValue([{ id: 'track-1', title: 'Original' }]),
      deleteLibraryTrackArtworkFile,
      updateLibraryTrackMetadata,
    });

    await expect(
      handlers.get('library:save-track-edits')(
        { sender: { id: 7 } },
        'track-1',
        {
          title: 'x'.repeat(201),
          artist: '',
          artwork: { action: 'clear' },
        },
      ),
    ).resolves.toEqual({ status: 'error', reason: 'invalid-metadata' });
    expect(deleteLibraryTrackArtworkFile).not.toHaveBeenCalled();
    expect(updateLibraryTrackMetadata).not.toHaveBeenCalled();
  });

  it('keeps a chosen local artwork path in main and returns only bounded preview bytes', async () => {
    const readLocalArtworkDraft = vi.fn().mockReturnValue({
      mimeType: 'image/jpeg',
      bytes: Buffer.from([0xff, 0xd8, 0xff]),
    });
    const writeLibraryTrackArtworkFile = vi.fn();
    const notifyLibraryUpdated = vi.fn();
    const handlers = registerHandlers({
      listLibraryTracks: vi
        .fn()
        .mockReturnValue([{ id: 'track-1', sourceType: 'provider' }]),
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ['C:\\private\\cover.jpg'],
        }),
      },
      readLocalArtworkDraft,
      writeLibraryTrackArtworkFile,
      notifyLibraryUpdated,
    });

    await expect(
      handlers.get('library:choose-track-artwork-draft')(
        { sender: { id: 7 } },
        'track-1',
      ),
    ).resolves.toEqual({
      status: 'ok',
      mimeType: 'image/jpeg',
      bytes: Buffer.from([0xff, 0xd8, 0xff]),
    });
    expect(readLocalArtworkDraft).toHaveBeenCalledWith(
      'C:\\private\\cover.jpg',
    );
    expect(writeLibraryTrackArtworkFile).not.toHaveBeenCalled();
    expect(notifyLibraryUpdated).not.toHaveBeenCalled();
  });

  it('commits a main-owned local artwork draft together with metadata', async () => {
    const notifyLibraryUpdated = vi.fn();
    const writeLibraryTrackArtworkFile = vi
      .fn()
      .mockReturnValue('thumbnail.jpg');
    const updateLibraryTrackMetadata = vi.fn().mockReturnValue({
      id: 'track-1',
      title: 'Edited',
      artist: 'Artist',
      thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
    });
    const listLibraryTracks = vi
      .fn()
      .mockReturnValueOnce([{ id: 'track-1', title: 'Original' }])
      .mockReturnValueOnce([{ id: 'track-1', title: 'Original' }])
      .mockReturnValueOnce([
        {
          id: 'track-1',
          title: 'Edited',
          artist: 'Artist',
          thumbnailUrl: 'utawakui-media://track/track-1/thumbnail.jpg',
        },
      ]);
    const handlers = registerHandlers({
      listLibraryTracks,
      notifyLibraryUpdated,
      writeLibraryTrackArtworkFile,
      updateLibraryTrackMetadata,
      readLocalArtworkDraft: vi.fn().mockReturnValue({
        mimeType: 'image/png',
        bytes: Buffer.from([1, 2, 3]),
      }),
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ['C:\\private\\cover.png'],
        }),
      },
    });
    const event = { sender: { id: 7 } };
    await handlers.get('library:choose-track-artwork-draft')(event, 'track-1');

    await expect(
      handlers.get('library:save-track-edits')(event, 'track-1', {
        title: 'Edited',
        artist: 'Artist',
        artwork: { action: 'local-draft' },
      }),
    ).resolves.toEqual({
      status: 'ok',
      track: expect.objectContaining({
        id: 'track-1',
        title: 'Edited',
        thumbnailUrl: expect.any(String),
      }),
    });
    expect(writeLibraryTrackArtworkFile).toHaveBeenCalledWith(
      'library-dir',
      'track-1',
      'C:\\private\\cover.png',
    );
    expect(updateLibraryTrackMetadata).toHaveBeenCalledWith(
      'library-dir',
      'track-1',
      { title: 'Edited', artist: 'Artist' },
    );
    expect(notifyLibraryUpdated).toHaveBeenCalledOnce();
    expect(
      handlers.get('library:discard-track-artwork-draft')(event, 'track-1'),
    ).toBe(false);
  });

  it('restores artwork when metadata persistence fails after an artwork mutation', async () => {
    const artworkSnapshot = [{ filename: 'thumbnail.jpg', bytes: 'old' }];
    const captureLibraryTrackArtworkSnapshot = vi
      .fn()
      .mockReturnValue(artworkSnapshot);
    const restoreLibraryTrackArtworkSnapshot = vi.fn().mockReturnValue(true);
    const notifyLibraryUpdated = vi.fn();
    const handlers = registerHandlers({
      listLibraryTracks: vi
        .fn()
        .mockReturnValue([{ id: 'track-1', title: 'Original' }]),
      captureLibraryTrackArtworkSnapshot,
      restoreLibraryTrackArtworkSnapshot,
      readLocalArtworkDraft: vi.fn().mockReturnValue({
        mimeType: 'image/png',
        bytes: Buffer.from([1, 2, 3]),
      }),
      writeLibraryTrackArtworkFile: vi.fn().mockReturnValue('thumbnail.png'),
      updateLibraryTrackMetadata: vi.fn(() => {
        throw new Error('index write failed');
      }),
      notifyLibraryUpdated,
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ['C:\\private\\cover.png'],
        }),
      },
      recordDiagnostic: vi.fn().mockReturnValue({ ok: true }),
    });
    const event = { sender: { id: 7 } };
    await handlers.get('library:choose-track-artwork-draft')(event, 'track-1');

    await expect(
      handlers.get('library:save-track-edits')(event, 'track-1', {
        title: 'Edited',
        artist: '',
        artwork: { action: 'local-draft' },
      }),
    ).rejects.toBeTruthy();
    expect(captureLibraryTrackArtworkSnapshot).toHaveBeenCalledWith(
      'library-dir',
      'track-1',
    );
    expect(restoreLibraryTrackArtworkSnapshot).toHaveBeenCalledWith(
      'library-dir',
      'track-1',
      artworkSnapshot,
    );
    expect(notifyLibraryUpdated).not.toHaveBeenCalled();
  });

  it('stages artwork removal without touching the library until Save', async () => {
    const deleteLibraryTrackArtworkFile = vi.fn().mockReturnValue(true);
    const updateLibraryTrackMetadata = vi
      .fn()
      .mockReturnValue({ id: 'track-1', title: 'Song', artist: '' });
    const notifyLibraryUpdated = vi.fn();
    const handlers = registerHandlers({
      listLibraryTracks: vi
        .fn()
        .mockReturnValue([{ id: 'track-1', title: 'Song' }]),
      deleteLibraryTrackArtworkFile,
      updateLibraryTrackMetadata,
      notifyLibraryUpdated,
    });

    expect(deleteLibraryTrackArtworkFile).not.toHaveBeenCalled();
    await handlers.get('library:save-track-edits')(
      { sender: { id: 7 } },
      'track-1',
      {
        title: 'Song',
        artist: '',
        artwork: { action: 'clear' },
      },
    );
    expect(deleteLibraryTrackArtworkFile).toHaveBeenCalledWith(
      'library-dir',
      'track-1',
    );
    expect(notifyLibraryUpdated).toHaveBeenCalledOnce();
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
    expect(artworkDiscoveryService.search).toHaveBeenCalledWith(
      track,
      { title: 'Edited query', artist: 'Artist' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('aborts an in-flight artwork search on request and reports it as cancelled', async () => {
    let capturedSignal;
    const artworkDiscoveryService = {
      search: vi.fn(
        (track, edits, { signal }) =>
          new Promise((resolve) => {
            capturedSignal = signal;
            signal.addEventListener('abort', () =>
              resolve({ status: 'error', reason: 'provider-unavailable' }),
            );
          }),
      ),
    };
    const handlers = registerHandlers({
      artworkDiscoveryService,
      listLibraryTracks: vi.fn().mockReturnValue([{ id: 'track-1' }]),
    });

    const pending = handlers.get('library:search-track-artwork')(
      null,
      'track-1',
      {},
    );
    await Promise.resolve();
    expect(
      handlers.get('library:cancel-track-artwork-search')(null, 'track-1'),
    ).toBe(true);

    await expect(pending).resolves.toEqual({
      status: 'error',
      reason: 'cancelled',
    });
    expect(capturedSignal.aborted).toBe(true);
    expect(
      handlers.get('library:cancel-track-artwork-search')(null, 'track-1'),
    ).toBe(false);
  });

  it('aborts all in-flight artwork previews through the existing cancel intent', async () => {
    const capturedSignals = [];
    const artworkDiscoveryService = {
      loadPreview: vi.fn(
        (_trackId, _candidateId, { signal }) =>
          new Promise((resolve) => {
            capturedSignals.push(signal);
            signal.addEventListener(
              'abort',
              () => resolve({ status: 'error', reason: 'timeout' }),
              { once: true },
            );
          }),
      ),
    };
    const handlers = registerHandlers({
      artworkDiscoveryService,
      listLibraryTracks: vi.fn().mockReturnValue([{ id: 'track-1' }]),
    });

    const first = handlers.get('library:load-track-artwork-preview')(
      null,
      'track-1',
      'candidate-1',
    );
    const second = handlers.get('library:load-track-artwork-preview')(
      null,
      'track-1',
      'candidate-2',
    );
    await vi.waitFor(() => expect(capturedSignals).toHaveLength(2));

    expect(
      handlers.get('library:cancel-track-artwork-search')(null, 'track-1'),
    ).toBe(true);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'error', reason: 'timeout' },
      { status: 'error', reason: 'timeout' },
    ]);
    expect(capturedSignals[0]).toBe(capturedSignals[1]);
    expect(capturedSignals[0].aborted).toBe(true);
    expect(
      handlers.get('library:cancel-track-artwork-search')(null, 'track-1'),
    ).toBe(false);
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

  it('commits only an opaque candidate id with metadata and opens only the resolved MusicBrainz page', async () => {
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
      updateLibraryTrackMetadata: vi.fn().mockReturnValue(updated),
    });

    await expect(
      handlers.get('library:save-track-edits')(
        { sender: { id: 7 } },
        'track-1',
        {
          title: 'Song',
          artist: '',
          artwork: { action: 'candidate', candidateId: 'candidate-1' },
        },
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
    const enforceLibraryStoragePolicy = vi.fn().mockResolvedValue(undefined);
    const requireFeatureGate = vi.fn();
    const getPreparedLocalConversionFfmpegPath = vi.fn(
      () => 'C:\\ffmpeg\\bin\\ffmpeg.exe',
    );
    const convertAudioFiles = vi.fn().mockResolvedValue({
      imported: [],
      skipped: [],
    });
    const localImportReviewSessions = {
      create: vi.fn(() => '11111111-1111-4111-8111-111111111111'),
      has: vi.fn(() => true),
      consume: vi.fn(() => [
        {
          sourcePath: 'C:\\Users\\Singer\\Private\\Legacy.wma',
          sourceFormat: 'wma',
        },
      ]),
    };
    const dialog = {
      showOpenDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePaths: ['one.mp3', 'two.mp3'],
      }),
    };
    const importAudioFiles = vi.fn().mockReturnValue({
      imported: [
        { id: 'local-1', title: 'One' },
        { id: 'local-2', title: 'Two' },
      ],
      skipped: [],
    });
    registerLibraryHandlers({
      ipcMain,
      dialog,
      getConfig: () => ({}),
      resolveDownloadDir: () => 'library-dir',
      getMainWindow: vi.fn(),
      notifyLibraryUpdated: vi.fn(),
      sendBackfillStatus: vi.fn(),
      featureIds: FEATURE_IDS,
      requireFeatureGate,
      getProviderRunner: vi.fn(),
      lyricsAcquisitionService: { scheduleAutomaticAcquisition: vi.fn() },
      enqueueMusicAnalysis,
      enforceLibraryStoragePolicy,
      importAudioFiles,
      convertAudioFiles,
      getPreparedLocalConversionFfmpegPath,
      resolveUserDataDir: () => 'user-data-dir',
      localImportReviewSessions,
      ...overrides,
    });
    return {
      handlers,
      enqueueMusicAnalysis,
      enforceLibraryStoragePolicy,
      importAudioFiles,
      convertAudioFiles,
      getPreparedLocalConversionFfmpegPath,
      localImportReviewSessions,
      requireFeatureGate,
      dialog,
    };
  }

  it('uses the shared audio allowlist and records per-file failures without returning private paths', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const importAudioFiles = vi.fn(async (directory, filePaths, options) => {
      options.onFailure({
        sourcePath: 'C:\\Users\\Singer\\Private\\broken.mp3',
        reason: 'invalid-audio',
        error: new Error('parser failed at C:\\Users\\Singer\\Private'),
      });
      return {
        imported: [],
        skipped: [{ filename: 'broken.mp3', reason: 'invalid-audio' }],
      };
    });
    const harness = registerLocalImport({ recordDiagnostic, importAudioFiles });

    const result = await harness.handlers.get('library:import-audio-files')();

    expect(harness.dialog.showOpenDialog).toHaveBeenCalledWith(undefined, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '音訊檔',
          extensions: AUDIO_PICKER_EXTENSIONS,
        },
      ],
    });
    expect(importAudioFiles).toHaveBeenCalledWith(
      'library-dir',
      ['one.mp3', 'two.mp3'],
      {
        onFailure: expect.any(Function),
        onConversionCandidate: expect.any(Function),
      },
    );
    expect(result).toEqual({
      imported: [],
      skipped: [{ filename: 'broken.mp3', reason: 'invalid-audio' }],
    });
    expect(JSON.stringify(result)).not.toMatch(/Singer|Private/u);
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'library',
        operation: 'import-audio-file',
        code: 'LIBRARY_IMPORT_AUDIO_FILE_SKIPPED',
        error: expect.any(Error),
        context: { reason: 'invalid-audio' },
      }),
    );
  });

  it('returns an opaque review session without exposing conversion source paths', async () => {
    const importAudioFiles = vi.fn(async (directory, filePaths, options) => {
      options.onConversionCandidate({
        sourcePath: 'C:\\Users\\Singer\\Private\\Legacy.wma',
        sourceFormat: 'wma',
      });
      return {
        imported: [{ id: 'direct-1', title: 'Direct' }],
        skipped: [],
        conversionRequired: [{ filename: 'Legacy.wma', sourceFormat: 'wma' }],
      };
    });
    const harness = registerLocalImport({ importAudioFiles });

    const result = await harness.handlers.get('library:import-audio-files')();

    expect(harness.localImportReviewSessions.create).toHaveBeenCalledWith([
      {
        sourcePath: 'C:\\Users\\Singer\\Private\\Legacy.wma',
        sourceFormat: 'wma',
      },
    ]);
    expect(result).toEqual({
      imported: [{ id: 'direct-1', title: 'Direct' }],
      skipped: [],
      conversionReview: {
        sessionId: '11111111-1111-4111-8111-111111111111',
        files: [{ filename: 'Legacy.wma', sourceFormat: 'wma' }],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/Singer|Private/u);
  });

  it('rechecks the audio gate and prepared FFmpeg before consuming a review session', async () => {
    const convertAudioFiles = vi.fn().mockResolvedValue({
      imported: [{ id: 'converted-1', title: 'Converted' }],
      skipped: [],
    });
    const harness = registerLocalImport({
      convertAudioFiles,
      getConfig: () => ({ systemFfmpegPath: 'C:\\trusted\\ffmpeg.exe' }),
    });

    const result = await harness.handlers.get(
      'library:convert-local-audio-files',
    )(null, '11111111-1111-4111-8111-111111111111');

    expect(harness.requireFeatureGate).toHaveBeenCalledWith(
      FEATURE_IDS.AUDIO_PROCESSING_FLOW,
    );
    expect(harness.getPreparedLocalConversionFfmpegPath).toHaveBeenCalledWith(
      'user-data-dir',
      'C:\\trusted\\ffmpeg.exe',
      expect.objectContaining({ onStaleSystemPath: expect.any(Function) }),
    );
    expect(harness.localImportReviewSessions.consume).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(convertAudioFiles).toHaveBeenCalledWith(
      'library-dir',
      [
        {
          sourcePath: 'C:\\Users\\Singer\\Private\\Legacy.wma',
          sourceFormat: 'wma',
        },
      ],
      {
        ffmpegPath: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
        onFailure: expect.any(Function),
      },
    );
    expect(result).toEqual({
      imported: [{ id: 'converted-1', title: 'Converted' }],
      skipped: [],
    });
    expect(harness.enqueueMusicAnalysis).toHaveBeenCalledWith('converted-1');
  });

  it('keeps a review session available when FFmpeg is not prepared', async () => {
    const missing = new Error('bounded missing dependency');
    const harness = registerLocalImport({
      getPreparedLocalConversionFfmpegPath: vi.fn(() => {
        throw missing;
      }),
    });

    await expect(
      harness.handlers.get('library:convert-local-audio-files')(
        null,
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBe(missing);
    expect(harness.localImportReviewSessions.consume).not.toHaveBeenCalled();
    expect(harness.convertAudioFiles).not.toHaveBeenCalled();
  });

  it('rejects an invalid or expired review id with a bounded AppError', async () => {
    const harness = registerLocalImport({
      localImportReviewSessions: {
        create: vi.fn(),
        has: vi.fn(() => false),
        consume: vi.fn(),
      },
    });

    const error = await harness.handlers
      .get('library:convert-local-audio-files')(null, '..\\private')
      .catch((caught) => caught);

    expect(parseAppError(error)).toMatchObject({
      code: 'LOCAL_IMPORT_REVIEW_EXPIRED',
      message: '這次轉檔確認已失效，請重新選擇檔案。',
    });
    expect(harness.convertAudioFiles).not.toHaveBeenCalled();
  });

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
    expect(harness.enforceLibraryStoragePolicy).toHaveBeenCalledWith({
      protectedTrackIds: ['local-1', 'local-2'],
    });
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

  it('keeps a successful import when automatic storage cleanup fails', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const harness = registerLocalImport({
      recordDiagnostic,
      enforceLibraryStoragePolicy: vi
        .fn()
        .mockRejectedValue(new Error('private cleanup failure')),
    });

    await expect(
      harness.handlers.get('library:import-audio-files')(),
    ).resolves.toMatchObject({
      imported: [{ id: 'local-1' }, { id: 'local-2' }],
    });
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'library-storage',
        operation: 'auto-cleanup',
        code: 'LIBRARY_STORAGE_AUTO_CLEANUP_FAILED',
      }),
    );
  });
});
