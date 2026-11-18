'use strict';

const {
  buildRangeResponse,
  resolvePlaylistCoverPath,
  resolveTrackAssetPath,
  resolveSeparationResultPath,
  resolveTrackPath,
} = require('../lib/library');
const { isBoundedTrackId } = require('../lib/library/paths');
const { resolveArtistPhotoPath } = require('../lib/artists/artistPhotos');
const {
  resolveFolderPageAssetPath,
} = require('../lib/library/folderPageObjects');
const { MEDIA_SCHEME } = require('./mediaScheme');
const { resolveTrackVideoPath } = require('../lib/library/trackVideo');
const { resolveSessionCoverPath } = require('../lib/performanceSessionArchive');
const { isCutoutPortraitId } = require('../../shared/outputAppearance.mjs');

// Serves local audio files to the sandboxed renderer (nodeIntegration:
// false means it has no direct filesystem access). Dispatches on
// hostname: 'track' is either a 2-segment asset request
// (`<trackId>/<assetFilename>`, resolveTrackAssetPath) or a 3-segment
// separation-result request (`<trackId>/separations/<presetId>.wav`,
// resolveSeparationResultPath); 'playlist-cover' resolves a playlist's
// cover image (resolvePlaylistCoverPath); 'artist-photo' resolves the one
// recorded artist photo (resolveArtistPhotoPath); 'folder-asset' resolves one
// manifest-owned page image; 'cutout-portrait' resolves a saved portrait or a
// track's artist photo; 'local' resolves legacy pre-migration audio
// through resolveTrackPath. Every hostname and segment count is allowlisted
// before a filesystem resolver sees it.
function notFoundResponse() {
  return new Response('Not found', { status: 404 });
}

function decodePathSegments(pathname) {
  try {
    return pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
}

function registerMediaProtocol({
  protocol,
  getConfig,
  resolveDownloadDir,
  buildRangeResponse: createRangeResponse = buildRangeResponse,
  resolvePlaylistCoverPath: resolveCoverPath = resolvePlaylistCoverPath,
  resolveTrackAssetPath: resolveAssetPath = resolveTrackAssetPath,
  resolveSeparationResultPath:
    resolveSeparationPath = resolveSeparationResultPath,
  resolveTrackPath: resolveLegacyTrackPath = resolveTrackPath,
  resolveArtistPhotoPath: resolvePhotoPath = resolveArtistPhotoPath,
  resolveFolderPageAssetPath:
    resolveFolderAssetPath = resolveFolderPageAssetPath,
  resolveVideoCandidate = () => null,
  resolvePortraitAsset = () => null,
  logger = console,
}) {
  function serveFile(filePath, request) {
    if (!filePath) return notFoundResponse();
    try {
      // Keep explicit range support. net.fetch(file://...) does not return
      // the partial content and headers needed by media playback.
      return createRangeResponse(filePath, request.headers.get('range'));
    } catch (error) {
      // The file may have disappeared since resolution.
      logger.error?.('[media] Failed to serve media', error);
      return notFoundResponse();
    }
  }

  async function servePortrait(request, config, dir, source, id) {
    try {
      return serveFile(
        await resolvePortraitAsset(dir, source, id, config),
        request,
      );
    } catch (error) {
      logger.error?.('[media] Failed to resolve portrait', error);
      return notFoundResponse();
    }
  }

  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url);
    let config;
    let dir;
    try {
      config = getConfig();
      dir = resolveDownloadDir(config);
    } catch {
      // An unavailable custom library is an expected recoverable state. Do
      // not let every artwork/audio request become an unhandled protocol
      // rejection while the user reconnects or changes the location.
      return notFoundResponse();
    }
    const segments = decodePathSegments(url.pathname);
    if (!segments) return notFoundResponse();

    if (url.hostname === 'cutout-portrait') {
      if (segments.length !== 2) return notFoundResponse();
      const [source, id] = segments;
      const valid =
        (source === 'custom' && isCutoutPortraitId(id)) ||
        (source === 'artist' && isBoundedTrackId(id));
      return valid
        ? servePortrait(request, config, dir, source, id)
        : notFoundResponse();
    }

    let filePath;
    if (url.hostname === 'track') {
      if (segments.length === 3 && segments[1] === 'separations') {
        filePath = resolveSeparationPath(dir, segments[0], segments[2]);
      } else if (segments.length === 2) {
        const [trackId, assetFilename] = segments;
        filePath = resolveAssetPath(dir, trackId, assetFilename);
      } else {
        return notFoundResponse();
      }
    } else if (
      url.hostname === 'track-video' ||
      url.hostname === 'video-candidate'
    ) {
      if (segments.length !== 2) return notFoundResponse();
      filePath =
        url.hostname === 'track-video'
          ? resolveTrackVideoPath(dir, ...segments)
          : resolveVideoCandidate(dir, ...segments);
    } else if (url.hostname === 'playlist-cover') {
      if (segments.length !== 2) return notFoundResponse();
      const [playlistId, coverFilename] = segments;
      filePath = resolveCoverPath(dir, playlistId, coverFilename);
    } else if (url.hostname === 'artist-photo') {
      if (segments.length !== 2) return notFoundResponse();
      const [artistId, photoFilename] = segments;
      filePath = resolvePhotoPath(dir, artistId, photoFilename);
    } else if (url.hostname === 'folder-asset') {
      if (segments.length !== 2) return notFoundResponse();
      const [assetId, assetFilename] = segments;
      filePath = resolveFolderAssetPath(dir, assetId, assetFilename);
    } else if (url.hostname === 'session-cover') {
      if (segments.length !== 2) return notFoundResponse();
      filePath = resolveSessionCoverPath(dir, ...segments);
    } else if (url.hostname === 'local') {
      if (segments.length !== 1) return notFoundResponse();
      filePath = resolveLegacyTrackPath(dir, segments[0]);
    } else {
      return notFoundResponse();
    }
    return serveFile(filePath, request);
  });
}

module.exports = { registerMediaProtocol };
