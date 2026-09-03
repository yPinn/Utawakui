'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { MIME_TYPES } = require('./constants');

// Real HTTP Range/206 support — net.fetch(pathToFileURL(...)) looks like it
// should provide this but doesn't: given a Range header it silently slices
// the body yet still returns 200 with no Content-Range, which <audio> reads
// as "the whole file is this short" (every seek jumped back to 0). Verified
// byte-for-byte against fs.readFileSync of the same range — don't revert to
// net.fetch(file://...) without re-verifying.
function buildRangeResponse(filePath, rangeHeader) {
  const stat = fs.statSync(filePath);

  // An empty file has no bytes to slice: end = stat.size - 1 would be -1,
  // and createReadStream(path, { start: 0, end: -1 }) throws ERR_OUT_OF_RANGE
  // synchronously, which the caller's catch collapses into a misleading
  // "file missing" 404 for a file that actually exists (just empty/corrupt).
  if (stat.size === 0) {
    if (rangeHeader) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': 'bytes */0' },
      });
    }
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()],
        'Content-Length': '0',
        'Accept-Ranges': 'bytes',
      },
    });
  }

  let start = 0;
  let end = stat.size - 1;
  let status = 200;

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (match && (match[1] !== '' || match[2] !== '')) {
      if (match[1] === '') {
        const suffixLength = Number(match[2]);
        start = Math.max(stat.size - suffixLength, 0);
      } else {
        start = Number(match[1]);
        if (match[2] !== '') end = Math.min(Number(match[2]), stat.size - 1);
      }
      status = 206;
    }
  }

  // start > end covers both a malformed range (bytes=5-3) and a range
  // entirely past EOF (start clamped past stat.size - 1 while end stays at
  // stat.size - 1) — createReadStream throws ERR_OUT_OF_RANGE for either,
  // which the caller's catch collapses into an indistinguishable 404. A
  // spec-correct 416 lets the client (or a stale/racing seek right after a
  // file-size-changing separation swap) recover instead of reading "file
  // doesn't exist".
  if (status === 206 && (start > end || start >= stat.size)) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${stat.size}` },
    });
  }

  const stream = fs.createReadStream(filePath, { start, end });
  const headers = {
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()],
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
  };
  if (status === 206) {
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }

  return new Response(Readable.toWeb(stream), { status, headers });
}

module.exports = {
  buildRangeResponse,
};
