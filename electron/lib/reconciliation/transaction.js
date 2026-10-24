'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { failure, record, readDocument } = require('./documents');

const JOURNAL = 'library-reconciliation-journal.json';
const FILES = new Set([
  'playlists.json',
  'library.json',
  'folder-page-assets.json',
]);
function durableWrite(target, raw) {
  const temporary = `${target}.tmp`;
  const handle = fs.openSync(temporary, 'w');
  try {
    fs.writeFileSync(handle, raw, 'utf8');
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(temporary, target);
}
function assertNoTransaction(dir) {
  require('../tags/transaction').assertNoTagTransaction(dir);
  if (fs.existsSync(path.join(dir, JOURNAL)))
    throw failure('RECONCILIATION_RECOVERY_REQUIRED');
}
function validateChanges(changes) {
  if (
    !Array.isArray(changes) ||
    !changes.length ||
    changes.length > FILES.size ||
    new Set(changes.map((c) => c.filename)).size !== changes.length
  )
    throw failure();
  for (const change of changes) {
    record(change, ['filename', 'before', 'after']);
    if (
      !FILES.has(change.filename) ||
      (change.before !== null && typeof change.before !== 'string') ||
      (change.after !== null && typeof change.after !== 'string')
    )
      throw failure();
    for (const raw of [change.before, change.after])
      if (raw !== null) {
        if (Buffer.byteLength(raw) > 32 * 1024 * 1024)
          throw failure('RECONCILIATION_LIMIT');
        try {
          record(JSON.parse(raw));
        } catch {
          throw failure();
        }
      }
  }
}
function currentRaw(dir, filename) {
  return readDocument(dir, filename).raw;
}
function install(dir, change) {
  const target = path.join(dir, change.filename);
  if (change.after === null) fs.rmSync(target, { force: true });
  else durableWrite(target, change.after);
}
// Journal is private, main-owned state. Validate the whole recovery set before
// changing any file; external edits must never be overwritten by recovery.
function recoverTransaction(dir) {
  const stored = readDocument(dir, JOURNAL);
  if (stored.raw === null) return { recovered: false };
  const journal = stored.data;
  record(journal, ['version', 'id', 'changes']);
  if (
    journal.version !== 1 ||
    typeof journal.id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(journal.id)
  )
    throw failure('RECONCILIATION_RECOVERY_REQUIRED');
  validateChanges(journal.changes);
  for (const change of journal.changes) {
    const raw = currentRaw(dir, change.filename);
    if (raw !== change.before && raw !== change.after)
      throw failure('RECONCILIATION_RECOVERY_CONFLICT');
  }
  for (const change of journal.changes)
    if (currentRaw(dir, change.filename) !== change.after) install(dir, change);
  fs.rmSync(path.join(dir, JOURNAL));
  return { recovered: true };
}
function commitDocuments(dir, changes, { afterWrite = () => {} } = {}) {
  assertNoTransaction(dir);
  validateChanges(changes);
  for (const change of changes)
    if (currentRaw(dir, change.filename) !== change.before)
      throw failure('RECONCILIATION_CONFLICT');
  fs.mkdirSync(dir, { recursive: true });
  const journal = JSON.stringify({
    version: 1,
    id: crypto.randomUUID(),
    changes,
  });
  if (Buffer.byteLength(journal) > 32 * 1024 * 1024)
    throw failure('RECONCILIATION_LIMIT');
  durableWrite(path.join(dir, JOURNAL), journal);
  for (const [index, change] of changes.entries()) {
    install(dir, change);
    afterWrite(index);
  }
  fs.rmSync(path.join(dir, JOURNAL));
}

module.exports = { commitDocuments, recoverTransaction, assertNoTransaction };
