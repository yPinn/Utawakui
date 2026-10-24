'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isBoundedTrackId } = require('../library/paths');
const { INDEX_VERSION } = require('../library/constants');

function failure(code = 'RECONCILIATION_INVALID') {
  return Object.assign(new Error('Library reconciliation failed.'), { code });
}
function record(value, fields) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some(
      (key) =>
        ['__proto__', 'constructor', 'prototype'].includes(key) ||
        (fields && !fields.includes(key)),
    )
  )
    throw failure();
  return value;
}
function identifier(value) {
  if (
    !isBoundedTrackId(value) ||
    ['__proto__', 'constructor', 'prototype'].includes(value)
  )
    throw failure();
  return value;
}
function digest(value) {
  return crypto
    .createHash('sha256')
    .update(
      typeof value === 'string' || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value),
    )
    .digest('hex');
}
function readDocument(dir, filename, fallback = null) {
  let raw;
  try {
    const filenamePath = path.join(dir, filename);
    if (fs.statSync(filenamePath).size > 32 * 1024 * 1024)
      throw failure('RECONCILIATION_UNAVAILABLE');
    raw = fs.readFileSync(filenamePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT')
      return { raw: null, data: fallback, fingerprint: digest('absent') };
    throw error;
  }
  let data;
  try {
    data = JSON.parse(raw);
    record(data);
  } catch (cause) {
    throw Object.assign(failure('RECONCILIATION_UNAVAILABLE'), { cause });
  }
  return { raw, data, fingerprint: digest(raw) };
}
function readSnapshot(dir) {
  const playlists = readDocument(dir, 'playlists.json', {
    version: 4,
    playlists: [],
  });
  const index = readDocument(dir, 'library.json', { version: 2, tracks: {} });
  if (
    !Number.isInteger(index.data.version ?? 1) ||
    (index.data.version ?? 1) < 1 ||
    (index.data.version ?? 1) > INDEX_VERSION
  )
    throw failure('RECONCILIATION_UNAVAILABLE');
  if (
    !Array.isArray(playlists.data.playlists) ||
    playlists.data.playlists.length > 500 ||
    !Number.isInteger(playlists.data.version ?? 1) ||
    (playlists.data.version ?? 1) < 1 ||
    (playlists.data.version ?? 1) > 4
  )
    throw failure('RECONCILIATION_UNAVAILABLE');
  record(index.data.tracks);
  for (const [id, entry] of Object.entries(index.data.tracks)) {
    identifier(id);
    record(entry);
  }
  const ids = new Set();
  for (const entry of playlists.data.playlists) {
    record(entry);
    identifier(entry.id);
    if (ids.has(entry.id)) throw failure('RECONCILIATION_UNAVAILABLE');
    ids.add(entry.id);
  }
  return { playlists, index };
}

module.exports = {
  failure,
  record,
  identifier,
  digest,
  readDocument,
  readSnapshot,
};
