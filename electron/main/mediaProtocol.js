'use strict';

const {
  buildRangeResponse,
  resolvePlaylistCoverPath,
  resolveTrackAssetPath,
  resolveSeparationResultPath,
  resolveTrackPath,
} = require('../lib/library');
const { MEDIA_SCHEME } = require('./mediaScheme');

// Serves local audio files to the sandboxed renderer (nodeIntegration:
// false means it has no direct filesystem access). Dispatches on
// hostname: 'track' is either a 2-segment asset request
// (`<trackId>/<assetFilename>`, resolveTrackAssetPath) or a 3-segment
// separation-result request (`<trackId>/separations/<presetId>.wav`,
// resolveSeparationResultPath); 'playlist-cover' resolves a playlist's
// cover image (resolvePlaylistCoverPath); 'local' resolves legacy
// pre-migration audio through resolveTrackPath. Every hostname and segment
// count is allowlisted before a filesystem resolver sees it.
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
}) {
  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url);
    let dir;
    try {
      dir = resolveDownloadDir(getConfig());
    } catch {
      // An unavailable custom library is an expected recoverable state. Do
      // not let every artwork/audio request become an unhandled protocol
      // rejection while the user reconnects or changes the location.
      return notFoundResponse();
    }
    const segments = decodePathSegments(url.pathname);
    if (!segments) return notFoundResponse();

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
    } else if (url.hostname === 'playlist-cover') {
      if (segments.length !== 2) return notFoundResponse();
      const [playlistId, coverFilename] = segments;
      filePath = resolveCoverPath(dir, playlistId, coverFilename);
    } else if (url.hostname === 'local') {
      if (segments.length !== 1) return notFoundResponse();
      filePath = resolveLegacyTrackPath(dir, segments[0]);
    } else {
      return notFoundResponse();
    }
    if (!filePath) {
      return notFoundResponse();
    }
    try {
      // Real 206 Partial Content support — see buildRangeResponse's own
      // comment for why net.fetch(pathToFileURL(...)) doesn't actually
      // provide this despite looking like it should.
      return createRangeResponse(filePath, request.headers.get('range'));
    } catch (error) {
      // Most likely the file was deleted between resolveTrackPath (which
      // only checks the path is safe, not that the file exists) and here
      // — same response as "never existed" rather than letting fs
      // errors escape the handler. Logged so a genuine bug here (as
      // opposed to the expected deleted-file race) is still visible
      // instead of silently degrading to "track won't play".
      console.error(`utawakui-media: failed to serve ${filePath}:`, error);
      return notFoundResponse();
    }
  });
}

module.exports = { registerMediaProtocol };
