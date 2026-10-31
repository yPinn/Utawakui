'use strict';
const {
  isLrcMetadataLine,
  lrcTimestamps,
  normalizeLyricsNewlines,
} = require('../../../shared/lrcParsing.mjs');
const { parseLrcLines } = require('../lrclib/lrc.js');
const MAX_KRC_BYTES = 2 * 1024 * 1024;
const MAX_QUERY_CHARS = 256;
const MAX_LINES = 20000;
function containsControlCharacter(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function validText(value, required = true) {
  if (value === null && !required) return true;
  return (
    typeof value === 'string' &&
    (!required || value.trim().length > 0) &&
    value.length <= MAX_QUERY_CHARS &&
    !containsControlCharacter(value)
  );
}

function classifyKugouLrc(value, durationSeconds) {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value) > MAX_KRC_BYTES ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > 86400
  ) {
    return { status: 'error', reason: 'invalid-record' };
  }
  const rows = normalizeLyricsNewlines(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length > MAX_LINES)
    return { status: 'error', reason: 'response-too-large' };
  const tags = {};
  for (const row of rows) {
    // Native Kugou exports include these descriptive rows. They carry no
    // recording authority; ignore only this bounded allowlist, never timestamps.
    const extra = /^\[(?:hash|sign|qq|total):([^\]]*)\]$/iu.exec(row);
    if (
      extra &&
      extra[1].length <= MAX_QUERY_CHARS &&
      !containsControlCharacter(extra[1])
    )
      continue;
    if (isLrcMetadataLine(row)) {
      const tag = /^\[(ti|ar|offset):(.*)\]$/iu.exec(row);
      if (tag) {
        const key = tag[1].toLowerCase();
        const text = tag[2].trim();
        if ((key === 'ti' || key === 'ar') && !validText(text, false))
          return { status: 'error', reason: 'invalid-record' };
        if (Object.hasOwn(tags, key) && tags[key] !== text)
          return { status: 'error', reason: 'invalid-record' };
        tags[key] = text;
      }
      continue;
    }
    const times = lrcTimestamps(row);
    if (!times.length || times.some((start) => start > durationSeconds + 2))
      return { status: 'error', reason: 'invalid-record' };
  }
  const offsetMs = tags.offset === undefined ? 0 : Number(tags.offset);
  if (
    (tags.offset !== undefined && !/^[+-]?\d+$/u.test(tags.offset)) ||
    !Number.isSafeInteger(offsetMs) ||
    Math.abs(offsetMs) > 60000
  )
    return { status: 'error', reason: 'invalid-record' };
  const lines = parseLrcLines(value);
  if (
    lines.length < 2 ||
    lines.length > MAX_LINES ||
    new Set(lines.map((line) => line.text)).size < 2
  )
    return { status: 'error', reason: 'invalid-record' };
  return {
    status: 'ok',
    capability: 'T1',
    timingValidation: 'valid',
    lineCount: lines.length,
    offsetMs,
    tags,
  };
}

module.exports = { classifyKugouLrc };
