'use strict';

// Shared library-root JSON stores bound to each track's audio content.
const fs = require('node:fs');
const path = require('node:path');
const { createHmac, randomBytes, randomUUID } = require('node:crypto');
const { hashAudioFile } = require('../works/trackBinding');
const { isBoundedTrackId, resolveTrackAudioPath } = require('./paths');

const maxStoreBytes = 8 * 1024 * 1024;
const sha256Hex = /^[a-f0-9]{64}$/u;

function isStoreTrackId(id) {
  return (
    isBoundedTrackId(id) &&
    !['__proto__', 'prototype', 'constructor'].includes(id)
  );
}

function readJson(file, limit = maxStoreBytes, invalid = () => new Error()) {
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw invalid();
    const data = Buffer.alloc(stat.size + 1);
    if (fs.readSync(fd, data, 0, data.length, 0) !== stat.size) throw invalid();
    return JSON.parse(
      data
        .subarray(0, stat.size)
        .toString('utf8')
        .replace(/^\uFEFF/u, ''),
    );
  } finally {
    fs.closeSync(fd);
  }
}

function readTrackStore(dir, filename, { name, invalid }) {
  let doc;
  try {
    doc = readJson(path.join(dir, filename), maxStoreBytes, invalid);
  } catch (error) {
    if (error.code === 'ENOENT') return Object.create(null);
    throw new Error(`Unable to read the ${name} store`, { cause: error });
  }
  if (
    doc?.version !== 1 ||
    !doc.tracks ||
    typeof doc.tracks !== 'object' ||
    Array.isArray(doc.tracks)
  )
    throw new Error(`Invalid ${name} store`);
  return Object.assign(Object.create(null), doc.tracks);
}

function writeTrackStore(dir, filename, tracks, { name }) {
  const document = JSON.stringify({ version: 1, tracks }, null, 2);
  if (Buffer.byteLength(document) > maxStoreBytes)
    throw new Error(`${name} store exceeds size limit`);
  const target = path.join(dir, filename);
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, document, { flag: 'wx' });
  try {
    fs.renameSync(temporary, target);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

// Scope checks, audio binding and per-service edit tokens for one store.
function createTrackBinding({
  getLibraryContext,
  hashAudio = hashAudioFile,
  invalid,
}) {
  const secret = randomBytes(32);

  function checkScope(scope) {
    const current = getLibraryContext();
    if (scope.dir !== current.dir || scope.epoch !== current.epoch)
      throw invalid('stale');
  }

  async function audioBinding(scope, trackId) {
    if (!isStoreTrackId(trackId)) throw invalid();
    const file = resolveTrackAudioPath(scope.dir, trackId);
    if (!file) return null;
    try {
      const root = fs.realpathSync(scope.dir);
      const canonical = fs.realpathSync(file);
      if (path.relative(root, canonical) !== path.relative(scope.dir, file))
        return null;
      const { value } = await hashAudio(canonical, {
        check: () => checkScope(scope),
      });
      checkScope(scope);
      return value;
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'WORKS_STALE') return null;
      throw error;
    }
  }

  function editToken(scope, trackId, audio, edit) {
    return createHmac('sha256', secret)
      .update(
        JSON.stringify([scope.epoch, scope.dir, trackId, audio, edit || null]),
      )
      .digest('hex');
  }

  return { checkScope, audioBinding, editToken };
}

module.exports = {
  createTrackBinding,
  isStoreTrackId,
  readJson,
  readTrackStore,
  sha256Hex,
  writeTrackStore,
};
