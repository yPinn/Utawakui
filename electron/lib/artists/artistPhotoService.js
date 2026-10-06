'use strict';

const fs = require('node:fs/promises');
const {
  MAX_ARTWORK_BYTES,
  downloadValidatedArtwork,
  hasValidArtworkDimensions,
  inspectArtworkImage,
} = require('../artwork/image');
const {
  clearArtistPhoto,
  isArtistId,
  isArtistPhotoRemoved,
  readArtistPhoto,
  writeArtistPhoto,
} = require('./artistPhotos');
const {
  fetchChannelAvatarUrl,
  isAllowedChannelAvatarUrl,
} = require('./channelAvatar');

// Photo intents for derived artists (ADR 0022). Automatic YouTube resolution
// runs one artist at a time and at most once per artist per app session.
function createArtistPhotoService({
  artistIndexCache,
  fetchAvatarUrl = fetchChannelAvatarUrl,
  downloadImage = downloadValidatedArtwork,
  readFile = fs.readFile,
  statFile = fs.stat,
}) {
  const attempted = new Set();
  let queue = Promise.resolve();

  function enqueue(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  async function resolveFromChannel(dir, tracks, artistId, { getRunner }) {
    if (!isArtistId(artistId)) {
      return { status: 'error', reason: 'invalid-artist' };
    }
    if (readArtistPhoto(dir, artistId)) return { status: 'ok', changed: false };
    if (isArtistPhotoRemoved(dir, artistId)) return { status: 'skipped' };
    const attemptKey = `${dir}\u0000${artistId}`;
    if (attempted.has(attemptKey)) return { status: 'skipped' };
    attempted.add(attemptKey);

    return enqueue(async () => {
      const channelId = await artistIndexCache.getPhotoChannel(
        dir,
        tracks,
        artistId,
      );
      if (!channelId) {
        return { status: 'unavailable', reason: 'no-official-channel' };
      }
      let runner;
      try {
        runner = await getRunner();
      } catch {
        return { status: 'unavailable', reason: 'provider-unavailable' };
      }
      const avatar = await fetchAvatarUrl(channelId, { runner });
      if (avatar.status !== 'ok') {
        return { status: 'unavailable', reason: avatar.reason };
      }
      const download = await downloadImage(avatar.url, {
        isAllowedUrl: isAllowedChannelAvatarUrl,
      });
      if (download.status !== 'ok') {
        return { status: 'unavailable', reason: download.reason };
      }
      // A local pick or removal while the request ran wins over YouTube.
      if (
        readArtistPhoto(dir, artistId) ||
        isArtistPhotoRemoved(dir, artistId)
      ) {
        return { status: 'ok', changed: false };
      }
      writeArtistPhoto(dir, artistId, {
        buffer: download.image.buffer,
        extension: download.image.extension,
        source: 'youtube-channel',
        channelId,
      });
      return { status: 'ok', changed: true };
    });
  }

  async function chooseLocal(dir, artistId, sourcePath) {
    if (!isArtistId(artistId)) {
      return { status: 'error', reason: 'invalid-artist' };
    }
    const stats = await statFile(sourcePath);
    if (!stats.isFile() || stats.size > MAX_ARTWORK_BYTES) {
      return { status: 'error', reason: 'invalid-image' };
    }
    const buffer = await readFile(sourcePath);
    const image = inspectArtworkImage(buffer);
    if (!image || !hasValidArtworkDimensions(image)) {
      return { status: 'error', reason: 'invalid-image' };
    }
    writeArtistPhoto(dir, artistId, {
      buffer,
      extension: image.extension,
      source: 'local-file',
    });
    return { status: 'ok', changed: true };
  }

  function clear(dir, artistId) {
    if (!isArtistId(artistId)) {
      return { status: 'error', reason: 'invalid-artist' };
    }
    clearArtistPhoto(dir, artistId);
    return { status: 'ok', changed: true };
  }

  return { chooseLocal, clear, resolveFromChannel };
}

module.exports = { createArtistPhotoService };
