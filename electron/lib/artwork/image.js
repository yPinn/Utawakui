'use strict';

const packageMetadata = require('../../../package.json');
const { isAllowedCoverArtUrl } = require('../coverArtArchive/client.js');

const DEFAULT_IMAGE_TIMEOUT_MS = 15_000;
const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;
const MIN_ARTWORK_DIMENSION = 64;
const MAX_ARTWORK_DIMENSION = 12_000;
const MAX_ARTWORK_PIXELS = 25_000_000;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function pngInfo(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    return null;
  }
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return {
    mimeType: 'image/png',
    extension: '.png',
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function jpegInfo(buffer) {
  if (buffer.length < 10 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (startOfFrame.has(marker)) {
      return {
        mimeType: 'image/jpeg',
        extension: '.jpg',
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      };
    }
    offset += length;
  }
  return null;
}

function webpInfo(buffer) {
  if (
    buffer.length < 30 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      mimeType: 'image/webp',
      extension: '.webp',
      width: 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16),
      height: 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16),
    };
  }
  if (chunk === 'VP8L' && buffer[20] === 0x2f) {
    return {
      mimeType: 'image/webp',
      extension: '.webp',
      width: 1 + buffer[21] + ((buffer[22] & 0x3f) << 8),
      height:
        1 +
        ((buffer[22] & 0xc0) >> 6) +
        (buffer[23] << 2) +
        ((buffer[24] & 0x0f) << 10),
    };
  }
  if (
    chunk === 'VP8 ' &&
    buffer[23] === 0x9d &&
    buffer[24] === 0x01 &&
    buffer[25] === 0x2a
  ) {
    return {
      mimeType: 'image/webp',
      extension: '.webp',
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  return null;
}

function inspectArtworkImage(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  return pngInfo(buffer) || jpegInfo(buffer) || webpInfo(buffer);
}

function validDimensions(image, maxPixels = MAX_ARTWORK_PIXELS) {
  return (
    Number.isInteger(image?.width) &&
    Number.isInteger(image?.height) &&
    image.width >= MIN_ARTWORK_DIMENSION &&
    image.height >= MIN_ARTWORK_DIMENSION &&
    image.width <= MAX_ARTWORK_DIMENSION &&
    image.height <= MAX_ARTWORK_DIMENSION &&
    image.width * image.height <= maxPixels &&
    image.width / image.height >= 0.1 &&
    image.width / image.height <= 10
  );
}

async function readBoundedBuffer(response, maxBytes, signal) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel?.().catch(() => undefined);
    return { status: 'error', reason: 'response-too-large' };
  }
  if (!response.body) return { status: 'error', reason: 'empty-response' };
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: 'error', reason: 'response-too-large' };
      }
      chunks.push(Buffer.from(value));
    }
    return { status: 'ok', buffer: Buffer.concat(chunks, totalBytes) };
  } catch (error) {
    return {
      status: 'error',
      reason:
        signal?.aborted ||
        error?.name === 'AbortError' ||
        error?.name === 'TimeoutError'
          ? 'timeout'
          : 'offline',
    };
  } finally {
    reader.releaseLock();
  }
}

function declaredMimeType(response) {
  return response.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase();
}

async function downloadValidatedArtwork(urlValue, options = {}) {
  const fetchFn = Object.hasOwn(options, 'fetch')
    ? options.fetch
    : globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return { status: 'error', reason: 'fetch-unavailable' };
  }
  if (!isAllowedCoverArtUrl(urlValue)) {
    return { status: 'error', reason: 'url-not-allowed' };
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_ARTWORK_BYTES;
  const maxPixels =
    Number.isSafeInteger(options.maxPixels) && options.maxPixels > 0
      ? Math.min(options.maxPixels, MAX_ARTWORK_PIXELS)
      : MAX_ARTWORK_PIXELS;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;
  let currentUrl = new URL(urlValue);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let response;
    try {
      response = await fetchFn(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          Accept: 'image/jpeg, image/png, image/webp',
          'User-Agent': `Utawakui/${packageMetadata.version}`,
        },
        signal,
      });
    } catch (error) {
      return {
        status: 'error',
        reason:
          signal.aborted ||
          error?.name === 'AbortError' ||
          error?.name === 'TimeoutError'
            ? 'timeout'
            : 'offline',
      };
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      const location = response.headers.get('location');
      let nextUrl;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        return { status: 'error', reason: 'invalid-redirect' };
      }
      if (!isAllowedCoverArtUrl(nextUrl.href)) {
        return { status: 'error', reason: 'redirect-not-allowed' };
      }
      currentUrl = nextUrl;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return {
        status: 'error',
        reason: response.status === 404 ? 'not-found' : 'http-error',
        httpStatus: response.status,
      };
    }
    const bounded = await readBoundedBuffer(response, maxBytes, signal);
    if (bounded.status === 'error') return bounded;
    const image = inspectArtworkImage(bounded.buffer);
    if (!image) return { status: 'error', reason: 'invalid-image' };
    const mimeType = declaredMimeType(response);
    if (mimeType && mimeType !== image.mimeType) {
      return { status: 'error', reason: 'mime-mismatch' };
    }
    if (!validDimensions(image, maxPixels)) {
      return { status: 'error', reason: 'invalid-dimensions' };
    }
    return {
      status: 'ok',
      image: { ...image, buffer: bounded.buffer },
    };
  }
  return { status: 'error', reason: 'too-many-redirects' };
}

module.exports = {
  DEFAULT_IMAGE_TIMEOUT_MS,
  MAX_ARTWORK_BYTES,
  MAX_ARTWORK_DIMENSION,
  MAX_ARTWORK_PIXELS,
  MIN_ARTWORK_DIMENSION,
  downloadValidatedArtwork,
  inspectArtworkImage,
};
