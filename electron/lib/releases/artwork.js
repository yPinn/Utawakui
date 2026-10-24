'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { downloadValidatedArtwork } = require('../artwork/image');
const { atomicWriteBuffer } = require('../atomicWrite');
const { isSafeTrackId, resolveChildPath } = require('../library/paths');
const HOSTS = new Set([
  'lh3.googleusercontent.com',
  'yt3.googleusercontent.com',
  'i.ytimg.com',
]);
function isReleaseArtworkUrl(value) {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    [...value].some(
      (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
    )
  )
    return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}
async function acquireReleaseArtwork(url, options = {}) {
  if (!isReleaseArtworkUrl(url)) return null;
  try {
    const result = await downloadValidatedArtwork(url, {
      ...options,
      isAllowedUrl: isReleaseArtworkUrl,
      timeoutMs: 8000,
      maxBytes: 2 * 1024 * 1024,
      maxPixels: 4000000,
    });
    return result.status === 'ok' ? result.image : null;
  } catch {
    return null;
  }
}
function saveReleaseArtwork(dir, collectionId, image) {
  const coverDir = isSafeTrackId(collectionId)
    ? resolveChildPath(path.resolve(dir, 'playlist-covers'), collectionId)
    : null;
  if (
    !coverDir ||
    !image ||
    !['.jpg', '.png', '.webp'].includes(image.extension) ||
    !Buffer.isBuffer(image.buffer)
  )
    return null;
  fs.mkdirSync(coverDir, { recursive: true });
  const filename = `cover${image.extension}`;
  atomicWriteBuffer(path.join(coverDir, filename), image.buffer);
  return filename;
}
module.exports = {
  isReleaseArtworkUrl,
  acquireReleaseArtwork,
  saveReleaseArtwork,
};
