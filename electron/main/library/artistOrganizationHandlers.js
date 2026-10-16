'use strict';

const { isFeatureGateEnabled } = require('../../lib/featureGates');
const { isArtistId } = require('../../lib/artists/artistPhotos');
const { isCreditId } = require('../../lib/artists/artistOrganization');
const { hasControlCharacters } = require('../../lib/textGuards');
const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');

// Artist index, manual organization and MusicBrainz identity intents.
function registerLibraryArtistOrganizationHandlers({
  ipcMain,
  getConfig,
  resolveDownloadDir,
  listLibraryTracks,
  notifyLibraryUpdated,
  featureIds,
  artistIndexCache,
  artistIdentityService,
  recordDiagnostic,
}) {
  // Derived, read-only artist grouping (ADR 0022); never triggers backfill.
  ipcMain.handle('library:get-artist-index', async () => {
    const dir = resolveDownloadDir(getConfig());
    return artistIndexCache.getIndex(dir, listLibraryTracks(dir));
  });

  const validRevision = (value) => Number.isSafeInteger(value) && value >= 0;
  const invalidArtistIntent = () => ({
    status: 'error',
    reason: 'invalid-intent',
  });
  const runArtistOrganizationIntent = (operation, callback) =>
    runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'artist-organization',
          operation,
          code: `ARTIST_ORGANIZATION_${operation.toUpperCase().replaceAll('-', '_')}_FAILED`,
        },
        publicError: {
          code: 'ARTIST_ORGANIZATION_FAILED',
          title: '藝人整理未完成',
          message: '目前無法儲存藝人整理，請再試一次。',
          context: { retryable: true },
        },
      },
      async () => {
        const result = await callback();
        if (result?.changed) {
          notifyLibraryUpdated({ allowProviderBackfill: false });
        }
        return result;
      },
    );

  ipcMain.handle('library:merge-artists', async (event, intent) => {
    if (
      !intent ||
      !Array.isArray(intent.artistIds) ||
      intent.artistIds.length !== 2 ||
      new Set(intent.artistIds).size !== 2 ||
      !intent.artistIds.every(isArtistId) ||
      !validRevision(intent.expectedRevision)
    ) {
      return invalidArtistIntent();
    }
    const directory = resolveDownloadDir(getConfig());
    const tracks = listLibraryTracks(directory);
    return runArtistOrganizationIntent('merge', () =>
      artistIndexCache.mergeArtists(directory, tracks, intent.artistIds, {
        expectedRevision: intent.expectedRevision,
      }),
    );
  });

  ipcMain.handle('library:split-artist-credit', async (event, intent) => {
    if (
      !intent ||
      !isArtistId(intent.artistId) ||
      !isCreditId(intent.creditId) ||
      !validRevision(intent.expectedRevision)
    ) {
      return invalidArtistIntent();
    }
    const directory = resolveDownloadDir(getConfig());
    const tracks = listLibraryTracks(directory);
    return runArtistOrganizationIntent('split', () =>
      artistIndexCache.splitArtistCredit(
        directory,
        tracks,
        intent.artistId,
        intent.creditId,
        { expectedRevision: intent.expectedRevision },
      ),
    );
  });

  ipcMain.handle('library:set-artist-display-name', async (event, intent) => {
    if (
      !intent ||
      !isArtistId(intent.artistId) ||
      typeof intent.displayName !== 'string' ||
      intent.displayName.length > 200 ||
      hasControlCharacters(intent.displayName) ||
      !validRevision(intent.expectedRevision)
    ) {
      return invalidArtistIntent();
    }
    const directory = resolveDownloadDir(getConfig());
    const tracks = listLibraryTracks(directory);
    return runArtistOrganizationIntent('display-name', () =>
      artistIndexCache.setDisplayName(
        directory,
        tracks,
        intent.artistId,
        intent.displayName,
        { expectedRevision: intent.expectedRevision },
      ),
    );
  });

  ipcMain.handle('library:undo-artist-organization', async (event, intent) => {
    if (!intent || !validRevision(intent.expectedRevision)) {
      return invalidArtistIntent();
    }
    const directory = resolveDownloadDir(getConfig());
    return runArtistOrganizationIntent('undo', () =>
      artistIndexCache.undoOrganization(directory, {
        expectedRevision: intent.expectedRevision,
      }),
    );
  });

  const isArtistIdentityCandidateId = (value) =>
    typeof value === 'string' &&
    /^candidate_[A-Za-z0-9_-]{20,64}$/u.test(value);
  const runArtistIdentityLookup = (operation, callback) =>
    runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'artist-identity',
          operation,
          code: 'ARTIST_IDENTITY_LOOKUP_FAILED',
        },
        publicError: {
          code: 'ARTIST_IDENTITY_LOOKUP_FAILED',
          title: '無法查詢藝人資料',
          message: 'MusicBrainz 目前無法使用，仍可手動整理藝人。',
          context: { retryable: true },
        },
      },
      callback,
    );

  ipcMain.handle('library:auto-resolve-artist-identities', async () => {
    if (!isFeatureGateEnabled(getConfig(), featureIds.PROVIDER_FLOW)) {
      return { status: 'disabled' };
    }
    const directory = resolveDownloadDir(getConfig());
    const tracks = listLibraryTracks(directory);
    void runArtistIdentityLookup('automatic-reconciliation', () =>
      artistIdentityService.reconcile(directory, tracks, {
        onApplied: () => notifyLibraryUpdated({ allowProviderBackfill: false }),
      }),
    ).catch(() => {});
    return { status: 'started' };
  });

  ipcMain.handle(
    'library:search-artist-identity-candidates',
    async (event, artistId) => {
      if (!isArtistId(artistId)) {
        return { status: 'error', reason: 'invalid-artist' };
      }
      if (!isFeatureGateEnabled(getConfig(), featureIds.PROVIDER_FLOW)) {
        return { status: 'disabled' };
      }
      const directory = resolveDownloadDir(getConfig());
      const tracks = listLibraryTracks(directory);
      return runArtistIdentityLookup('search', () =>
        artistIdentityService.search(directory, tracks, artistId),
      );
    },
  );

  ipcMain.handle(
    'library:cancel-artist-identity-candidates',
    (event, artistId) =>
      isArtistId(artistId) ? artistIdentityService.cancel(artistId) : false,
  );

  ipcMain.handle(
    'library:apply-artist-identity-candidate',
    async (event, intent) => {
      if (
        !intent ||
        !isArtistId(intent.artistId) ||
        !isArtistIdentityCandidateId(intent.candidateId) ||
        !validRevision(intent.expectedRevision)
      ) {
        return invalidArtistIntent();
      }
      if (!isFeatureGateEnabled(getConfig(), featureIds.PROVIDER_FLOW)) {
        return { status: 'disabled' };
      }
      const directory = resolveDownloadDir(getConfig());
      const tracks = listLibraryTracks(directory);
      return runArtistOrganizationIntent('catalog', () =>
        artistIdentityService.apply(
          directory,
          tracks,
          intent.artistId,
          intent.candidateId,
          intent.expectedRevision,
        ),
      );
    },
  );
}

module.exports = { registerLibraryArtistOrganizationHandlers };
