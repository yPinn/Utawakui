'use strict';

const fs = require('fs');

// Base .tmp + rename primitive; callers needing custom rename-failure
// handling (e.g. vocalSeparation.js's EPERM case) wrap this themselves.
function atomicWriteBuffer(filePath, buffer) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, filePath);
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
  backupCorrupted,
};
