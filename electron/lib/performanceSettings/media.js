'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { hashAudioFile } = require('../works/trackBinding');
const {
  isStructuredAudioFilename,
  compareFilenames,
} = require('../library/paths');
const { failure } = require('./store');

function stamp(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
}
function originalMedia(dir, trackId) {
  // Root access errors must not turn an offline volume into an absent profile.
  fs.readdirSync(dir);
  const directory = path.join(dir, 'tracks', trackId);
  let names;
  try {
    names = fs.readdirSync(directory);
  } catch (error) {
    if (error.code === 'ENOENT') throw failure('PERFORMANCE_NOT_FOUND');
    throw error;
  }
  // A sidecar writer never traverses a track/parent link outside this library.
  if (fs.realpathSync(directory) !== directory)
    throw failure('PERFORMANCE_SOURCE_STALE');
  const name = names
    .filter(isStructuredAudioFilename)
    .sort(compareFilenames)[0];
  if (!name) throw failure('PERFORMANCE_NOT_FOUND');
  const file = path.join(directory, name);
  const info = fs.lstatSync(file, { bigint: true });
  if (!info.isFile() || info.nlink > 1n)
    throw failure('PERFORMANCE_SOURCE_STALE');
  const trackIdentity = stamp(fs.statSync(directory, { bigint: true }))
    .split(':')
    .slice(0, 2)
    .join(':');
  return {
    file,
    directory,
    trackIdentity,
    stamp: `${trackIdentity}/${stamp(info)}`,
  };
}
function createMediaVerifier(hashAudio = hashAudioFile) {
  const cache = new Map();
  async function verify(context, trackId, check) {
    const original = originalMedia(context.dir, trackId);
    const key = `${context.epoch}\0${original.file}`;
    const previous = cache.get(key);
    if (previous?.stamp === original.stamp)
      return { ...original, binding: previous.binding };
    const binding = await hashAudio(original.file);
    check();
    if (originalMedia(context.dir, trackId).stamp !== original.stamp)
      throw failure('PERFORMANCE_SOURCE_STALE');
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(key, { stamp: original.stamp, binding });
    return { ...original, binding };
  }
  return { verify, clear: () => cache.clear() };
}
module.exports = { originalMedia, createMediaVerifier };
