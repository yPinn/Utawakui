'use strict';
const {
  failure,
  record,
  identifier,
  digest,
  readDocument,
} = require('../reconciliation/documents');
const { inspectFlac } = require('./flac');
const KEYS = {
  title: 'TITLE',
  artist: 'ARTIST',
  album: 'ALBUM',
  albumArtist: 'ALBUMARTIST',
  releaseDate: 'DATE',
  trackNumber: 'TRACKNUMBER',
  trackTotal: 'TRACKTOTAL',
  discNumber: 'DISCNUMBER',
  discTotal: 'DISCTOTAL',
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function readTagLedger(dir) {
  const document = readDocument(dir, 'tag-writebacks.json', {
    version: 1,
    receipts: [],
  });
  record(document.data, ['version', 'receipts']);
  if (
    document.data.version !== 1 ||
    !Array.isArray(document.data.receipts) ||
    document.data.receipts.length > 200
  )
    throw failure('TAGS_LIMIT');
  const ids = new Set();
  for (const r of document.data.receipts) {
    record(r, [
      'id',
      'trackId',
      'backupId',
      'beforeHash',
      'afterHash',
      'essence',
      'createdAt',
      'fields',
      'collectionId',
      'position',
      'restoredFrom',
    ]);
    identifier(r.trackId);
    if (
      !UUID.test(r.id) ||
      !UUID.test(r.backupId) ||
      ids.has(r.id) ||
      !/^[a-f0-9]{64}$/.test(r.beforeHash) ||
      !/^[a-f0-9]{64}$/.test(r.afterHash) ||
      !/^[a-f0-9]{64}$/.test(r.essence) ||
      typeof r.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(r.createdAt)) ||
      !Array.isArray(r.fields) ||
      r.fields.some((f) => !Object.hasOwn(KEYS, f))
    )
      throw failure();
    ids.add(r.id);
    if (r.collectionId !== null) identifier(r.collectionId);
    if (
      r.position !== null &&
      (!Number.isSafeInteger(r.position) || r.position < 1 || r.position > 5000)
    )
      throw failure();
    if (r.restoredFrom !== undefined && !UUID.test(r.restoredFrom))
      throw failure();
  }
  return document;
}
function essence(bytes) {
  const parsed = inspectFlac(bytes);
  return digest(Buffer.concat([parsed.blocks[0].data, parsed.audio]));
}

module.exports = { KEYS, readTagLedger, essence };
