'use strict';

// Pure module, no Electron API, no fs — everything the caller needs
// (tokenize/kanaToRomaji) is injected, same DI convention as config.js and
// systemFfmpeg.js. Stage 5a runs this against a fake analyzer in tests and
// electron/main/lyricsHandlers.js; Stage 5b (see docs/adr/0003) swaps the
// injected tokenize/kanaToRomaji for real kuromoji/wanakana calls inside
// electron/lib/lyricsReadingWorker.js — nothing here changes.

const KANJI_CHAR_RE = /[一-龯㐀-䶿]/;
const RUN_SPLIT_RE = /([一-龯㐀-䶿]+)|([^一-龯㐀-䶿]+)/g;
// Hiragana + katakana (same range src/utils/lyrics.js's JAPANESE_KANA_RE
// uses for script detection) — a line built only from this range has no
// kanji to build ruby from, but still needs its own romaji (see
// containsKana's use below).
const KANA_CHAR_RE = /[぀-ヿ]/;
// Same combined-syllable range koroman itself romanizes (0xAC00-0xD7A3) —
// jamo-only characters (ㅋㅋㅋ) fall outside it and are correctly left as
// plain text by both this check and koroman's own non-hangul passthrough.
const HANGUL_SYLLABLE_RE = /[가-힣]/;

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

// Whether text has at least one hiragana/katakana character. Distinct
// from containsKanji: a line can be all-kana (no kanji, e.g. だから,
// なくなった) and still be fully Japanese, needing romaji even though
// there's no ruby to build — see buildReadingDoc's no-kanji branch below.
function containsKana(text) {
  return KANA_CHAR_RE.test(String(text || ''));
}

// Same role as containsKanji above, for Korean lines — skips romanizing
// lines that are plainly not Korean at all (an all-English hook line, a
// stray sound-effect line), not a script detector.
function containsHangul(text) {
  return HANGUL_SYLLABLE_RE.test(String(text || ''));
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
      // No kanji doesn't mean no romaji: an all-kana line (だから, ああ,
      // なくなった) has nothing to annotate with ruby, but its surface text
      // already IS its own reading — feeding it straight to kanaToRomaji
      // gives the correct romaji with no tokenizer/alignment step needed.
      // Skipping romaji entirely here (as an earlier version of this
      // function did) silently drops the romaji line for every all-kana
      // lyric line, which is common, not an edge case.
      //
      // Gated on containsKana, not just "no kanji": a line that's already
      // pure Latin/symbols (an English hook line, "123", punctuation) has
      // no Japanese phonetic content to convert at all — kanaToRomaji
      // would just hand the same text back unchanged (wanakana passes
      // non-kana text through untouched), producing a redundant "romaji"
      // row identical to the line above it. Same reasoning
      // buildRomanizationDoc's containsHangul gate already applies to
      // Korean's all-Latin lines.
      const romaji =
        text && containsKana(text) && typeof kanaToRomaji === 'function'
          ? kanaToRomaji(text.replace(/\s+/g, ' '))
          : '';
      return {
        text,
        segments: text ? [{ t: text }] : [],
        romaji,
        edited: false,
      };
    }

    // Segment text is part of the canonical reading identity: concatenating
    // every `t` must reproduce the untouched lyric line exactly. Tokenize the
    // original string and never add presentation-only separators here. Romaji
    // can still use token boundaries below without changing visible source text.
    const tokens = tokenize(text) || [];
    const segments = tokens.flatMap((token) =>
      alignOkurigana(token.surface_form, token.reading),
    );
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

// Korean counterpart to buildReadingDoc above, deliberately kept as its
// own function rather than a branch inside buildReadingDoc: Korean needs
// none of that function's machinery (tokenizing, okurigana alignment,
// kanji word-gap insertion) — 한글 is already phonetic and already
// space-separated (띄어쓰기), so there's no ruby to build. `romanize(text)`
// is expected to return the whole line's romanization already, applying
// its own pronunciation-assimilation rules (see docs/adr/0004) — this
// function's only job is the same per-line skip/shape bookkeeping
// buildReadingDoc does. `segments` is always a single plain `{ t: text }`
// (never a `r` reading), so the existing <ruby> rendering path in
// LyricsWorkspace.vue naturally renders Korean lines as plain text.
function buildRomanizationDoc(lines, options = {}) {
  const { romanize, analyzer = null, onProgress } = options;
  if (typeof romanize !== 'function') {
    throw new Error('buildRomanizationDoc requires a romanize function');
  }

  const sourceLines = Array.isArray(lines) ? lines : [];
  const resultLines = sourceLines.map((rawText, index) => {
    onProgress?.({ stage: 'line', index, total: sourceLines.length });
    const text = typeof rawText === 'string' ? rawText : '';
    if (!text || !containsHangul(text)) {
      return {
        text,
        segments: text ? [{ t: text }] : [],
        romaji: '',
        edited: false,
      };
    }

    return {
      text,
      segments: [{ t: text }],
      romaji: romanize(text),
      edited: false,
    };
  });

  return { analyzer, lines: resultLines };
}

module.exports = {
  katakanaToHiragana,
  alignOkurigana,
  buildReadingDoc,
  buildRomanizationDoc,
};
