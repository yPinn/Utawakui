'use strict';

const fs = require('fs');

// Shared by config.js and library.js — both persist small JSON files that
// must never be left half-written if the process dies mid-save.
function atomicWriteJson(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

module.exports = { atomicWriteJson };
