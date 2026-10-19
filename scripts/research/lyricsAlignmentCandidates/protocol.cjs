'use strict';
const { textCuts, lexicalUnits } = require('../lyricsAcoustic/protocol.cjs');
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const normalize = (text) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]/gu, '');
function sourceUnits(lines, language) {
  const units = [];
  for (const line of lines) {
    if (typeof line.text !== 'string' || line.text.length > 2000)
      throw Error('candidate text budget');
    for (const unit of lexicalUnits(line.text, language)) {
      let first = true;
      for (const char of normalize(unit.text)) {
        units.push({
          char,
          lineId: line.lineId,
          from: unit.from,
          boundary: first,
        });
        first = false;
      }
    }
  }
  if (units.length > 2048) throw Error('candidate text budget');
  return units;
}
function targetUnits(spans) {
  if (!Array.isArray(spans) || spans.length > 4096)
    throw Error('candidate span budget');
  const units = [];
  let previous = -1;
  for (const span of spans) {
    if (
      typeof span.text !== 'string' ||
      span.text.length > 8192 ||
      !Number.isFinite(span.start) ||
      !Number.isFinite(span.end) ||
      span.start < previous ||
      span.start < 0 ||
      span.end < span.start
    )
      throw Error('candidate clock');
    previous = span.start;
    let first = span.boundary !== false;
    for (const char of normalize(span.text)) {
      units.push({ char, start: span.start, boundary: first });
      first = false;
    }
  }
  if (units.length > 4096) throw Error('candidate span budget');
  return units;
}
// Only a match present at the same target index in every optimal path is usable.
function uniqueLcs(source, target) {
  const n = source.length,
    m = target.length,
    width = m + 1;
  if ((n + 1) * width > 4500000) throw Error('candidate alignment budget');
  const forward = new Uint16Array((n + 1) * width),
    backward = new Uint16Array((n + 1) * width);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++)
      forward[(i + 1) * width + j + 1] =
        source[i].char === target[j].char
          ? forward[i * width + j] + 1
          : Math.max(forward[i * width + j + 1], forward[(i + 1) * width + j]);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      backward[i * width + j] =
        source[i].char === target[j].char
          ? backward[(i + 1) * width + j + 1] + 1
          : Math.max(
              backward[(i + 1) * width + j],
              backward[i * width + j + 1],
            );
  const length = forward[n * width + m],
    result = new Map();
  for (let i = 0; i < n; i++) {
    const candidates = [];
    for (let j = 0; j < m; j++)
      if (
        source[i].char === target[j].char &&
        forward[i * width + j] + 1 + backward[(i + 1) * width + j + 1] ===
          length
      )
        candidates.push(j);
    // An optimal path may also omit this source character entirely.
    let skippable = false;
    for (let j = 0; j <= m; j++)
      if (forward[i * width + j] + backward[(i + 1) * width + j] === length) {
        skippable = true;
        break;
      }
    if (candidates.length === 1 && !skippable) result.set(i, candidates[0]);
  }
  return result;
}
function alignStarts(
  lines,
  spans,
  { mode, language = 'zh', windowStartMs = 0, offsetMs = 0 } = {},
) {
  if (
    !['exact', 'asr'].includes(mode) ||
    !Number.isSafeInteger(windowStartMs) ||
    !Number.isSafeInteger(offsetMs)
  )
    throw Error('candidate mapping intent');
  const source = sourceUnits(lines, language),
    target = targetUnits(spans),
    result = new Map(lines.map((l) => [l.lineId, new Map()]));
  let mapping;
  if (mode === 'exact') {
    if (
      source.map((u) => u.char).join('') !== target.map((u) => u.char).join('')
    )
      throw Error('candidate text mismatch');
    mapping = new Map(source.map((_u, i) => [i, i]));
  } else mapping = uniqueLcs(source, target);
  for (let i = 0; i < source.length; i++) {
    const unit = source[i],
      j = mapping.get(i);
    if (!unit.boundary || j === undefined || !target[j].boundary) continue;
    const line = lines.find((l) => l.lineId === unit.lineId);
    if (mode === 'asr') {
      const cuts = textCuts(line.text, language),
        end = cuts.find((c) => c > unit.from) ?? line.text.length;
      const indices = [];
      for (
        let k = i;
        k < source.length &&
        source[k].lineId === unit.lineId &&
        source[k].from < end;
        k++
      )
        indices.push(k);
      if (indices.some((k, index) => mapping.get(k) !== j + index)) continue;
    }
    result
      .get(unit.lineId)
      .set(
        unit.from,
        Math.round(target[j].start * 1000) + windowStartMs + offsetMs,
      );
  }
  return result;
}
function decodeWhisperTokens(
  document,
  durationSeconds,
  timestampSource = 'dtw-point',
) {
  if (!['dtw-point', 'token-start'].includes(timestampSource))
    throw Error('candidate whisper timestamp source');
  const tokens = document?.transcription?.flatMap((s) => s.tokens ?? []);
  if (
    !Array.isArray(tokens) ||
    tokens.length > 8192 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > 30
  )
    throw Error('candidate whisper budget');
  // v1.9.2 full JSON merges UTF-8 fragments. Treat each merged token as one
  // timestamped unit; normalization may skip its leading space/punctuation.
  if (timestampSource === 'token-start') {
    const spans = [];
    let bytes = 0;
    for (const token of tokens) {
      if (!Number.isInteger(token.id) || token.id < 0)
        throw Error('candidate whisper token');
      if (token.id >= 50257) continue;
      if (typeof token.text !== 'string')
        throw Error('candidate whisper token');
      const raw = Buffer.from(token.text, 'latin1');
      bytes += raw.length;
      if (bytes > 32768) throw Error('candidate whisper text budget');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      if (!normalize(text)) continue;
      const from = token.offsets?.from;
      if (
        !Number.isSafeInteger(from) ||
        from < 0 ||
        from > durationSeconds * 1000
      )
        throw Error('candidate whisper clock unavailable');
      spans.push({
        text,
        start: from / 1000,
        end: from / 1000,
        boundary: true,
      });
    }
    return spans;
  }
  const buffers = [],
    owners = [];
  let count = 0;
  for (const token of tokens) {
    if (!Number.isInteger(token.id) || token.id < 0)
      throw Error('candidate whisper token');
    if (token.id >= 50257) continue;
    if (
      typeof token.text !== 'string' ||
      !Number.isFinite(token.t_dtw) ||
      token.t_dtw < 0 ||
      token.t_dtw / 100 > durationSeconds
    )
      throw Error('candidate whisper time');
    const bytes = Buffer.from(token.text, 'latin1');
    if (count + bytes.length > 32768)
      throw Error('candidate whisper text budget');
    for (let i = 0; i < bytes.length; i++)
      owners.push({ start: token.t_dtw / 100, boundary: i === 0 });
    buffers.push(bytes);
    count += bytes.length;
  }
  const raw = Buffer.concat(buffers),
    text = new TextDecoder('utf-8', { fatal: true }).decode(raw),
    result = [];
  let offset = 0;
  for (const { segment } of graphemes.segment(text)) {
    const owner = owners[offset];
    if (!owner) throw Error('candidate whisper byte mapping');
    result.push({
      text: segment,
      start: owner.start,
      end: owner.start,
      boundary: owner.boundary,
    });
    offset += Buffer.byteLength(segment);
  }
  return result;
}
module.exports = { alignStarts, decodeWhisperTokens, uniqueLcs };
