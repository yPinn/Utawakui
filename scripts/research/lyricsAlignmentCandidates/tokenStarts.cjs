'use strict';
function partialTokenStarts(document, durationSeconds) {
  const tokens = document?.transcription?.flatMap((s) => s.tokens ?? []);
  if (
    !Array.isArray(tokens) ||
    tokens.length > 8192 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > 30
  )
    throw Error('replay token budget');
  const spans = [];
  let bytes = 0,
    previous = 0,
    missing = 0;
  for (const token of tokens) {
    if (!Number.isInteger(token.id) || token.id < 0)
      throw Error('replay token id');
    if (token.id >= 50257) continue;
    if (typeof token.text !== 'string') throw Error('replay token text');
    const raw = Buffer.from(token.text, 'latin1');
    bytes += raw.length;
    if (bytes > 32768) throw Error('replay byte budget');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    if (!text.normalize('NFKC').replace(/[^\p{L}\p{M}\p{N}]/gu, '')) continue;
    const from = token.offsets?.from;
    const valid =
      Number.isSafeInteger(from) &&
      from >= 0 &&
      from / 1000 >= previous &&
      from / 1000 <= durationSeconds;
    if (valid) previous = from / 1000;
    else missing++;
    // An untimed token retains its text in the LCS, but exposes no boundary.
    // The placeholder clock is never eligible to become a cut; no clamp/DTW fallback.
    spans.push({ text, start: previous, end: previous, boundary: valid });
  }
  return { spans, missing };
}

module.exports = { partialTokenStarts };
