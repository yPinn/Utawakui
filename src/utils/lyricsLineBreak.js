// Display-only phrase break for long merged lyric lines; never alters text.
// CJK, kana, Hangul and full-width forms count as one em; the rest ~0.55em.
const WIDE_SCRIPT =
  /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}…]/u;
// ASCII . , ! ? only break via the space that follows them.
const CLOSING = /[。．！？、，…」』）)】〕〉》]/u;
const OPENING = /[「『（(【〔〈《]/u;
const SPACE = /\s/u;

export const LYRICS_LINE_BREAK_FILL = 0.8;
const MIN_SIDE_SHARE = 0.25;

function charWidth(char) {
  const code = char.charCodeAt(0);
  const wide =
    WIDE_SCRIPT.test(char) ||
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0xff01 && code <= 0xff60);
  return wide ? 1 : 0.55;
}

function isSurrogate(char) {
  const code = char.charCodeAt(0);
  return code >= 0xd800 && code <= 0xdfff;
}

function candidateAt(text, offset) {
  const before = text[offset - 1];
  const after = text[offset];
  if (SPACE.test(after)) return false;
  if (SPACE.test(before)) return true;
  if (CLOSING.test(before)) return !CLOSING.test(after);
  return OPENING.test(after) && !OPENING.test(before);
}

// Kinsoku: these never start a display line; Latin words only split at spaces.
const NO_LINE_START =
  /[\s。．！？、，…」』）)】〕〉》ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶー々゛゜]/u;
const LATIN = /[\p{scx=Latin}\d]/u;
const HIRAGANA = /\p{scx=Hiragana}/u;
const HAN_OR_KATAKANA = /[\p{scx=Han}\p{scx=Katakana}]/u;
// Share of the column a half may fill: estimates run ~5% off real glyphs,
// measured glyphs only need room for subpixel rounding.
const ESTIMATED_FIT = 0.95;
const MEASURED_FIT = 0.98;
// Extra cost (em) of a mid-phrase break that is not a kana -> kanji/katakana
// turn, which usually marks the next word in Japanese.
const ROUGH_BREAK_COST = 3;

function forcedBreakAt(text, offset) {
  const before = text[offset - 1];
  const after = text[offset];
  if (NO_LINE_START.test(after) || OPENING.test(before)) return false;
  if (LATIN.test(before) && LATIN.test(after)) return false;
  const code = after.charCodeAt(0);
  return code < 0xdc00 || code > 0xdfff;
}

/**
 * Picks one break offset for a line that would fill more than
 * LYRICS_LINE_BREAK_FILL of `capacity` (em), so it shows on at most two lines.
 * Prefers a space or punctuation break nearest the middle whose halves both
 * fit; otherwise one mid-phrase break that fits, ideally at a word turn. Never
 * splits a reading segment and keeps each side >= 25%. Returns null when the
 * line fits or no balanced break exists. Widths are estimated unless `measure`
 * is given.
 */
export function lyricsLineBreak(
  text,
  { capacity, segments, gaps, measure } = {},
) {
  if (!text || !(capacity > 0)) return null;
  // `measure(char)` gives the real glyph width in em; surrogates stay estimated.
  const widths = text
    .split('')
    .map((char) =>
      measure && !isSurrogate(char) ? measure(char) : charWidth(char),
    );
  const blocked = new Set();
  if (segments?.length) {
    if (segments.map((segment) => segment.t).join('') !== text) return null;
    let from = 0;
    segments.forEach((segment, index) => {
      const to = from + segment.t.length;
      if (gaps?.[index] > 0 && from < to) widths[from] += gaps[index];
      if (segment.r) for (let i = from + 1; i < to; i += 1) blocked.add(i);
      from = to;
    });
  }
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= capacity * LYRICS_LINE_BREAK_FILL) return null;
  const room = capacity * (measure ? MEASURED_FIT : ESTIMATED_FIT);
  const phrase = { fit: null, any: null };
  let forced = null;
  let head = 0;
  const better = (pick, cost) => !pick || cost <= pick.cost;
  for (let offset = 1; offset < text.length; offset += 1) {
    head += widths[offset - 1];
    if (blocked.has(offset)) continue;
    if (Math.min(head, total - head) < total * MIN_SIDE_SHARE) continue;
    // Ties favour the later break so the first line is the longer one.
    const distance = Math.abs(head - total / 2);
    const fits = head <= room && total - head <= room;
    if (candidateAt(text, offset)) {
      if (better(phrase.any, distance)) phrase.any = { offset, cost: distance };
      if (fits && better(phrase.fit, distance)) {
        phrase.fit = { offset, cost: distance };
      }
    } else if (total > room && fits && forcedBreakAt(text, offset)) {
      const wordTurn =
        HIRAGANA.test(text[offset - 1]) && HAN_OR_KATAKANA.test(text[offset]);
      const cost = distance + (wordTurn ? 0 : ROUGH_BREAK_COST);
      if (better(forced, cost)) forced = { offset, cost };
    }
  }
  // Two lines win over phrase-only breaks; a line too long for two keeps the
  // most balanced phrase break and wraps where it must.
  return (phrase.fit ?? forced ?? phrase.any)?.offset ?? null;
}

/** Splits reading segments into the two display lines at `offset`. */
export function splitReadingSegmentsAt(segments, offset) {
  const lines = [[], []];
  let from = 0;
  segments.forEach((segment, gapIndex) => {
    const to = from + segment.t.length;
    if (offset > from && offset < to && !segment.r) {
      lines[0].push({ t: segment.t.slice(0, offset - from), gapIndex });
      lines[1].push({ t: segment.t.slice(offset - from), gapIndex: null });
    } else {
      lines[from < offset ? 0 : 1].push({ ...segment, gapIndex });
    }
    from = to;
  });
  return lines;
}

// Lyric punctuation and its romanized form share one key (wanakana: 「 -> ‘).
const ANCHOR_KEYS = new Map(
  Object.entries({
    '。': '.',
    '．': '.',
    '.': '.',
    '、': ',',
    '，': ',',
    ',': ',',
    '？': '?',
    '?': '?',
    '！': '!',
    '!': '!',
    '…': '…',
    '「': 'q1',
    '‘': 'q1',
    '」': 'q2',
    '’': 'q2',
    '『': 'q3',
    '“': 'q3',
    '』': 'q4',
    '”': 'q4',
    '（': '(',
    '(': '(',
    '）': ')',
    ')': ')',
    '【': '【',
    '】': '】',
    '〔': '〔',
    '〕': '〕',
    '〈': '〈',
    '〉': '〉',
    '《': '《',
    '》': '》',
  }),
);

function anchors(value, minSpace) {
  const list = [];
  for (const match of value.matchAll(/\s+|\S/gu)) {
    const token = match[0];
    const key = /\s/u.test(token)
      ? token.length >= minSpace && 'S'
      : ANCHOR_KEYS.get(token);
    if (key)
      list.push({ key, from: match.index, to: match.index + token.length });
  }
  return list;
}

/**
 * Cuts romaji at the spot matching a lyric break. Japanese romaji joins words
 * with one space, so only wider gaps stand for spaces in the lyric. Returns
 * null unless spaces and punctuation line up one-to-one (e.g. edited romaji).
 */
export function splitRomajiAt(text, romaji, offset, { script } = {}) {
  if (!romaji) return null;
  const source = anchors(text, 1);
  const target = anchors(romaji, script === 'ko' ? 1 : 2);
  if (
    source.length !== target.length ||
    source.some((anchor, index) => anchor.key !== target[index].key)
  ) {
    return null;
  }
  const after = source.findIndex((anchor) => anchor.to === offset);
  const before = source.findIndex((anchor) => anchor.from === offset);
  const cut =
    after >= 0 ? target[after].to : before >= 0 ? target[before].from : -1;
  const head = romaji.slice(0, Math.max(cut, 0)).trim();
  const tail = romaji.slice(Math.max(cut, 0)).trim();
  return cut > 0 && head && tail ? [head, tail] : null;
}
