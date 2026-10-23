// Lossless annotations. A textual credit match is only a candidate: it can be
// sung. Hiding always requires a user-selected stable line id.
export const LYRICS_TEXT_PROCESSING_VERSION = 1;
const CREDIT_PREFIX =
  /^(?:作詞|作词|作曲|編曲|编曲|詞曲|词曲|lyrics?(?:\s+by)?|music\s+by|composed\s+by|written\s+by|arranged\s+by|작사|작곡|편곡)\s*[:：]\s*\S/iu;
const PAIRS = new Map([
  ['(', ')'],
  ['（', '）'],
  ['[', ']'],
  ['【', '】'],
  ['{', '}'],
  ['「', '」'],
  ['『', '』'],
  ['“', '”'],
  ['‘', '’'],
  ['《', '》'],
  ['〈', '〉'],
]);
const CLOSINGS = new Set(PAIRS.values());
const OPENING_RE = /[(（[【{「『“‘《〈]$/u;
const CLOSING_RE = /^[)）\]】}」』”’》〉,，、。！？!?;；:：.…‥]/u;

export function analyzeLyricsText(value) {
  const sourceText = String(value ?? '');
  const pairedRanges = [];
  const stack = [];
  let malformedPairs = false;
  // Canonical limits are enforced by the owner. Unsupported raw input is kept.
  if (sourceText.length <= 2000) {
    for (let index = 0; index < sourceText.length; index++) {
      const ch = sourceText[index];
      if (ch === '"') {
        let escapes = 0;
        for (let at = index - 1; at >= 0 && sourceText[at] === '\\'; at--)
          escapes++;
        if (escapes % 2) continue;
        if (stack.at(-1)?.close === ch) {
          const open = stack.pop();
          pairedRanges.push({ sourceStart: open.start, sourceEnd: index + 1 });
        } else stack.push({ start: index, close: ch });
      } else if (PAIRS.has(ch)) {
        stack.push({ start: index, close: PAIRS.get(ch) });
      } else if (CLOSINGS.has(ch)) {
        // A curly apostrophe in a word is not a quotation delimiter.
        if (
          ch === '’' &&
          /[\p{L}\p{N}]/u.test(sourceText[index - 1] ?? '') &&
          /[\p{L}\p{N}]/u.test(sourceText[index + 1] ?? '')
        )
          continue;
        if (stack.at(-1)?.close !== ch) malformedPairs = true;
        else {
          const open = stack.pop();
          pairedRanges.push({ sourceStart: open.start, sourceEnd: index + 1 });
        }
      }
    }
    malformedPairs ||= stack.length > 0;
  }
  return {
    sourceText,
    sourceStart: 0,
    sourceEnd: sourceText.length,
    kind:
      sourceText.length <= 2000 && CREDIT_PREFIX.test(sourceText.trim())
        ? 'credit-candidate'
        : 'lyric',
    pairedRanges,
    malformedPairs,
  };
}

export function isProtectedLyricsBreak(analysis, offset) {
  return analysis.pairedRanges.some(
    (r) => offset > r.sourceStart && offset < r.sourceEnd,
  );
}

export function isSafeLyricsBreak(text, offset) {
  if (offset <= 0 || offset >= text.length) return true;
  const before = text.slice(0, offset).trimEnd();
  const after = text.slice(offset).trimStart();
  if (before.endsWith('"') || after.startsWith('"')) {
    const { pairedRanges } = analyzeLyricsText(text);
    if (
      before.endsWith('"') &&
      !pairedRanges.some((range) => range.sourceEnd === before.length)
    )
      return false;
    if (
      after.startsWith('"') &&
      !pairedRanges.some(
        (range) => range.sourceStart === text.length - after.length,
      )
    )
      return false;
  }
  return !OPENING_RE.test(before) && !CLOSING_RE.test(after);
}

export function preprocessLyricsDocument(document) {
  const lines = (document?.lines ?? []).map((line, sourceLineIndex) => ({
    ...analyzeLyricsText(line.text),
    lineId: line.lineId,
    sourceLineIndex,
    text: line.text,
  }));
  return {
    version: LYRICS_TEXT_PROCESSING_VERSION,
    lines,
    creditCandidates: lines.filter((line) => line.kind === 'credit-candidate'),
  };
}

function selectionHash(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(36);
}

// Run after Output reading validation, so filtering cannot break the source's
// index-based editing/readings. Canonical documents and timestamps stay intact.
export function projectLyricsTextSelection(document, hiddenLineIds = []) {
  if (
    !document ||
    !Array.isArray(document.lines) ||
    !Array.isArray(hiddenLineIds) ||
    hiddenLineIds.length === 0
  )
    return document;
  const requested = new Set(hiddenLineIds);
  const hidden = new Set(
    document.lines
      .filter(
        (line) =>
          requested.has(line.lineId) &&
          analyzeLyricsText(line.text).kind === 'credit-candidate',
      )
      .map((line) => line.lineId),
  );
  if (hidden.size === 0) return document;
  const identity = `${document.documentId}\0${[...hidden].join('\0')}`;
  const lines = document.lines.filter((line) => !hidden.has(line.lineId));
  return {
    ...document,
    documentId: `${document.documentId.slice(0, 150)}~text-v1-${selectionHash(identity)}`,
    lines,
    ...(document.granularity
      ? {
          granularity: lines.some((line) => line.segments?.length)
            ? 'T2'
            : lines.some((line) => Number.isFinite(line.startMs))
              ? 'T1'
              : 'T0',
        }
      : {}),
    ...(document.reading
      ? {
          reading: {
            ...document.reading,
            lines: document.reading.lines.filter(
              (line) => !hidden.has(line.lineId),
            ),
          },
        }
      : {}),
  };
}
