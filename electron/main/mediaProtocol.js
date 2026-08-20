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
// cover image (resolvePlaylistCoverPath); anything else falls back to
// resolveTrackPath for legacy pre-migration local audio. Never trust the
// requested path beyond what these resolvers allow.
function registerMediaProtocol({ protocol, getConfig, resolveDownloadDir }) {
  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url);
    const dir = resolveDownloadDir(getConfig());
    let filePath;
    if (url.hostname === 'track') {
      const segments = url.pathname
        .split('/')
        .filter(Boolean)
        .map(decodeURIComponent);
      if (segments.length === 3 && segments[1] === 'separations') {
        filePath = resolveSeparationResultPath(dir, segments[0], segments[2]);
      } else {
        const [trackId, assetFilename] = segments;
        filePath = resolveTrackAssetPath(dir, trackId, assetFilename);
      }
    } else if (url.hostname === 'playlist-cover') {
      const [playlistId, coverFilename] = url.pathname
        .split('/')
        .filter(Boolean)
        .map(decodeURIComponent);
      filePath = resolvePlaylistCoverPath(dir, playlistId, coverFilename);
    } else {
      const filename = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      filePath = resolveTrackPath(dir, filename);
    }
    if (!filePath) {
      return new Response('Not found', { status: 404 });
    }
    try {
      // Real 206 Partial Content support — see buildRangeResponse's own
      // comment for why net.fetch(pathToFileURL(...)) doesn't actually
      // provide this despite looking like it should.
      return buildRangeResponse(filePath, request.headers.get('range'));
    } catch {
      // Most likely the file was deleted between resolveTrackPath (which
      // only checks the path is safe, not that the file exists) and here
      // — same response as "never existed" rather than letting fs
      // errors escape the handler.
      return new Response('Not found', { status: 404 });
    }
  });
}

module.exports = { registerMediaProtocol };
