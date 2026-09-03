'use strict';

const fs = require('fs');

// Base .tmp + rename primitive; callers needing custom rename-failure
// handling (e.g. vocalSeparation.js's EPERM case) wrap this themselves.
// No fsync: this is called once per track inside backfill/import batch
// loops (via atomicWriteJson), where a blocking disk flush per item would
// stall the whole batch. The rename itself is still atomic on Windows, so a
// concurrent reader never observes a half-written file — only a genuine
// power loss between write and rename could lose the update, which is an
// accepted gap here (see atomicCopyFileSync for the case that does fsync).
function atomicWriteBuffer(filePath, buffer) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, filePath);
}

// Same tmp + rename primitive as atomicWriteBuffer, for callers copying an
// existing file (e.g. a user-picked image) instead of writing bytes already
// in memory — avoids reading large sources fully into memory just to reuse
// atomicWriteBuffer. Every caller is a one-off file-picker action, not a
// per-item batch loop, so the extra fsync here is cheap and worth the
// durability it buys for artwork/cover files.
function atomicCopyFileSync(sourcePath, targetPath) {
  const tmpPath = `${targetPath}.tmp`;
  fs.copyFileSync(sourcePath, tmpPath);
  const fd = fs.openSync(tmpPath, 'r+');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, targetPath);
}

// Shared by callers that persist small JSON files which must never be left
// half-written if the process dies mid-save.
function atomicWriteJson(filePath, data) {
  atomicWriteBuffer(filePath, JSON.stringify(data, null, 2));
}

function atomicWriteText(filePath, text) {
  atomicWriteBuffer(filePath, Buffer.from(text, 'utf8'));
}

// Shared by callers that preserve unreadable/corrupted data files (which
// can't be regenerated) by renaming them aside, best-effort, rather than
// silently overwriting them with defaults on the next save.
function backupCorrupted(filePath) {
  const backupPath = `${filePath}.corrupted-${Date.now()}`;
  try {
    fs.renameSync(filePath, backupPath);
  } catch {
    // best-effort — if even the rename fails, just fall through to defaults
  }
}

module.exports = {
  atomicWriteJson,
  atomicWriteText,
  atomicWriteBuffer,
  atomicCopyFileSync,
  backupCorrupted,
};
