'use strict';

const { isFeatureGateEnabled } = require('../../lib/featureGates');
const { isArtistId } = require('../../lib/artists/artistPhotos');
const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');

// Artist photo resolution, provider candidates and local choices.
function registerLibraryArtistPhotoHandlers({
  ipcMain,
  dialog,
  getMainWindow,
  getConfig,
  resolveDownloadDir,
  listLibraryTracks,
  notifyLibraryUpdated,
  featureIds,
  getProviderRunner,
  artistPhotoService,
  artistPhotoCandidateService,
  recordDiagnostic,
}) {
  // Automatic artist photo from the artist's official YouTube channel. A closed
  // provider gate is an expected state, not a diagnostic failure.
  ipcMain.handle('library:resolve-artist-photo', async (event, artistId) => {
    if (!isArtistId(artistId)) {
      return { status: 'error', reason: 'invalid-artist' };
    }
    if (!isFeatureGateEnabled(getConfig(), featureIds.PROVIDER_FLOW)) {
      return { status: 'disabled' };
    }
    const dir = resolveDownloadDir(getConfig());
    try {
      return await artistPhotoService.resolveFromChannel(
        dir,
        listLibraryTracks(dir),
        artistId,
        { getRunner: getProviderRunner },
      );
    } catch (error) {
      try {
        recordDiagnostic?.({
          process: 'main',
          level: 'warning',
          source: 'artist-photo',
          operation: 'resolve',
          code: 'ARTIST_PHOTO_RESOLVE_FAILED',
          error,
        });
      } catch {
        // Diagnostics are fail-open and must not block the artist page.
      }
      return { status: 'unavailable', reason: 'provider-unavailable' };
    }
  });

  const isCandidateId = (value) =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{20,64}$/u.test(value);
  const candidateGateOpen = () =>
    isFeatureGateEnabled(getConfig(), featureIds.PROVIDER_FLOW);
  const runCandidateIntent = async (operation, callback) => {
    if (!artistPhotoCandidateService) {
      return { status: 'error', reason: 'provider-unavailable' };
    }
    try {
      return await callback();
    } catch (error) {
      try {
        recordDiagnostic?.({
          process: 'main',
          level: 'warning',
          source: 'artist-photo',
          operation,
          code: 'ARTIST_PHOTO_CANDIDATE_FAILED',
          error,
        });
      } catch {
        // Diagnostics are fail-open and never expose provider context to IPC.
      }
      return { status: 'error', reason: 'provider-unavailable' };
    }
  };

  ipcMain.handle(
    'library:search-artist-photo-candidates',
    async (event, artistId) => {
      if (!isArtistId(artistId)) {
        return { status: 'error', reason: 'invalid-artist' };
      }
      if (!candidateGateOpen()) return { status: 'disabled' };
      const dir = resolveDownloadDir(getConfig());
      return runCandidateIntent('candidate-search', () =>
        artistPhotoCandidateService.search(
          dir,
          () => listLibraryTracks(dir),
          artistId,
        ),
      );
    },
  );

  ipcMain.handle(
    'library:cancel-artist-photo-candidates',
    async (event, artistId) => {
      if (!isArtistId(artistId)) {
        return { status: 'error', reason: 'invalid-artist' };
      }
      if (!candidateGateOpen()) return { status: 'disabled' };
      const dir = resolveDownloadDir(getConfig());
      return runCandidateIntent('candidate-cancel', () =>
        artistPhotoCandidateService.cancel(artistId, dir),
      );
    },
  );

  ipcMain.handle(
    'library:load-artist-photo-candidate-preview',
    async (event, artistId, candidateId) => {
      if (!isArtistId(artistId)) {
        return { status: 'error', reason: 'invalid-artist' };
      }
      if (!isCandidateId(candidateId)) {
        return { status: 'error', reason: 'candidate-unavailable' };
      }
      if (!candidateGateOpen()) return { status: 'disabled' };
      const dir = resolveDownloadDir(getConfig());
      return runCandidateIntent('candidate-preview', () =>
        artistPhotoCandidateService.loadPreview(dir, artistId, candidateId),
      );
    },
  );

  ipcMain.handle(
    'library:apply-artist-photo-candidate',
    async (event, artistId, candidateId) => {
      if (!isArtistId(artistId)) {
        return { status: 'error', reason: 'invalid-artist' };
      }
      if (!isCandidateId(candidateId)) {
        return { status: 'error', reason: 'candidate-unavailable' };
      }
      if (!candidateGateOpen()) return { status: 'disabled' };
      const dir = resolveDownloadDir(getConfig());
      const result = await runCandidateIntent('candidate-apply', () =>
        artistPhotoCandidateService.apply(
          dir,
          () => listLibraryTracks(dir),
          artistId,
          candidateId,
        ),
      );
      if (result.status === 'ok' && result.changed) {
        notifyLibraryUpdated({ allowProviderBackfill: false });
      }
      return result;
    },
  );

  ipcMain.handle('library:choose-artist-photo', async (event, artistId) => {
    if (!isArtistId(artistId)) {
      return { status: 'error', reason: 'invalid-artist' };
    }
    const dir = resolveDownloadDir(getConfig());
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: '圖片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { status: 'cancelled' };
    return runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'artist-photo',
          operation: 'choose',
          code: 'ARTIST_PHOTO_CHOOSE_FAILED',
        },
        publicError: {
          code: 'ARTIST_PHOTO_CHOOSE_FAILED',
          title: '藝人照片無法更新',
          message: '這張圖片無法作為藝人照片，請換一張再試。',
          context: { retryable: true },
        },
      },
      () => artistPhotoService.chooseLocal(dir, artistId, result.filePaths[0]),
    );
  });

  ipcMain.handle('library:clear-artist-photo', async (event, artistId) => {
    if (!isArtistId(artistId)) {
      return { status: 'error', reason: 'invalid-artist' };
    }
    const dir = resolveDownloadDir(getConfig());
    return runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'artist-photo',
          operation: 'clear',
          code: 'ARTIST_PHOTO_CLEAR_FAILED',
        },
        publicError: {
          code: 'ARTIST_PHOTO_CLEAR_FAILED',
          title: '藝人照片無法移除',
          message: '目前無法移除這張藝人照片，請再試一次。',
          context: { retryable: true },
        },
      },
      () => artistPhotoService.clear(dir, artistId),
    );
  });
}

module.exports = { registerLibraryArtistPhotoHandlers };
