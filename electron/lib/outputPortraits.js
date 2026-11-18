'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { atomicWriteBuffer } = require('./atomicWrite');
const {
  MAX_ARTWORK_BYTES,
  hasValidArtworkDimensions,
  inspectArtworkImage,
} = require('./artwork/image');
const {
  buildArtistIndex,
  readSidecarTrackFacts,
} = require('./artists/artistIndex');
const { loadArtistOrganization } = require('./artists/artistOrganization');
const {
  readArtistPhoto,
  isArtistPhotoRemoved,
  resolveArtistPhotoPath,
} = require('./artists/artistPhotos');
const { loadIndex } = require('./library/metadataIndex');
const { resolveTrackAudioPath } = require('./library/paths');
const { isCutoutPortraitId } = require('../../shared/outputAppearance.mjs');

const PORTRAIT_DIR = 'output-portraits';
const PORTRAIT_EXTENSIONS = ['.png', '.webp'];

async function importOutputPortrait(directory, sourcePath) {
  const stats = await fsp.stat(sourcePath);
  if (!stats.isFile() || stats.size > MAX_ARTWORK_BYTES) return null;
  const buffer = await fsp.readFile(sourcePath);
  const image = inspectArtworkImage(buffer);
  if (
    buffer.length > MAX_ARTWORK_BYTES ||
    !image ||
    !PORTRAIT_EXTENSIONS.includes(image.extension) ||
    !hasValidArtworkDimensions(image)
  )
    return null;

  const root = path.join(await fsp.realpath(directory), PORTRAIT_DIR);
  fs.mkdirSync(root, { recursive: true });
  if ((await fsp.realpath(root)) !== root) return null;
  const id = randomUUID();
  atomicWriteBuffer(path.join(root, id + image.extension), buffer);
  return id;
}

async function resolveOutputPortrait(directory, id) {
  if (!isCutoutPortraitId(id)) return null;
  const root = path.join(await fsp.realpath(directory), PORTRAIT_DIR);
  for (const extension of PORTRAIT_EXTENSIONS) {
    const candidate = path.join(root, id + extension);
    const real = await fsp.realpath(candidate).catch(() => null);
    if (real === candidate) return candidate;
  }
  return null;
}

async function resolveTrackArtistPhoto(directory, trackId) {
  if (!resolveTrackAudioPath(directory, trackId)) return null;
  const entry = loadIndex(directory).tracks[trackId];
  if (!entry?.artist) return null;
  const track = {
    id: trackId,
    artist: entry.artist,
    artistCredits: entry.artistCredits,
  };
  const facts = track.artistCredits?.length
    ? null
    : await readSidecarTrackFacts(directory, track.id);
  const index = buildArtistIndex(
    [track],
    new Map([[track.id, facts?.parts]]),
    loadArtistOrganization(directory),
  );
  const artistId = index.trackArtistIds[track.id]?.[0];
  if (!artistId) return null;
  const artist = index.artists.find(({ id }) => id === artistId);
  const sources = isArtistPhotoRemoved(directory, artistId)
    ? [artistId]
    : [artistId, ...artist.sourceArtistIds];
  for (const source of new Set(sources)) {
    const photo = readArtistPhoto(directory, source);
    if (!photo) continue;
    const candidate = resolveArtistPhotoPath(directory, source, photo.filename);
    if (!candidate) continue;
    const root = await fsp.realpath(directory);
    const expected = path.join(root, path.relative(directory, candidate));
    if ((await fsp.realpath(candidate).catch(() => null)) === expected)
      return expected;
  }
  return null;
}

module.exports = {
  importOutputPortrait,
  resolveOutputPortrait,
  resolveTrackArtistPhoto,
};
