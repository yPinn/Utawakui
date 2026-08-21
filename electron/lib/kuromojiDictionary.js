'use strict';

const path = require('path');

// kuromoji's own package root (not a fixed relative path), so this resolves
// correctly whether running from source, in dev mode, or packaged inside
// app.asar.unpacked — same require.resolve() trick as
// featureDependencies.js's getBundledYtdlpPath(). Deliberately its own tiny
// module rather than living in reading.js (which stays analyzer-agnostic by
// design) or readingWorker.js (whose top-level IIFE destructures
// `workerData` and crashes if the file is `require()`d outside a real
// Worker — this file has no such side effect, so tests can require it
// directly).
function getKuromojiDicPath() {
  return path.join(
    path.dirname(require.resolve('kuromoji/package.json')),
    'dict',
  );
}

module.exports = { getKuromojiDicPath };
