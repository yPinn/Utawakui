// Conservative display candidates, not a semantic model or a pause detector.
let glyphs = null;
const latin = /\p{Script=Latin}/u;
const cjk =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const openings = new Map([
  ['(', ')'],
  ['（', '）'],
  ['「', '」'],
  ['『', '』'],
  ['“', '”'],
  ['[', ']'],
]);
const closings = new Set(openings.values());
const width = (value) =>
  [...glyphs.segment(value)].reduce(
    (sum, { segment }) =>
      sum + (/\p{L}|\p{N}/u.test(segment) ? (cjk.test(segment) ? 2 : 1) : 0),
    0,
  );

function candidateRanges(text) {
  if (!latin.test(text) || !cjk.test(text)) return null;
  const prefix = new Map([[0, 0]]);
  let total = 0;
  for (const part of glyphs.segment(text)) {
    total += width(part.segment);
    prefix.set(part.index + part.segment.length, total);
  }
  if (total < 36) return null;
  const safe = new Set([0]),
    stack = [],
    candidates = new Map();
  for (const part of glyphs.segment(text)) {
    const ch = part.segment;
    if (openings.has(ch)) stack.push(openings.get(ch));
    else if (closings.has(ch) && stack.pop() !== ch) return null;
    if (!stack.length) safe.add(part.index + ch.length);
  }
  if (stack.length) return null;
  const add = (at, basis, rank) => {
    while (at < text.length && /\s/u.test(text[at])) at++;
    if (!safe.has(at) || at <= 0 || at >= text.length) return;
    const a = prefix.get(at),
      b = total - a;
    if (Math.min(a, b) < 8 || Math.min(a, b) / (a + b) < 0.22) return;
    const score = rank - Math.abs(a - b) / (a + b);
    if (!candidates.has(at) || candidates.get(at).score < score)
      candidates.set(at, { at, basis, score });
  };
  for (const match of text.matchAll(/[，、。！？!?;；,]|\r?\n/gu))
    add(
      match.index + match[0].length,
      match[0].includes('\n') ? 'authored' : 'punctuation',
      3,
    );
  // A lone borrowed word is not a clause. Keep apostrophes within Latin words.
  for (const match of text.matchAll(
    /\p{Script=Latin}[\p{Script=Latin}\p{M}'’]*(?:[ \t]+\p{Script=Latin}[\p{Script=Latin}\p{M}'’]*)*/gu,
  )) {
    if (match[0].split(/[ \t]+/u).length < 2 || width(match[0]) < 8) continue;
    add(match.index, 'language-transition', 2);
    add(match.index + match[0].length, 'language-transition', 2);
  }
  const best = [...candidates.values()].sort(
    (a, b) => b.score - a.score || a.at - b.at,
  )[0];
  return best ? { at: best.at, basis: best.basis } : null;
}

export function planLyricsPhrases(line) {
  const text = line?.text;
  const unchanged = { status: 'unchanged', phrases: [] };
  if (
    typeof Intl?.Segmenter !== 'function' ||
    typeof text !== 'string' ||
    text.length > 2000
  )
    return unchanged;
  glyphs ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const candidate = candidateRanges(text);
  if (!candidate) return unchanged;
  const phrases = [
    [0, candidate.at],
    [candidate.at, text.length],
  ].map(([sourceStart, sourceEnd]) => ({
    text: text.slice(sourceStart, sourceEnd),
    sourceStart,
    sourceEnd,
    startMs: null,
    endMs: null,
  }));
  const unresolved = (reason) => ({
    status: 'unresolved',
    reason,
    basis: candidate.basis,
    timingSource: null,
    phrases,
  });
  // A coarse or invalid native T2 must never be replaced by model timing.
  const native = Array.isArray(line.segments) && line.segments.length > 0;
  const segments = native
    ? line.segments
    : line.estimatedStarts?.version === 1
      ? line.estimatedStarts.segments
      : null;
  if (!Array.isArray(segments) || !segments.length)
    return unresolved('timing-missing');
  if (
    segments.length > 1000 ||
    !Number.isSafeInteger(line.startMs) ||
    !Number.isSafeInteger(line.endMs) ||
    line.endMs <= line.startMs
  )
    return unresolved('timing-invalid');
  let cursor = 0,
    previous = -Infinity,
    boundary = null;
  for (const segment of segments) {
    if (
      !segment ||
      typeof segment.text !== 'string' ||
      !segment.text.length ||
      !Number.isSafeInteger(segment.startMs) ||
      segment.startMs < line.startMs ||
      segment.startMs >= line.endMs ||
      segment.startMs < previous ||
      text.slice(cursor, cursor + segment.text.length) !== segment.text
    )
      return unresolved('timing-invalid');
    if (
      native &&
      (!Number.isSafeInteger(segment.endMs) ||
        segment.endMs <= segment.startMs ||
        segment.endMs > line.endMs)
    )
      return unresolved('timing-invalid');
    if (cursor === candidate.at) boundary = segment.startMs;
    cursor += segment.text.length;
    previous = segment.startMs;
  }
  if (cursor !== text.length) return unresolved('timing-invalid');
  if (boundary === null) return unresolved('boundary-unmapped');
  const first = segments[0].startMs;
  if (boundary - first < 1200 || line.endMs - boundary < 1200)
    return unresolved('timing-too-short');
  if (native) {
    let offset = 0;
    for (const segment of segments) {
      if (offset < candidate.at && segment.endMs > boundary)
        return unresolved('timing-overlap');
      offset += segment.text.length;
    }
  }
  return {
    status: 'ready',
    basis: candidate.basis,
    timingSource: native ? 't2' : 'model-starts',
    phrases: phrases.map((phrase, index) => ({
      ...phrase,
      startMs: index ? boundary : first,
      endMs: index ? line.endMs : boundary,
    })),
  };
}
