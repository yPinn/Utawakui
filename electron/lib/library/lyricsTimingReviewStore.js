'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { atomicWriteJson } = require('../atomicWrite');
const { isLyricsSubtitleFilename } = require('./paths');
const { validateTrackBinding } = require('../works/trackBinding');

function failure(code = 'LYRICS_SOURCE_INVALID') {
  return Object.assign(new Error(code), { code });
}
function reviewPath(trackDir, filename) {
  if (!isLyricsSubtitleFilename(filename) || filename.length > 240)
    throw failure();
  const file = path.join(trackDir, 'lyrics', 'review', `${filename}.json`);
  const parent = path.dirname(file);
  if (fs.existsSync(parent) && fs.realpathSync(parent) !== parent)
    throw failure('LYRICS_SOURCE_STALE');
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.nlink > 1 || fs.realpathSync(file) !== file)
      throw failure('LYRICS_SOURCE_STALE');
  }
  return file;
}
function validDocument(value) {
  const snapshot = value?.snapshot,
    coverage = snapshot?.coverage;
  try {
    validateTrackBinding(snapshot?.mediaBinding);
  } catch {
    return false;
  }
  return (
    value.schemaVersion === 1 &&
    /^[a-f0-9-]{36}$/.test(value.revision) &&
    ['confirmed', 'expired', 'revoked'].includes(value.state) &&
    Number.isSafeInteger(value.confirmedAt) &&
    value.confirmedAt > 0 &&
    Number.isSafeInteger(value.changedAt) &&
    value.changedAt >= value.confirmedAt &&
    ['sourceRevision', 'timingRevision'].every((key) =>
      /^[a-f0-9]{64}$/.test(snapshot[key]),
    ) &&
    ['documentId', 'profileId', 'trackIdentity'].every(
      (key) =>
        typeof snapshot[key] === 'string' &&
        snapshot[key].length > 0 &&
        snapshot[key].length <= 256,
    ) &&
    Number.isInteger(snapshot.offsetMs) &&
    Math.abs(snapshot.offsetMs) <= 3600000 &&
    coverage &&
    ['total', 'timed', 'segmented'].every(
      (key) =>
        Number.isSafeInteger(coverage[key]) &&
        coverage[key] >= 0 &&
        coverage[key] <= 10000,
    ) &&
    coverage.timed > 0 &&
    coverage.timed <= coverage.total &&
    coverage.segmented <= coverage.timed
  );
}
function readReview(trackDir, filename) {
  const file = reviewPath(trackDir, filename);
  let raw;
  try {
    if (fs.statSync(file).size > 32768) return { status: 'corrupt' };
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT')
      return { status: 'unconfirmed', raw: null, document: null };
    throw error;
  }
  let document;
  try {
    document = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', raw };
  }
  if (document?.schemaVersion !== 1) return { status: 'unsupported', raw };
  if (!validDocument(document)) return { status: 'corrupt', raw };
  return { status: document.state, raw, document };
}
function writeReview(trackDir, filename, previous, update) {
  const current = readReview(trackDir, filename);
  if (['corrupt', 'unsupported'].includes(current.status))
    throw failure('LYRICS_SOURCE_UNUSABLE');
  if (current.raw !== previous.raw) throw failure('LYRICS_SOURCE_CONFLICT');
  const document = { ...update, schemaVersion: 1, revision: randomUUID() };
  if (!validDocument(document)) throw failure();
  const file = reviewPath(trackDir, filename);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteJson(file, document);
  return readReview(trackDir, filename);
}
function invalidateReview(value) {
  const previous = readReview(value.trackDir, value.filename);
  if (previous.status !== 'confirmed') return;
  writeReview(value.trackDir, value.filename, previous, {
    ...previous.document,
    state: 'expired',
    changedAt: Date.now(),
  });
}
function deleteReview(trackDir, filename) {
  const file = reviewPath(trackDir, filename);
  try {
    fs.unlinkSync(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
module.exports = {
  readReview,
  writeReview,
  invalidateReview,
  deleteReview,
  failure,
};
