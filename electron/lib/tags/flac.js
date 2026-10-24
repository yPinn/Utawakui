'use strict';

const { failure, record } = require('../reconciliation/documents');
const { hasControlCharacters } = require('../textGuards');
const MAX_TAG_BYTES = 16 * 1024 ** 2;
const KEYS = new Set([
  'TITLE',
  'ARTIST',
  'ALBUM',
  'ALBUMARTIST',
  'ALBUM ARTIST',
  'DATE',
  'TRACKNUMBER',
  'TRACKTOTAL',
  'TOTALTRACKS',
  'DISCNUMBER',
  'DISCTOTAL',
  'TOTALDISCS',
]);
const decoder = new TextDecoder('utf-8', { fatal: true });
const unsupported = () => failure('TAGS_UNSUPPORTED');

// Native FLAC only. STREAMINFO and every non-comment block are opaque and
// retained verbatim. The audio-frame suffix is never decoded or reserialized.
function inspectFlac(bytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length > 256 * 1024 ** 2 ||
    bytes.toString('ascii', 0, 4) !== 'fLaC'
  )
    throw unsupported();
  const blocks = [];
  let offset = 4,
    last = false,
    commentBlock;
  while (!last) {
    if (
      offset + 4 > bytes.length ||
      blocks.length >= 128 ||
      offset > MAX_TAG_BYTES
    )
      throw unsupported();
    const type = bytes[offset] & 127;
    last = Boolean(bytes[offset] & 128);
    const length = bytes.readUIntBE(offset + 1, 3);
    offset += 4;
    if (
      type === 127 ||
      offset + length > bytes.length ||
      offset + length > MAX_TAG_BYTES ||
      (!blocks.length && (type !== 0 || length !== 34)) ||
      (blocks.length && type === 0)
    )
      throw unsupported();
    const data = bytes.subarray(offset, offset + length);
    blocks.push({ type, data });
    if (type === 4) {
      if (commentBlock) throw unsupported();
      commentBlock = data;
    }
    offset += length;
  }
  if (
    offset + 2 >= bytes.length ||
    bytes[offset] !== 255 ||
    (bytes[offset + 1] & 254) !== 248
  )
    throw unsupported();
  let vendor = Buffer.from('Utawakui'),
    comments = [];
  if (commentBlock) {
    let pos = 0;
    const length = () => {
      if (pos + 4 > commentBlock.length) throw unsupported();
      const size = commentBlock.readUInt32LE(pos);
      pos += 4;
      return size;
    };
    const read = () => {
      const size = length();
      if (pos + size > commentBlock.length) throw unsupported();
      const result = commentBlock.subarray(pos, pos + size);
      pos += size;
      return result;
    };
    vendor = read();
    const count = length();
    if (count > 50000) throw unsupported();
    for (let i = 0; i < count; i++) {
      let text;
      try {
        text = decoder.decode(read());
      } catch {
        throw unsupported();
      }
      const separator = text.indexOf('=');
      if (
        separator < 1 ||
        !/^[\x20-\x3c\x3e-\x7d]+$/.test(text.slice(0, separator))
      )
        throw unsupported();
      comments.push(text);
    }
    if (pos !== commentBlock.length) throw unsupported();
  }
  return { blocks, vendor, comments, audio: bytes.subarray(offset) };
}
function sized(value) {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(value.length);
  return Buffer.concat([size, value]);
}
function editFlacComments(bytes, changes) {
  record(changes);
  if (!Object.keys(changes).length) throw failure();
  for (const [key, values] of Object.entries(changes)) {
    if (
      !KEYS.has(key) ||
      !Array.isArray(values) ||
      values.length > 16 ||
      values.some(
        (v) =>
          typeof v !== 'string' ||
          !v ||
          v.length > 500 ||
          hasControlCharacters(v),
      )
    )
      throw failure();
  }
  const before = inspectFlac(bytes);
  const comments = before.comments.filter(
    (v) => !Object.hasOwn(changes, v.slice(0, v.indexOf('=')).toUpperCase()),
  );
  for (const [key, values] of Object.entries(changes))
    for (const value of values) comments.push(`${key}=${value}`);
  const count = Buffer.alloc(4);
  count.writeUInt32LE(comments.length);
  const data = Buffer.concat([
    sized(before.vendor),
    count,
    ...comments.map((v) => sized(Buffer.from(v))),
  ]);
  if (data.length > MAX_TAG_BYTES - 1024) throw failure('TAGS_LIMIT');
  const blocks = before.blocks.map((b) =>
    b.type === 4 ? { type: 4, data } : b,
  );
  if (!blocks.some((b) => b.type === 4)) blocks.push({ type: 4, data });
  const parts = [Buffer.from('fLaC')];
  for (const [i, b] of blocks.entries()) {
    const header = Buffer.alloc(4);
    header[0] = b.type | (i === blocks.length - 1 ? 128 : 0);
    header.writeUIntBE(b.data.length, 1, 3);
    parts.push(header, b.data);
  }
  parts.push(before.audio);
  const output = Buffer.concat(parts);
  const after = inspectFlac(output);
  if (!after.audio.equals(before.audio) || !after.vendor.equals(before.vendor))
    throw failure('TAGS_VERIFICATION_FAILED');
  return output;
}
module.exports = { inspectFlac, editFlacComments };
