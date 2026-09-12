'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { OUTPUT_STATE_VERSION } = require('../../../shared/outputContract');
const {
  maxTelemetryBytes: OUTPUT_MAX_TELEMETRY_BYTES,
} = require('../../../shared/startupTraceValues.json');

const OUTPUT_ARTWORK_PATH_PREFIX = '/media/artwork/';
const OUTPUT_STARTUP_TRACE_PATH = '/api/v1/startup-trace';
const OVERLAY_TRACE_MILESTONES = new Set([
  'first-instance-ready',
  'first-rendered-frame',
]);
const STATIC_CACHE_LIMIT = 32;
const ARTWORK_CACHE_LIMIT = 128;
const DEFAULT_OVERLAY_ROOT = path.resolve(__dirname, '../../../overlay');
const DEFAULT_SHARED_ROOT = path.resolve(__dirname, '../../../shared');
const GSAP_BROWSER_ASSET = require.resolve('gsap/dist/gsap.min.js');
const OVERLAY_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self' ws://127.0.0.1:*",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "frame-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self' file: http://localhost:5173",
].join('; ');
const OVERLAY_STATIC_ROUTES = Object.freeze({
  '/overlay/lyrics': ['lyrics', 'index.html'],
  '/overlay/lyrics/': ['lyrics', 'index.html'],
  '/overlay/lyrics/lyrics.css': ['lyrics', 'lyrics.css'],
  '/overlay/lyrics/lyrics.mjs': ['lyrics', 'lyrics.mjs'],
  '/overlay/lyrics/kineticPop.mjs': ['lyrics', 'kineticPop.mjs'],
  '/overlay/lyrics/liveStage.mjs': ['lyrics', 'liveStage.mjs'],
  '/overlay/lyrics/mangaFrame.mjs': ['lyrics', 'mangaFrame.mjs'],
  '/overlay/lyrics/ornateVertical.mjs': ['lyrics', 'ornateVertical.mjs'],
  '/overlay/now-playing': ['now-playing', 'index.html'],
  '/overlay/now-playing/': ['now-playing', 'index.html'],
  '/overlay/now-playing/now-playing.css': ['now-playing', 'now-playing.css'],
  '/overlay/now-playing/now-playing.mjs': ['now-playing', 'now-playing.mjs'],
  '/overlay/now-playing/artwork.css': ['now-playing', 'artwork.css'],
  '/overlay/now-playing/artworkLayout.mjs': [
    'now-playing',
    'artworkLayout.mjs',
  ],
  '/overlay/now-playing/artworkMotion.mjs': [
    'now-playing',
    'artworkMotion.mjs',
  ],
  '/overlay/setlist': ['setlist', 'index.html'],
  '/overlay/setlist/': ['setlist', 'index.html'],
  '/overlay/setlist/setlist.css': ['setlist', 'setlist.css'],
  '/overlay/setlist/setlist.mjs': ['setlist', 'setlist.mjs'],
  '/overlay/setlist/setlistMotion.mjs': ['setlist', 'setlistMotion.mjs'],
  '/overlay/shared/appearance.css': ['shared', 'appearance.css'],
  '/overlay/shared/appearance.mjs': ['shared', 'appearance.mjs'],
  '/overlay/shared/base.css': ['shared', 'base.css'],
  '/overlay/shared/fallback.css': ['shared', 'fallback.css'],
  '/overlay/shared/lyricsPresentation.mjs': [
    'shared',
    'lyricsPresentation.mjs',
  ],
  '/overlay/shared/mangaFrameContract.mjs': [
    'shared',
    'mangaFrameContract.mjs',
  ],
  '/overlay/shared/preview.mjs': ['shared', 'preview.mjs'],
  '/overlay/shared/runtime.mjs': ['shared', 'runtime.mjs'],
  '/overlay/shared/state.mjs': ['shared', 'state.mjs'],
  '/overlay/shared/tokens.css': ['shared', 'tokens.css'],
  '/workbench/lyrics': ['workbench', 'lyrics.html'],
  '/workbench/lyrics/': ['workbench', 'lyrics.html'],
  '/workbench/workbench.css': ['workbench', 'workbench.css'],
  '/workbench/workbench.mjs': ['workbench', 'workbench.mjs'],
  '/workbench/streamer-guide.png': ['workbench', 'streamer-guide.png'],
});
const OVERLAY_VENDOR_ROUTES = Object.freeze({
  '/overlay/vendor/gsap.min.js': GSAP_BROWSER_ASSET,
});
const SHARED_STATIC_ROUTES = Object.freeze({
  '/shared/outputAppearance.mjs': ['outputAppearance.mjs'],
  '/shared/assets/fonts/jf-open-huninn-2.1.ttf': [
    'assets',
    'fonts',
    'jf-open-huninn-2.1.ttf',
  ],
  '/shared/assets/fonts/MPLUSRounded1c-ExtraBold.ttf': [
    'assets',
    'fonts',
    'MPLUSRounded1c-ExtraBold.ttf',
  ],
  '/shared/assets/fonts/Keifont.ttf': ['assets', 'fonts', 'Keifont.ttf'],
  '/shared/assets/fonts/GenEiAntiqueNv6-M.ttf': [
    'assets',
    'fonts',
    'GenEiAntiqueNv6-M.ttf',
  ],
  '/shared/assets/fonts/HinaMincho-Regular.ttf': [
    'assets',
    'fonts',
    'HinaMincho-Regular.ttf',
  ],
  '/shared/presentation/lyricsPresentation.mjs': [
    'presentation',
    'lyricsPresentation.mjs',
  ],
  '/shared/presentation/lyricsPresentationPolicies.mjs': [
    'presentation',
    'lyricsPresentationPolicies.mjs',
  ],
  '/shared/presentation/lyricsSourceMapping.mjs': [
    'presentation',
    'lyricsSourceMapping.mjs',
  ],
  '/shared/presentation/lyricsTemplateCapabilities.mjs': [
    'presentation',
    'lyricsTemplateCapabilities.mjs',
  ],
  '/shared/presentation/kineticPopMotion.mjs': [
    'presentation',
    'kineticPopMotion.mjs',
  ],
  '/shared/presentation/ornateVerticalPresentation.mjs': [
    'presentation',
    'ornateVerticalPresentation.mjs',
  ],
  '/shared/presentation/ornateVerticalMotion.mjs': [
    'presentation',
    'ornateVerticalMotion.mjs',
  ],
  '/shared/presentation/lyricsTimingUnits.mjs': [
    'presentation',
    'lyricsTimingUnits.mjs',
  ],
  '/shared/presentation/lyricsRhythm.mjs': ['presentation', 'lyricsRhythm.mjs'],
  '/shared/presentation/mangaFrameContract.mjs': [
    'presentation',
    'mangaFrameContract.mjs',
  ],
  '/shared/presentation/state.mjs': ['presentation', 'state.mjs'],
});
const OVERLAY_MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
});
const ARTWORK_MIME_TYPES = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
});

function writeJson(response, statusCode, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...extraHeaders,
  });
  response.end(payload);
}

function writeEmpty(response, statusCode) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  response.end();
}

async function readBoundedJson(request, maxBytes) {
  let bytes = 0;
  let tooLarge = false;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) {
      tooLarge = true;
    } else if (!tooLarge) {
      chunks.push(chunk);
    }
  }
  if (tooLarge) return { tooLarge: true, value: null };
  try {
    return {
      tooLarge: false,
      value: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    };
  } catch {
    return { tooLarge: false, value: null };
  }
}

function parseOverlayTraceMilestone(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (
    Object.keys(value).length !== 2 ||
    !OVERLAY_TRACE_MILESTONES.has(value.name) ||
    !Number.isFinite(value.atUnixMs)
  ) {
    return null;
  }
  return { name: value.name, atUnixMs: value.atUnixMs };
}

function cacheHeaders(contentType, etag) {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache',
    ETag: etag,
    'Content-Security-Policy': OVERLAY_CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
}

function writeStatic(request, response, asset, contentType) {
  const headers = cacheHeaders(contentType, asset.etag);
  if (request.headers['if-none-match'] === asset.etag) {
    response.writeHead(304, headers);
    response.end();
    return;
  }
  response.writeHead(200, {
    ...headers,
    'Content-Length': asset.body.byteLength,
  });
  response.end(asset.body);
}

function writeArtwork(request, response, asset, contentType) {
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: asset.etag,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  if (request.headers['if-none-match'] === asset.etag) {
    response.writeHead(304, headers);
    response.end();
    return;
  }
  response.writeHead(200, {
    ...headers,
    'Content-Length': asset.body.byteLength,
  });
  Readable.from(asset.body).pipe(response);
}

function parseArtworkRoute(pathname) {
  if (!pathname.startsWith(OUTPUT_ARTWORK_PATH_PREFIX)) return null;
  const parts = pathname.slice(OUTPUT_ARTWORK_PATH_PREFIX.length).split('/');
  if (!parts[0] || parts.length > 2) return null;
  if (parts.length === 2 && !parts[1]) return null;
  const digest = parts[1] || null;
  if (digest !== null && !/^[a-f0-9]{64}$/.test(digest)) return null;
  try {
    return { trackId: decodeURIComponent(parts[0]), digest };
  } catch {
    return null;
  }
}

function putBounded(cache, key, value, limit) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value);
  return value;
}

function createOutputHttpHandler(options = {}) {
  const getSnapshot = options.getSnapshot;
  const getClientCount = options.getClientCount ?? (() => 0);
  const recordStartupMilestone = options.recordStartupMilestone ?? null;
  const overlayRoot = options.overlayRoot ?? DEFAULT_OVERLAY_ROOT;
  const sharedRoot = options.sharedRoot ?? DEFAULT_SHARED_ROOT;
  const resolveArtworkAsset = options.resolveArtworkAsset ?? (() => null);
  const logger = options.logger ?? console;
  const staticAssetCache = new Map();
  const artworkAssetCache = new Map();

  if (typeof getSnapshot !== 'function') {
    throw new TypeError('Output HTTP handler requires getSnapshot');
  }

  async function readCachedAsset(cache, filePath, limit) {
    const stat = await fs.promises.stat(filePath);
    const cached = cache.get(filePath);
    if (
      cached &&
      cached.size === stat.size &&
      cached.mtimeMs === stat.mtimeMs
    ) {
      cache.delete(filePath);
      cache.set(filePath, cached);
      return cached;
    }
    const body = await fs.promises.readFile(filePath);
    const digest = crypto.createHash('sha256').update(body).digest('hex');
    return putBounded(
      cache,
      filePath,
      {
        body,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        etag: `"${digest}"`,
        digest,
      },
      limit,
    );
  }

  return async function handleOutputHttpRequest(request, response) {
    let pathname;
    try {
      pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    } catch {
      writeJson(response, 400, { error: 'bad_request' });
      return;
    }

    if (pathname === OUTPUT_STARTUP_TRACE_PATH && request.method === 'POST') {
      if (typeof recordStartupMilestone !== 'function') {
        writeJson(response, 404, { error: 'not_found' });
        return;
      }
      if (
        !String(request.headers['content-type']).startsWith('application/json')
      ) {
        writeJson(response, 415, { error: 'unsupported_media_type' });
        return;
      }
      const body = await readBoundedJson(request, OUTPUT_MAX_TELEMETRY_BYTES);
      if (body.tooLarge) {
        writeJson(response, 413, { error: 'payload_too_large' });
        return;
      }
      const milestone = parseOverlayTraceMilestone(body.value);
      if (!milestone) {
        writeJson(response, 400, { error: 'bad_request' });
        return;
      }
      try {
        recordStartupMilestone(milestone.name, {
          process: 'overlay',
          atUnixMs: milestone.atUnixMs,
        });
      } catch {
        writeJson(response, 400, { error: 'bad_request' });
        return;
      }
      writeEmpty(response, 204);
      return;
    }

    if (request.method !== 'GET') {
      writeJson(
        response,
        405,
        { error: 'method_not_allowed' },
        { Allow: 'GET' },
      );
      return;
    }

    const snapshot = getSnapshot();
    if (pathname === '/health') {
      writeJson(response, 200, {
        status: 'ok',
        stateVersion: OUTPUT_STATE_VERSION,
        revision: snapshot.revision,
        clients: getClientCount(),
      });
      return;
    }

    if (pathname === '/api/v1/state') {
      writeJson(response, 200, snapshot);
      return;
    }

    if (pathname.startsWith(OUTPUT_ARTWORK_PATH_PREFIX)) {
      const route = parseArtworkRoute(pathname);
      const filePath = route ? await resolveArtworkAsset(route.trackId) : null;
      const contentType =
        typeof filePath === 'string'
          ? ARTWORK_MIME_TYPES[path.extname(filePath).toLowerCase()]
          : null;
      if (!filePath || !contentType) {
        writeJson(response, 404, { error: 'not_found' });
        return;
      }
      try {
        const asset = await readCachedAsset(
          artworkAssetCache,
          filePath,
          ARTWORK_CACHE_LIMIT,
        );
        if (route.digest === null) {
          if (request.headers['if-none-match'] === asset.etag) {
            response.writeHead(304, {
              'Cache-Control': 'no-cache',
              ETag: asset.etag,
              'X-Content-Type-Options': 'nosniff',
              'Referrer-Policy': 'no-referrer',
              'Cross-Origin-Resource-Policy': 'same-origin',
            });
            response.end();
            return;
          }
          response.writeHead(302, {
            Location: `${OUTPUT_ARTWORK_PATH_PREFIX}${encodeURIComponent(
              route.trackId,
            )}/${asset.digest}`,
            'Cache-Control': 'no-cache',
            ETag: asset.etag,
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'Cross-Origin-Resource-Policy': 'same-origin',
          });
          response.end();
        } else if (route.digest !== asset.digest) {
          writeJson(response, 404, { error: 'not_found' });
        } else {
          writeArtwork(request, response, asset, contentType);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.error?.('[output] Failed to read artwork asset', error);
        }
        writeJson(response, 404, { error: 'not_found' });
      }
      return;
    }

    const overlayFileParts = OVERLAY_STATIC_ROUTES[pathname];
    const sharedFileParts = SHARED_STATIC_ROUTES[pathname];
    const vendorFilePath = OVERLAY_VENDOR_ROUTES[pathname];
    if (overlayFileParts || sharedFileParts || vendorFilePath) {
      const filePath =
        vendorFilePath ??
        path.join(
          sharedFileParts ? sharedRoot : overlayRoot,
          ...(sharedFileParts ?? overlayFileParts),
        );
      try {
        const asset = await readCachedAsset(
          staticAssetCache,
          filePath,
          STATIC_CACHE_LIMIT,
        );
        const contentType =
          OVERLAY_MIME_TYPES[path.extname(filePath)] ??
          'application/octet-stream';
        writeStatic(request, response, asset, contentType);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.error?.('[output] Failed to read overlay asset', error);
        }
        writeJson(response, 404, { error: 'not_found' });
      }
      return;
    }

    writeJson(response, 404, { error: 'not_found' });
  };
}

module.exports = {
  createOutputHttpHandler,
  writeJson,
};
