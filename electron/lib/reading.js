'use strict';

// Pure module, no Electron API, no fs — everything the caller needs
// (tokenize/kanaToRomaji) is injected, same DI convention as config.js and
// systemFfmpeg.js. Stage 5a runs this against a fake analyzer in tests and
// electron/main/lyricsHandlers.js; Stage 5b (see docs/adr/0003) swaps the
// injected tokenize/kanaToRomaji for real kuromoji/wanakana calls inside
// electron/lib/readingWorker.js — nothing here changes.

const KANJI_CHAR_RE = /[一-龯㐀-䶿]/;
const RUN_SPLIT_RE = /([一-龯㐀-䶿]+)|([^一-龯㐀-䶿]+)/g;

function katakanaToHiragana(text) {
  return String(text || '').replace(/[ァ-ヶ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );
}

function splitRuns(text) {
  const runs = [];
  let match;
  RUN_SPLIT_RE.lastIndex = 0;
  while ((match = RUN_SPLIT_RE.exec(text))) {
    runs.push(
      match[1]
        ? { type: 'kanji', text: match[1] }
        : { type: 'other', text: match[2] },
    );
  }
  return runs;
}

// Splits one token's surface form + katakana reading (kuromoji's own field
// shape: surface_form/reading) into ruby-annotatable segments
// [{ t: text, r?: hiraganaReading }].
//
// Kana runs in `surface` are matched literally against the reading
// (converted to hiragana), walking right-to-left: okurigana is never
// sound-shifted in standard Japanese orthography, so each kana run's text
// appears verbatim in the reading, and anchoring from the right edge
// inward correctly resolves trailing okurigana (the common case — 歌う,
// 高い, 食べる) and interior kana (読み込む) alike, leaving each kanji run
// whatever reading is left between two anchors.
//
// A single kanji run with no surrounding kana (jukujikun/熟字訓 compounds
// like 今日->きょう, or any plain kanji word) is unambiguous by
// construction — the whole reading belongs to it, no matching needed.
//
// Alignment fails closed: if a kana run's text can't be found in the
// reading at all, or a kanji run would end up with zero reading characters
// between two anchors, this returns one atomic segment covering the whole
// surface with the whole reading, rather than guessing a wrong split.
function alignOkurigana(surface, reading) {
  const text = String(surface || '');
  if (!text) return [];

  const readingHira = katakanaToHiragana(reading || '');
  if (!readingHira) return [{ t: text }];

  const runs = splitRuns(text);
  if (!runs.some((run) => run.type === 'kanji')) return [{ t: text }];

  const fallback = () => [{ t: text, r: readingHira }];

  const collected = [];
  let boundary = readingHira.length;
  let pendingKanji = null;

  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    if (run.type === 'kanji') {
      pendingKanji = run;
      continue;
    }

    const needle = katakanaToHiragana(run.text);
    const foundAt = readingHira.lastIndexOf(needle, boundary - 1);
    if (foundAt === -1 || foundAt + needle.length > boundary) return fallback();

    if (pendingKanji) {
      const kanjiReading = readingHira.slice(foundAt + needle.length, boundary);
      if (!kanjiReading) return fallback();
      collected.push({ t: pendingKanji.text, r: kanjiReading });
      pendingKanji = null;
    }
    collected.push({ t: run.text });
    boundary = foundAt;
  }

  if (pendingKanji) {
    const kanjiReading = readingHira.slice(0, boundary);
    if (!kanjiReading) return fallback();
    collected.push({ t: pendingKanji.text, r: kanjiReading });
  }

  return collected.reverse();
}

// Whether text has at least one kanji character — buildReadingDoc uses
// this to skip tokenizing lines that plainly need no reading aid at all
// (romaji-only/punctuation-only lines), not as a script detector (that's
// src/utils/lyrics.js's detectLyricsScript, which decides whether to offer
// the reading-aid toolbar at all).
function containsKanji(text) {
  return KANJI_CHAR_RE.test(String(text || ''));
}

function endsWithKanji(text) {
  const value = String(text || '');
  return containsKanji(value.at(-1) || '');
}

function startsWithKanji(text) {
  const value = String(text || '');
  return containsKanji(value[0] || '');
}

// Builds a reading doc for a set of lyric lines. `tokenize(text)` must
// return an array of `{ surface_form, reading }` (kuromoji's own token
// shape — the fake analyzer used in tests/Stage 5a mirrors it so Stage 5b
// is a drop-in swap). `kanaToRomaji(kana)` is optional; when supplied,
// each line's whole-line katakana reading is converted once at generation
// time and stored, so rendering the romaji variant never needs the
// converter again.
function buildReadingDoc(lines, options = {}) {
  const { tokenize, kanaToRomaji, analyzer = null, onProgress } = options;
  if (typeof tokenize !== 'function') {
    throw new Error('buildReadingDoc requires a tokenize function');
  }

  const sourceLines = Array.isArray(lines) ? lines : [];
  const resultLines = sourceLines.map((rawText, index) => {
    onProgress?.({ stage: 'line', index, total: sourceLines.length });
    const text = typeof rawText === 'string' ? rawText : '';
    if (!text || !containsKanji(text)) {
      return {
        text,
        segments: text ? [{ t: text }] : [],
        romaji: '',
        edited: false,
      };
    }

    // Some lyrics sources use a full-width space (U+3000) as a visual
    // word separator between adjacent kanji compounds that have no
    // natural kana between them (e.g. two back-to-back nouns). Rendered
    // literally, that reads as a whole extra character's worth of gap —
    // wildly inconsistent next to the narrow gaps kana already provides
    // elsewhere in the same line. Collapsed to one regular space here
    // (only for what gets tokenized/annotated — the returned `text`
    // below stays the untouched original) so word-boundary gaps read
    // consistently regardless of which whitespace character the source
    // happened to use.
    const tokens = tokenize(text.replace(/\s+/g, ' ')) || [];
    const segments = tokens.flatMap((token, tokenIndex) => {
      const tokenSegments = alignOkurigana(token.surface_form, token.reading);
      const previous = tokens[tokenIndex - 1];
      // Deliberate word-boundary spacing: two adjacent tokens that both
      // end/start with kanji (no natural kana between them, e.g. two
      // back-to-back nouns) run together with no visual cue for where one
      // reading ends and the next begins — the same illegibility the
      // full-width-space normalization above fixes for lines that already
      // had a literal space, but proactive here for lines that never had
      // one. `.trim()` guards against inserting this next to a token that
      // is itself pure whitespace (already handled on its own).
      const needsWordGap =
        previous &&
        previous.surface_form.trim() &&
        token.surface_form.trim() &&
        endsWithKanji(previous.surface_form) &&
        startsWithKanji(token.surface_form);
      return needsWordGap ? [{ t: ' ' }, ...tokenSegments] : tokenSegments;
    });
    // Joined with a space per token boundary (kuromoji's own word
    // segmentation), not concatenated — wanakana passes the spaces through
    // untouched, so the romaji reads as separate words ("utau koe") instead
    // of one unbroken run ("utaukoe").
    const lineReadingKana = tokens
      .map((token) => token.reading || token.surface_form)
      .join(' ');
    const romaji =
      typeof kanaToRomaji === 'function' ? kanaToRomaji(lineReadingKana) : '';

    return { text, segments, romaji, edited: false };
  });

  return { analyzer, lines: resultLines };
}

module.exports = {
  katakanaToHiragana,
  alignOkurigana,
  buildReadingDoc,
};
