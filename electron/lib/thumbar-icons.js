'use strict';

const zlib = require('zlib');

const GLYPHS = ['play', 'pause', 'prev', 'next'];

// Rendered at 4x and box-downsampled — a plain point-in-shape test at
// native resolution leaves visibly jagged diagonal edges on the play/skip
// triangles at the small sizes (16-32px) taskbar thumbar buttons use.
const SUPERSAMPLE = 4;

function sign(px, py, ax, ay, bx, by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function inRect(px, py, x0, y0, x1, y1) {
  return px >= x0 && px <= x1 && py >= y0 && py <= y1;
}

// All shapes defined on a normalized 0..1 square, y-down (matches PNG row
// order) so no flip is needed when rasterizing.
function isInsideGlyph(glyph, x, y) {
  switch (glyph) {
    case 'play':
      return inTriangle(x, y, 0.28, 0.22, 0.28, 0.78, 0.78, 0.5);
    case 'pause':
      return (
        inRect(x, y, 0.28, 0.22, 0.42, 0.78) ||
        inRect(x, y, 0.58, 0.22, 0.72, 0.78)
      );
    case 'next':
      return (
        inTriangle(x, y, 0.2, 0.22, 0.2, 0.78, 0.56, 0.5) ||
        inRect(x, y, 0.62, 0.22, 0.72, 0.78)
      );
    case 'prev':
      return (
        inTriangle(x, y, 0.8, 0.22, 0.8, 0.78, 0.44, 0.5) ||
        inRect(x, y, 0.28, 0.22, 0.38, 0.78)
      );
    default:
      throw new Error(`unknown thumbar glyph: ${glyph}`);
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

// Minimal PNG encoder (8-bit RGBA, single IDAT) rather than
// nativeImage.createFromBitmap — that API's raw pixel layout is
// undocumented/platform-dependent; createFromBuffer decoding a real PNG has
// a checkable format instead.
function encodePng(width, height, rgbaRows) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method
  const idatData = zlib.deflateSync(rgbaRows);
  return Buffer.concat([
    signature,
    buildChunk('IHDR', ihdrData),
    buildChunk('IDAT', idatData),
    buildChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Straight-alpha (non-premultiplied) RGBA — PNG's own convention. Color is
// solid; only per-pixel alpha varies, carrying the anti-aliased edge.
function renderGlyphPng(glyph, options = {}) {
  const size = options.size ?? 24;
  const color = options.color ?? { r: 255, g: 255, b: 255 };
  const big = size * SUPERSAMPLE;

  const alpha = new Float32Array(size * size);
  for (let oy = 0; oy < size; oy++) {
    for (let ox = 0; ox < size; ox++) {
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        const ny = (oy * SUPERSAMPLE + sy + 0.5) / big;
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const nx = (ox * SUPERSAMPLE + sx + 0.5) / big;
          if (isInsideGlyph(glyph, nx, ny)) hits++;
        }
      }
      alpha[oy * size + ox] = hits / (SUPERSAMPLE * SUPERSAMPLE);
    }
  }

  const raw = Buffer.alloc(size * (1 + size * 4));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter type: none, for this row
    for (let x = 0; x < size; x++) {
      raw[offset++] = color.r;
      raw[offset++] = color.g;
      raw[offset++] = color.b;
      raw[offset++] = Math.round(alpha[y * size + x] * 255);
    }
  }

  return encodePng(size, size, raw);
}

module.exports = { renderGlyphPng, GLYPHS };
