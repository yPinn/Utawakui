const TIME_RE = /(?:(\d+):)?(\d{2}):(\d{2})(?:[.,](\d{1,3}))?/;
const LRC_TIME_RE = /^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/;
const LRC_METADATA_RE = /^\[(?:ar|ti|al|by|offset|length|re|ve):[^\]]*\]$/i;
const SOURCE_KIND_YOUTUBE_CC = 'youtube-cc';
const SOURCE_KIND_LRCLIB = 'lrclib';
const MUSIC_NOTE_RE = /[♪♫♬♩🎵🎶]+/gu;
const JAPANESE_KANA_RE = /[\u3040-\u30ff]/;
const KOREAN_HANGUL_RE = /[\uac00-\ud7af]/;
const CJK_RE = /[\u3400-\u9fff]/;
const LATIN_RE = /[A-Za-z]/;
const LANGUAGE_SOURCE_PREFERENCES = {
  zh: ['zh-tw', 'zh-hant', 'zh-hk', 'zh-mo', 'zh'],
  ja: ['ja'],
  ko: ['ko'],
  en: ['en'],
};
const GENERIC_NOISE_TERMS = [
  'music',
  'instrumental',
  'intro',
  'outro',
  'applause',
  'clapping',
  'clap',
];
const LANGUAGE_NOISE_TERMS = {
  zh: ['音樂', '音乐', '拍手', '掌聲', '掌声'],
  ja: ['音楽', '拍手'],
  ko: ['음악', '박수'],
};
const YOUTUBE_CC_DEDUP_WINDOW_SECONDS = 12;

function parseTime(value) {
  const match = TIME_RE.exec(value);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number((match[4] || '').padEnd(3, '0'));
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function decodeCueText(value) {
  return value
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .trim();
}

function sourceKindFromOptions(options) {
  return options?.source?.kind || options?.sourceKind || SOURCE_KIND_YOUTUBE_CC;
}

function languageFromOptions(options) {
  return options?.source?.language || options?.language || '';
}

function normalizeLanguageTag(tag) {
  return String(tag || '')
    .toLocaleLowerCase()
    .replaceAll('_', '-');
}

function languageRoots(language) {
  const normalized = normalizeLanguageTag(language);
  if (normalized.startsWith('zh')) return ['zh'];
  if (normalized.startsWith('ja')) return ['ja'];
  if (normalized.startsWith('ko')) return ['ko'];
  if (normalized.startsWith('en')) return ['en'];
  return [];
}

function preferredLanguagesFor(language) {
  const normalized = normalizeLanguageTag(language);
  if (normalized.startsWith('zh')) return LANGUAGE_SOURCE_PREFERENCES.zh;
  if (normalized.startsWith('ja')) return LANGUAGE_SOURCE_PREFERENCES.ja;
  if (normalized.startsWith('ko')) return LANGUAGE_SOURCE_PREFERENCES.ko;
  if (normalized.startsWith('en')) return LANGUAGE_SOURCE_PREFERENCES.en;
  return normalized ? [normalized] : [];
}

function cueNoiseTerms(language) {
  const languageTerms = languageRoots(language).flatMap(
    (root) => LANGUAGE_NOISE_TERMS[root] ?? [],
  );
  return [...GENERIC_NOISE_TERMS, ...languageTerms];
}

function normalizeCueForMatch(text) {
  return String(text || '')
    .replace(MUSIC_NOTE_RE, '')
    .replace(/[()[\]{}【】「」『』（）]/gu, ' ')
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function unwrapWholeCue(text) {
  const trimmed = String(text || '').trim();
  const pairs = [
    ['[', ']', 'square'],
    ['(', ')', 'paren'],
    ['【', '】', 'square'],
    ['（', '）', 'paren'],
  ];
  for (const [open, close, type] of pairs) {
    if (trimmed.startsWith(open) && trimmed.endsWith(close)) {
      return { inner: trimmed.slice(open.length, -close.length).trim(), type };
    }
  }
  return null;
}

function isAllCapsStageDirection(text) {
  const letters = String(text || '').match(/[A-Za-z]/g);
  if (!letters || /[a-z]/.test(text)) return false;
  const words = text.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return words.length > 0 && words.length <= 6;
}

function isKnownNoiseCue(text, options = {}) {
  const normalized = normalizeCueForMatch(text);
  if (!normalized) return true;
  return cueNoiseTerms(languageFromOptions(options)).some(
    (term) => normalizeCueForMatch(term) === normalized,
  );
}

function isYoutubeCcNonLyricCue(text, options = {}) {
  if (typeof text !== 'string') return false;
  const normalized = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
  if (!normalized) return true;
  if (isKnownNoiseCue(normalized, options)) return true;

  const wrapped = unwrapWholeCue(normalized);
  if (!wrapped) return false;
  return (
    isKnownNoiseCue(wrapped.inner, options) ||
    (wrapped.type === 'square' && isAllCapsStageDirection(wrapped.inner))
  );
}

export function isNonLyricCue(text, options = {}) {
  if (sourceKindFromOptions(options) === SOURCE_KIND_YOUTUBE_CC) {
    return isYoutubeCcNonLyricCue(text, options);
  }
  return typeof text === 'string' && text.trim().length === 0;
}

function stripMusicNoteDecorations(text) {
  return String(text || '')
    .replace(MUSIC_NOTE_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function preprocessYoutubeCcCueText(lines, options = {}) {
  const cleanedLines = lines
    .map(stripMusicNoteDecorations)
    .filter((line) => line && !isYoutubeCcNonLyricCue(line, options));
  const cueText = cleanedLines.join('\n').trim();
  return isYoutubeCcNonLyricCue(cueText, options) ? '' : cueText;
}

export function preprocessLyricCueText(linesOrText, options = {}) {
  const lines = Array.isArray(linesOrText)
    ? linesOrText
    : String(linesOrText || '').split(/\r?\n/);
  if (sourceKindFromOptions(options) === SOURCE_KIND_YOUTUBE_CC) {
    return preprocessYoutubeCcCueText(lines, options);
  }
  return lines
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeLyricForDedup(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(MUSIC_NOTE_RE, '')
    .replace(/\s+/g, '')
    .trim()
    .toLocaleLowerCase();
}

function lyricLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function cuesAreNear(previousCue, cue) {
  return cue.start - previousCue.start <= YOUTUBE_CC_DEDUP_WINDOW_SECONDS;
}

function richerCue(first, second) {
  return normalizeLyricForDedup(second.text).length >
    normalizeLyricForDedup(first.text).length
    ? second
    : { ...first, end: Math.max(first.end, second.end) };
}

function removeTextPrefix(previousText, text) {
  const previous = String(previousText || '').trim();
  const current = String(text || '').trim();
  if (!previous || !current) return null;
  if (normalizeLyricForDedup(previous) === normalizeLyricForDedup(current)) {
    return '';
  }
  if (current.startsWith(previous)) {
    return current.slice(previous.length).trim();
  }
  return null;
}

function removeLeadingLineOverlap(previousText, text) {
  const previousLines = lyricLines(previousText);
  const currentLines = lyricLines(text);
  const maxOverlap = Math.min(previousLines.length, currentLines.length);

  for (let count = maxOverlap; count > 0; count -= 1) {
    const previousTail = previousLines
      .slice(previousLines.length - count)
      .map(normalizeLyricForDedup);
    const currentHead = currentLines
      .slice(0, count)
      .map(normalizeLyricForDedup);
    if (
      previousTail.length === currentHead.length &&
      previousTail.every((line, index) => line && line === currentHead[index])
    ) {
      return currentLines.slice(count).join('\n').trim();
    }
  }

  return null;
}

function dedupYoutubeCcCues(cues) {
  const deduped = [];

  for (const cue of cues) {
    const previous = deduped[deduped.length - 1];
    if (!previous) {
      deduped.push(cue);
      continue;
    }

    if (previous.start === cue.start) {
      deduped[deduped.length - 1] = richerCue(previous, cue);
      continue;
    }

    if (!cuesAreNear(previous, cue)) {
      deduped.push(cue);
      continue;
    }

    const normalizedPrevious = normalizeLyricForDedup(previous.text);
    const normalizedCue = normalizeLyricForDedup(cue.text);
    if (normalizedPrevious && normalizedPrevious === normalizedCue) continue;

    const withoutPrefix =
      removeTextPrefix(previous.text, cue.text) ??
      removeLeadingLineOverlap(previous.text, cue.text);
    if (withoutPrefix !== null) {
      if (withoutPrefix.length > 0) {
        deduped.push({ ...cue, text: withoutPrefix });
      }
      continue;
    }

    deduped.push(cue);
  }

  return deduped;
}

function dedupLyricCues(cues, options = {}) {
  if (sourceKindFromOptions(options) === SOURCE_KIND_YOUTUBE_CC) {
    return dedupYoutubeCcCues(cues);
  }
  return cues;
}

export function parseVtt(text, options = {}) {
  if (typeof text !== 'string' || text.trim().length === 0) return [];

  const cues = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n\r?\n+/)
    .map((block) => block.split(/\r?\n/).filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines) => {
      const timingIndex = lines.findIndex((line) => line.includes('-->'));
      if (timingIndex === -1) return null;
      const [startRaw, endRaw] = lines[timingIndex].split('-->');
      const start = parseTime(startRaw);
      const end = parseTime(endRaw);
      const textLines = lines.slice(timingIndex + 1).map(decodeCueText);
      const cueText = preprocessLyricCueText(textLines, options);
      if (start === null || end === null || isNonLyricCue(cueText, options)) {
        return null;
      }
      return { start, end, text: cueText };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  return dedupLyricCues(cues, options);
}

function parseLrcTimestamp(value) {
  const match = LRC_TIME_RE.exec(String(value || '').trim());
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = match[3] || '';
  const millis = fraction ? Number(fraction.padEnd(3, '0').slice(0, 3)) : 0;
  return minutes * 60 + seconds + millis / 1000;
}

export function parseLrc(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return [];

  const rawLines = text.split(/\r?\n/);
  const starts = rawLines
    .flatMap((line) => {
      const matches = [...line.matchAll(/\[([^\]]+)\]/g)];
      if (matches.length === 0) return [];
      const lyricText = line.replace(/\[[^\]]+\]/g, '').trim();
      if (!lyricText) return [];
      return matches
        .map((match) => parseLrcTimestamp(match[1]))
        .filter((start) => start !== null)
        .map((start) => ({ start, text: lyricText }));
    })
    .sort((a, b) => a.start - b.start);

  if (starts.length === 0) {
    return rawLines
      .map((line) => line.trim())
      .filter((line) => line && !LRC_METADATA_RE.test(line))
      .map((line) => ({
        start: Number.NaN,
        end: Number.NaN,
        text: line,
      }));
  }

  return starts.map((line, index) => ({
    ...line,
    end: starts[index + 1]?.start ?? Number.POSITIVE_INFINITY,
  }));
}

export function parseLyricsText(text, options = {}) {
  const source = options?.source;
  const filename = source?.filename || '';
  if (sourceKindFromOptions(options) === SOURCE_KIND_LRCLIB) {
    return parseLrc(text);
  }
  if (filename.toLocaleLowerCase().endsWith('.lrc')) {
    return parseLrc(text);
  }
  return parseVtt(text, options);
}

export function formatLyricTime(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}`;
}

function languageTagBase(tag) {
  return normalizeLanguageTag(tag).replace(/-orig$/, '');
}

function languageMatchesPreference(source, preference) {
  const preferred = normalizeLanguageTag(preference);
  const language = languageTagBase(source?.language);
  const filename = languageTagBase(source?.filename);
  return [language, filename].some(
    (value) => value === preferred || value.startsWith(`${preferred}-`),
  );
}

// Whether the reading-aid toolbar (LyricsWorkspace.vue) should offer
// itself at all. Only 'ja' triggers anything today (Stage 5a/5b); other
// values are returned so callers/tests can be explicit about "no reading
// aid for this script" vs. "not checked yet". Requires actual kana, not
// just kanji — kanji alone can't be told apart from Chinese lyrics.
export function detectLyricsScript(text) {
  const value = String(text || '');
  if (KOREAN_HANGUL_RE.test(value)) return 'ko';
  if (JAPANESE_KANA_RE.test(value)) return 'ja';
  if (CJK_RE.test(value)) return 'zh';
  if (LATIN_RE.test(value)) return 'latin';
  return 'unknown';
}

// Zips parsed lyricLines (parseLyricsText's output) with a saved reading
// doc by line index, validating each pair's text still matches. A stale
// doc (lyrics source text changed since generation, or the doc simply has
// no entry for that index) yields null for that line rather than a
// mismatched reading — callers show "no reading for this line" instead of
// silently wrong ruby.
export function alignReadings(lyricLines, readingDoc) {
  const lines = Array.isArray(lyricLines) ? lyricLines : [];
  const readingLines = readingDoc?.lines;
  if (!Array.isArray(readingLines)) return lines.map(() => null);

  return lines.map((line, index) => {
    const readingLine = readingLines[index];
    if (!readingLine || readingLine.text !== line.text) return null;
    return readingLine;
  });
}

export function inferPreferredLyricsLanguagePrefixes(track) {
  const text = `${track?.title || ''} ${track?.artist || ''}`;
  if (KOREAN_HANGUL_RE.test(text)) return preferredLanguagesFor('ko');
  if (JAPANESE_KANA_RE.test(text)) return preferredLanguagesFor('ja');
  if (CJK_RE.test(text)) return preferredLanguagesFor('zh');
  if (LATIN_RE.test(text)) return preferredLanguagesFor('en');
  return [];
}

function pickSourceByLanguage(sources, preferences) {
  let bestSource = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const source of sources) {
    const rank = preferences.findIndex((preference) =>
      languageMatchesPreference(source, preference),
    );
    if (rank !== -1 && rank < bestRank) {
      bestSource = source;
      bestRank = rank;
    }
  }
  return bestSource;
}

export function pickPreferredLyricsSource(track, currentFilename = null) {
  const sources = track?.lyrics?.sources ?? [];
  if (sources.length === 0) return null;
  if (
    currentFilename &&
    sources.some((source) => source.filename === currentFilename)
  ) {
    return sources.find((source) => source.filename === currentFilename);
  }

  const preferredPrefixes = inferPreferredLyricsLanguagePrefixes(track);
  return pickSourceByLanguage(sources, preferredPrefixes) ?? sources[0];
}

const LYRICS_SOURCE_KIND_LABELS = {
  'youtube-cc': 'YouTube CC',
  lrclib: 'LRCLIB',
  manual: '手動匯入',
};

// Shared by LyricsWorkspace.vue's source <select> and
// LyricsSourceManagerModal.vue's current-sources list — same display
// string in both places. Kind leads (always meaningful); language only
// follows when it's a real value — lrclib's API has no language field at
// all, so every lrclib source is stamped 'und' and showing that would just
// be noise. label (see saveTrackLyricsManifest) fills the same slot when
// language isn't real.
export function formatLyricsSourceLabel(source) {
  const kindLabel = LYRICS_SOURCE_KIND_LABELS[source.kind] || source.kind;
  const languagePart =
    source.language && source.language !== 'und'
      ? source.language.toUpperCase()
      : null;
  const descriptor = [languagePart, source.label].filter(Boolean).join(' · ');
  return descriptor ? `${kindLabel} / ${descriptor}` : kindLabel;
}
