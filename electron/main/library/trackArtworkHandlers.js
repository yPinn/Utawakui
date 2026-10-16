'use strict';

const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');
const {
  isMusicBrainzSourcePage,
} = require('../../lib/musicbrainz/identifiers');

// Track metadata edits, local artwork drafts and online artwork discovery.
function registerLibraryTrackArtworkHandlers({
  ipcMain,
  dialog,
  getMainWindow,
  getConfig,
  resolveDownloadDir,
  listLibraryTracks,
  notifyLibraryUpdated,
  featureIds,
  requireFeatureGate,
  openExternal,
  readLocalArtworkDraft,
  captureLibraryTrackArtworkSnapshot,
  restoreLibraryTrackArtworkSnapshot,
  writeLibraryTrackArtworkFile,
  deleteLibraryTrackArtworkFile,
  updateLibraryTrackMetadata,
  artworkDiscoveryService,
  createArtworkService,
  recordDiagnostic,
}) {
  const resolvedArtworkDiscoveryService =
    artworkDiscoveryService ??
    createArtworkService({
      onProviderFailure(failure) {
        try {
          recordDiagnostic?.({
            process: 'main',
            level: 'warning',
            source: 'artwork',
            operation: 'provider-search',
            code: 'ARTWORK_PROVIDER_UNAVAILABLE',
            message: 'Artwork provider search failed',
            context: {
              stage: failure.stage,
              reason: failure.reason,
              ...(Number.isInteger(failure.httpStatus)
                ? { httpStatus: failure.httpStatus }
                : {}),
              failureCount: failure.failureCount,
              retryable: true,
            },
          });
        } catch {
          // Diagnostics are fail-open and must not block artwork search.
        }
      },
    });

  const localArtworkDrafts = new Map();

  function localArtworkDraftKey(event, trackId) {
    const senderId = Number.isInteger(event?.sender?.id)
      ? event.sender.id
      : 'renderer';
    return `${senderId}:${trackId}`;
  }

  function normalizeArtworkEditIntent(value) {
    const action = value?.action;
    if (!['keep', 'local-draft', 'candidate', 'clear'].includes(action)) {
      return null;
    }
    if (action !== 'candidate') return { action };
    if (
      typeof value.candidateId !== 'string' ||
      value.candidateId.length === 0 ||
      value.candidateId.length > 200
    ) {
      return null;
    }
    return { action, candidateId: value.candidateId };
  }

  function normalizeTrackMetadataEdits(value) {
    if (typeof value?.title !== 'string' || typeof value?.artist !== 'string') {
      return null;
    }
    const title = value.title.trim();
    const artist = value.artist.trim();
    if (!title || title.length > 200 || artist.length > 200) return null;
    return { title, artist };
  }

  ipcMain.handle(
    'library:choose-track-artwork-draft',
    async (event, trackId) => {
      const dir = resolveDownloadDir(getConfig());
      const track = listLibraryTracks(dir).find(
        (candidate) => candidate.id === trackId,
      );
      if (!track) return { status: 'error', reason: 'track-unavailable' };

      const result = await dialog.showOpenDialog(getMainWindow(), {
        properties: ['openFile'],
        filters: [{ name: '圖片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      });
      if (result.canceled || !result.filePaths[0]) {
        return { status: 'cancelled' };
      }

      const preview = await runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'library',
            operation: 'choose-track-artwork-draft',
            code: 'LIBRARY_CHOOSE_ARTWORK_DRAFT_FAILED',
          },
          publicError: {
            code: 'LIBRARY_CHOOSE_ARTWORK_DRAFT_FAILED',
            title: '封面無法預覽',
            message: '這張圖片無法預覽，請選擇其他圖片。',
            context: { retryable: true },
          },
        },
        () => readLocalArtworkDraft(result.filePaths[0]),
      );
      if (!preview) return { status: 'error', reason: 'unsupported-file' };

      localArtworkDrafts.set(localArtworkDraftKey(event, trackId), {
        sourcePath: result.filePaths[0],
      });
      return { status: 'ok', ...preview };
    },
  );

  ipcMain.handle('library:discard-track-artwork-draft', (event, trackId) =>
    localArtworkDrafts.delete(localArtworkDraftKey(event, trackId)),
  );

  ipcMain.handle('library:save-track-edits', async (event, trackId, edits) => {
    const dir = resolveDownloadDir(getConfig());
    const track = listLibraryTracks(dir).find(
      (candidate) => candidate.id === trackId,
    );
    if (!track) return { status: 'error', reason: 'track-unavailable' };

    const metadata = normalizeTrackMetadataEdits(edits);
    if (!metadata) return { status: 'error', reason: 'invalid-metadata' };

    const artwork = normalizeArtworkEditIntent(edits?.artwork);
    if (!artwork) return { status: 'error', reason: 'invalid-artwork-intent' };
    if (artwork.action === 'candidate') {
      requireFeatureGate(featureIds.PROVIDER_FLOW);
    }

    const draftKey = localArtworkDraftKey(event, trackId);
    const localDraft = localArtworkDrafts.get(draftKey);
    if (artwork.action === 'local-draft' && !localDraft) {
      return { status: 'error', reason: 'draft-unavailable' };
    }
    const artworkSnapshot =
      artwork.action === 'keep'
        ? null
        : captureLibraryTrackArtworkSnapshot(dir, trackId);
    if (artwork.action !== 'keep' && !Array.isArray(artworkSnapshot)) {
      return { status: 'error', reason: 'artwork-unavailable' };
    }

    const saved = await runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'library',
          operation: 'save-track-edits',
          code: 'LIBRARY_SAVE_TRACK_EDITS_FAILED',
        },
        publicError: {
          code: 'LIBRARY_SAVE_TRACK_EDITS_FAILED',
          title: '歌曲變更無法儲存',
          message: '歌曲變更無法儲存，請再試一次。',
          context: { retryable: true },
        },
      },
      async () => {
        const rollbackArtwork = () => {
          if (artworkSnapshot) {
            restoreLibraryTrackArtworkSnapshot(dir, trackId, artworkSnapshot);
          }
        };
        try {
          if (artwork.action === 'local-draft') {
            const filename = writeLibraryTrackArtworkFile(
              dir,
              trackId,
              localDraft.sourcePath,
            );
            if (!filename) {
              rollbackArtwork();
              return { status: 'error', reason: 'draft-unavailable' };
            }
          } else if (artwork.action === 'candidate') {
            const result = await resolvedArtworkDiscoveryService.apply(
              dir,
              trackId,
              artwork.candidateId,
            );
            if (result?.status !== 'ok') {
              rollbackArtwork();
              return result;
            }
          } else if (artwork.action === 'clear') {
            deleteLibraryTrackArtworkFile(dir, trackId);
          }

          const updated = updateLibraryTrackMetadata(dir, trackId, {
            title: metadata.title,
            artist: metadata.artist,
          });
          if (!updated) {
            rollbackArtwork();
            return { status: 'error', reason: 'track-unavailable' };
          }
          return {
            status: 'ok',
            track: updated,
          };
        } catch (error) {
          rollbackArtwork();
          throw error;
        }
      },
    );
    if (saved?.status === 'ok') {
      localArtworkDrafts.delete(draftKey);
      notifyLibraryUpdated();
    }
    return saved;
  });

  // One in-flight search per track; the renderer can abort it so a slow
  // provider never traps the editor.
  const artworkSearches = new Map();
  const artworkPreviews = new Map();

  function abortArtworkOperations(trackId) {
    let aborted = false;
    const searchController = artworkSearches.get(trackId);
    if (searchController) {
      searchController.abort();
      aborted = true;
    }
    const previewGroup = artworkPreviews.get(trackId);
    if (previewGroup) {
      previewGroup.controller.abort();
      aborted = true;
    }
    return aborted;
  }

  ipcMain.handle(
    'library:search-track-artwork',
    async (event, trackId, edits = {}) => {
      requireFeatureGate(featureIds.PROVIDER_FLOW);
      const dir = resolveDownloadDir(getConfig());
      const track = listLibraryTracks(dir).find(
        (candidate) => candidate.id === trackId,
      );
      if (!track) return { status: 'error', reason: 'track-unavailable' };
      abortArtworkOperations(trackId);
      const controller = new AbortController();
      artworkSearches.set(trackId, controller);
      const result = await runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'artwork',
            operation: 'search',
            code: 'ARTWORK_SEARCH_FAILED',
          },
          publicError: {
            code: 'ARTWORK_SEARCH_FAILED',
            title: '無法搜尋線上封面',
            message: '目前無法搜尋線上封面，請稍後再試。',
            context: { retryable: true },
          },
        },
        () =>
          resolvedArtworkDiscoveryService.search(track, edits, {
            signal: controller.signal,
          }),
      ).finally(() => {
        if (artworkSearches.get(trackId) === controller) {
          artworkSearches.delete(trackId);
        }
      });
      return controller.signal.aborted
        ? { status: 'error', reason: 'cancelled' }
        : result;
    },
  );

  ipcMain.handle('library:cancel-track-artwork-search', (event, trackId) => {
    return abortArtworkOperations(trackId);
  });

  ipcMain.handle(
    'library:load-track-artwork-preview',
    async (event, trackId, candidateId) => {
      requireFeatureGate(featureIds.PROVIDER_FLOW);
      const dir = resolveDownloadDir(getConfig());
      const track = listLibraryTracks(dir).find(
        (candidate) => candidate.id === trackId,
      );
      if (!track) return { status: 'error', reason: 'track-unavailable' };
      let previewGroup = artworkPreviews.get(trackId);
      if (!previewGroup || previewGroup.controller.signal.aborted) {
        previewGroup = { active: 0, controller: new AbortController() };
        artworkPreviews.set(trackId, previewGroup);
      }
      previewGroup.active += 1;
      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'artwork',
            operation: 'load-preview',
            code: 'ARTWORK_PREVIEW_FAILED',
          },
          publicError: {
            code: 'ARTWORK_PREVIEW_FAILED',
            title: '封面預覽無法載入',
            message: '封面預覽無法載入，請再試一次。',
            context: { retryable: true },
          },
        },
        () =>
          resolvedArtworkDiscoveryService.loadPreview(trackId, candidateId, {
            signal: previewGroup.controller.signal,
          }),
      ).finally(() => {
        previewGroup.active -= 1;
        if (
          previewGroup.active === 0 &&
          artworkPreviews.get(trackId) === previewGroup
        ) {
          artworkPreviews.delete(trackId);
        }
      });
    },
  );

  ipcMain.handle(
    'library:open-track-artwork-source',
    async (event, trackId, candidateId) => {
      requireFeatureGate(featureIds.PROVIDER_FLOW);
      const dir = resolveDownloadDir(getConfig());
      const track = listLibraryTracks(dir).find(
        (candidate) => candidate.id === trackId,
      );
      if (!track) return false;
      const sourcePage = resolvedArtworkDiscoveryService.sourcePage(
        trackId,
        candidateId,
      );
      if (!isMusicBrainzSourcePage(sourcePage)) return false;
      await runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'artwork',
            operation: 'open-source',
            code: 'ARTWORK_SOURCE_OPEN_FAILED',
          },
          publicError: {
            code: 'ARTWORK_SOURCE_OPEN_FAILED',
            title: '無法開啟 MusicBrainz',
            message: '目前無法開啟來源頁面，請稍後再試。',
          },
        },
        () => openExternal(sourcePage),
      );
      return true;
    },
  );
}

module.exports = { registerLibraryTrackArtworkHandlers };
