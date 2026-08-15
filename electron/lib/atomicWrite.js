'use strict';

const fs = require('fs');

// Base .tmp + rename primitive; callers needing custom rename-failure
// handling (e.g. vocalSeparation.js's EPERM case) wrap this themselves.
function atomicWriteBuffer(filePath, buffer) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, filePath);
}

// Shared by config.js and library.js — both persist small JSON files that
// must never be left half-written if the process dies mid-save.
function atomicWriteJson(filePath, data) {
  atomicWriteBuffer(filePath, JSON.stringify(data, null, 2));
}

function atomicWriteText(filePath, text) {
  atomicWriteBuffer(filePath, Buffer.from(text, 'utf8'));
}

module.exports = { atomicWriteJson, atomicWriteText, atomicWriteBuffer };
