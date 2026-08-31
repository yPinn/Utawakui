'use strict';

const sax = require('sax');
const timingValues = require('../../../shared/lyricsTimingValues.json');
const {
  LYRICS_NORMALIZER_PROFILE_ID,
  LYRICS_TIMING_SCHEMA_VERSION,
  validateLyricsTimingDocument,
} = require('../library/lyricsTiming.js');

const DEFAULT_AMLL_TTML_RESPONSE_BYTES = 2 * 1024 * 1024;
const TTML_NAMESPACE = 'http://www.w3.org/ns/ttml';
const TTML_METADATA_NAMESPACE = 'http://www.w3.org/ns/ttml#metadata';
const ITUNES_NAMESPACE = 'http://itunes.apple.com/lyric-ttml-extensions';
const AUXILIARY_ROLES = new Set(['x-bg', 'x-translation', 'x-roman']);
const MAX_XML_ELEMENTS = 50_000;
const MAX_XML_DEPTH = 128;
const MAX_LYRIC_LINES = timingValues.maxLines;
const MAX_LYRIC_SEGMENTS = timingValues.maxTotalSegments;
const MAX_BOUNDARY_JITTER_MS = 1;
const LIMIT_ABORT = Symbol('AMLL_TTML_LIMIT');

function parseSeconds(value, allowOverMinute) {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/u.exec(value);
  if (!match) return null;
  const seconds = Number(match[1]);
  const fraction = Number((match[2] || '').padEnd(3, '0') || '0');
  if (!Number.isSafeInteger(seconds) || (!allowOverMinute && seconds >= 60)) {
    return null;
  }
  const milliseconds = seconds * 1000 + fraction;
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

function parseTtmlTime(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.endsWith('s')) {
    return parseSeconds(normalized.slice(0, -1), true);
  }
  const parts = normalized.split(':');
  if (parts.length < 1 || parts.length > 3) return null;
  const seconds = parseSeconds(parts.at(-1), parts.length === 1);
  if (seconds === null) return null;
  let result = seconds;
  if (parts.length >= 2) {
    if (!/^\d+$/u.test(parts.at(-2))) return null;
    const minutes = Number(parts.at(-2));
    if (!Number.isSafeInteger(minutes) || minutes >= 60) return null;
    result += minutes * 60_000;
  }
  if (parts.length === 3) {
    if (!/^\d+$/u.test(parts[0])) return null;
    const hours = Number(parts[0]);
    if (!Number.isSafeInteger(hours)) return null;
    result += hours * 3_600_000;
  }
  return Number.isSafeInteger(result) ? result : null;
}

function attribute(node, local, uri = '') {
  return Object.values(node.attributes).find(
    (candidate) => candidate.local === local && candidate.uri === uri,
  )?.value;
}

function validInterval(begin, end, parentBegin = 0, parentEnd = Infinity) {
  return (
    Number.isSafeInteger(begin) &&
    Number.isSafeInteger(end) &&
    begin < end &&
    begin >= parentBegin &&
    end <= parentEnd
  );
}

function formatTimestamp(milliseconds) {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function textContent(children) {
  return children
    .map((child) => {
      if (typeof child === 'string') return child;
      if (AUXILIARY_ROLES.has(child.role)) return '';
      return textContent(child.children);
    })
    .join('');
}

function hasTimedDescendant(node) {
  return node.children.some(
    (child) =>
      typeof child !== 'string' &&
      !AUXILIARY_ROLES.has(child.role) &&
      (child.hasExplicitTiming || hasTimedDescendant(child)),
  );
}

function flattenParts(children, parts) {
  for (const child of children) {
    if (typeof child === 'string') {
      parts.push({ text: child, timed: false });
      continue;
    }
    if (AUXILIARY_ROLES.has(child.role)) continue;
    if (child.hasExplicitTiming && !hasTimedDescendant(child)) {
      parts.push({
        text: textContent(child.children),
        timed: true,
        startMs: child.begin,
        endMs: child.end,
      });
      continue;
    }
    flattenParts(child.children, parts);
  }
}

function normalizedWordParts(children) {
  const parts = [];
  flattenParts(children, parts);
  let partial = false;
  let pendingWhitespace = '';
  let previousTimedPart = null;
  const words = [];
  for (const part of parts) {
    if (part.timed) {
      const word = {
        text: `${pendingWhitespace}${part.text}`,
        startMs: part.startMs,
        endMs: part.endMs,
      };
      pendingWhitespace = '';
      previousTimedPart = word;
      if (word.text.length > 0) words.push(word);
      continue;
    }
    if (part.text.length === 0) continue;
    if (/^\s+$/u.test(part.text)) {
      pendingWhitespace += part.text;
      continue;
    }
    partial = true;
  }
  if (pendingWhitespace && previousTimedPart) {
    previousTimedPart.text += pendingWhitespace;
  }
  return {
    partial,
    words,
  };
}

function createState() {
  return {
    failed: false,
    rootSeen: false,
    timingMode: 'auto',
    bodyDepth: 0,
    bodyDuration: Infinity,
    elementCount: 0,
    elementStack: [],
    divStack: [],
    spanStack: [],
    currentLine: null,
    lines: [],
  };
}

function openElement(state, node) {
  state.elementCount += 1;
  if (
    state.elementCount > MAX_XML_ELEMENTS ||
    state.elementStack.length >= MAX_XML_DEPTH
  ) {
    throw LIMIT_ABORT;
  }
  state.elementStack.push(node);
  if (!state.rootSeen) {
    state.rootSeen = true;
    if (node.local !== 'tt' || node.uri !== TTML_NAMESPACE) {
      state.failed = true;
      return;
    }
    const declared = attribute(node, 'timing', ITUNES_NAMESPACE);
    if (declared !== undefined) {
      const mode = declared.toLowerCase();
      if (!new Set(['word', 'line']).has(mode)) state.failed = true;
      else state.timingMode = mode;
    }
    return;
  }
  if (node.uri !== TTML_NAMESPACE) return;
  if (node.local === 'body') {
    state.bodyDepth += 1;
    if (state.bodyDepth > 1) state.failed = true;
    const duration = attribute(node, 'dur');
    if (duration !== undefined) {
      const parsed = parseTtmlTime(duration);
      if (parsed === null) state.failed = true;
      else state.bodyDuration = parsed;
    }
    return;
  }
  if (node.local === 'div' && state.bodyDepth > 0) {
    const parent = state.divStack.at(-1);
    const parentBegin = parent?.begin ?? 0;
    const parentEnd = parent?.end ?? state.bodyDuration;
    const beginValue = attribute(node, 'begin');
    const endValue = attribute(node, 'end');
    const explicit = beginValue !== undefined || endValue !== undefined;
    const begin = explicit ? parseTtmlTime(beginValue) : parentBegin;
    const end = explicit ? parseTtmlTime(endValue) : parentEnd;
    if (explicit && !validInterval(begin, end, parentBegin, parentEnd)) {
      state.failed = true;
    }
    state.divStack.push({ begin, end });
    return;
  }
  if (node.local === 'p' && state.bodyDepth > 0) {
    if (state.lines.length >= MAX_LYRIC_LINES) throw LIMIT_ABORT;
    const parent = state.divStack.at(-1);
    const line = {
      begin: parseTtmlTime(attribute(node, 'begin')),
      end: parseTtmlTime(attribute(node, 'end')),
      parentBegin: parent?.begin ?? 0,
      parentEnd: parent?.end ?? state.bodyDuration,
      children: [],
    };
    state.currentLine = line;
    state.lines.push(line);
    return;
  }
  if (node.local === 'span' && state.currentLine) {
    const beginValue = attribute(node, 'begin');
    const endValue = attribute(node, 'end');
    const span = {
      begin: parseTtmlTime(beginValue),
      end: parseTtmlTime(endValue),
      hasExplicitTiming: beginValue !== undefined || endValue !== undefined,
      role: attribute(node, 'role', TTML_METADATA_NAMESPACE) || null,
      children: [],
    };
    const container = state.spanStack.at(-1) || state.currentLine;
    container.children.push(span);
    state.spanStack.push(span);
  }
}

function addText(state, value) {
  if (!state.currentLine || value.length === 0) return;
  const container = state.spanStack.at(-1) || state.currentLine;
  container.children.push(value);
}

function closeElement(state) {
  const node = state.elementStack.pop();
  if (!node || node.uri !== TTML_NAMESPACE) return;
  if (node.local === 'span' && state.currentLine) state.spanStack.pop();
  if (node.local === 'p') {
    state.currentLine = null;
    state.spanStack = [];
  }
  if (node.local === 'div' && state.bodyDepth > 0) state.divStack.pop();
  if (node.local === 'body') state.bodyDepth -= 1;
}

function parseXml(value) {
  const state = createState();
  const parser = sax.parser(true, {
    xmlns: true,
    position: false,
    strictEntities: true,
  });
  parser.onerror = () => {
    state.failed = true;
  };
  parser.onopentag = (node) => openElement(state, node);
  parser.ontext = (text) => addText(state, text);
  parser.oncdata = (text) => addText(state, text);
  parser.onclosetag = () => closeElement(state);
  try {
    parser.write(value).close();
  } catch {
    state.failed = true;
  }
  return state;
}

function normalizeLines(state) {
  const lines = [];
  let anyWordTiming = false;
  let partialWordTiming = false;
  let totalSegments = 0;
  let normalizedBoundaryJitter = false;
  for (const rawLine of state.lines) {
    const text = textContent(rawLine.children).trim();
    if (!text) continue;
    if (text.length > timingValues.maxTextLength) return null;
    if (
      !validInterval(
        rawLine.begin,
        rawLine.end,
        rawLine.parentBegin,
        rawLine.parentEnd,
      )
    ) {
      return null;
    }
    const parsed = normalizedWordParts(rawLine.children);
    let words = state.timingMode === 'line' ? [] : parsed.words;
    if (words.length > timingValues.maxSegmentsPerLine) return null;
    if (words.length > 0) anyWordTiming = true;
    if (parsed.partial || words.length === 0) partialWordTiming = true;
    let previousWord = null;
    for (const word of words) {
      if (
        !validInterval(word.startMs, word.endMs, rawLine.begin, rawLine.end)
      ) {
        return null;
      }
      if (previousWord && word.startMs < previousWord.endMs) {
        const overlapMs = previousWord.endMs - word.startMs;
        if (
          overlapMs > MAX_BOUNDARY_JITTER_MS ||
          word.startMs <= previousWord.startMs
        ) {
          return null;
        }
        previousWord.endMs = word.startMs;
        normalizedBoundaryJitter = true;
      }
      previousWord = word;
    }
    totalSegments += words.length;
    if (totalSegments > MAX_LYRIC_SEGMENTS) return null;
    if (
      words
        .map((word) => word.text)
        .join('')
        .trim() !== text
    ) {
      partialWordTiming = true;
    }
    lines.push({
      text,
      startMs: rawLine.begin,
      endMs: rawLine.end,
      words,
    });
  }
  if (lines.length === 0) return null;
  const completeT2 =
    state.timingMode !== 'line' && anyWordTiming && !partialWordTiming;
  if (!completeT2) {
    for (const line of lines) line.words = [];
  }
  return {
    lines,
    completeT2,
    partialWordTiming: anyWordTiming,
    normalizedBoundaryJitter,
  };
}

function buildTtmlTimingDocument(
  providerId,
  recordId,
  sourceFilename,
  sourceSha256,
  document,
) {
  if (!/^[a-z][a-z0-9-]{0,31}$/u.test(providerId)) {
    throw new Error('invalid TTML timing provider');
  }
  return validateLyricsTimingDocument(
    {
      schemaVersion: LYRICS_TIMING_SCHEMA_VERSION,
      documentId: `${providerId}:${recordId}`,
      normalizerProfileId: LYRICS_NORMALIZER_PROFILE_ID,
      source: { filename: sourceFilename, sha256: sourceSha256 },
      granularity: 'T2',
      lines: document.lines.map((line, lineIndex) => ({
        lineId: `line:${lineIndex}`,
        text: line.text,
        startMs: line.startMs,
        endMs: line.endMs,
        segments: line.words.map((word, wordIndex) => ({
          segmentId: `line:${lineIndex}:word:${wordIndex}`,
          text: word.text,
          startMs: word.startMs,
          endMs: word.endMs,
        })),
      })),
    },
    {
      sourceFilename,
      sourceSha256,
      normalizerProfileId: LYRICS_NORMALIZER_PROFILE_ID,
    },
  );
}

function buildAmllTimingDocument(
  recordId,
  sourceFilename,
  sourceSha256,
  document,
) {
  return buildTtmlTimingDocument(
    'amll',
    recordId,
    sourceFilename,
    sourceSha256,
    document,
  );
}

function validateCanonicalT2(lines, recordId) {
  const boundedRecordId =
    Number.isSafeInteger(recordId) && recordId > 0
      ? recordId
      : Number.MAX_SAFE_INTEGER;
  const sourceFilename = `amll-${boundedRecordId}-99.lrc`;
  const sourceSha256 = '0'.repeat(64);
  try {
    buildAmllTimingDocument(boundedRecordId, sourceFilename, sourceSha256, {
      lines,
    });
    return true;
  } catch {
    return false;
  }
}

function analyzeAmllTtml(value, options = {}) {
  if (typeof value !== 'string' || value.length === 0) {
    return { status: 'error', reason: 'invalid-ttml' };
  }
  if (Buffer.byteLength(value, 'utf8') > DEFAULT_AMLL_TTML_RESPONSE_BYTES) {
    return { status: 'error', reason: 'ttml-too-large' };
  }
  if (value.charCodeAt(0) === 0xfeff) {
    return { status: 'error', reason: 'invalid-ttml' };
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(value)) {
    return { status: 'error', reason: 'unsafe-ttml' };
  }
  const state = parseXml(value);
  if (
    state.failed ||
    !state.rootSeen ||
    state.elementStack.length !== 0 ||
    state.bodyDepth !== 0
  ) {
    return { status: 'error', reason: 'invalid-ttml' };
  }
  const normalized = normalizeLines(state);
  if (!normalized) return { status: 'error', reason: 'invalid-ttml' };
  if (
    normalized.completeT2 &&
    !validateCanonicalT2(normalized.lines, options.recordId)
  ) {
    return { status: 'error', reason: 'invalid-ttml' };
  }
  const sourceText = `${normalized.lines
    .map((line) => `[${formatTimestamp(line.startMs)}]${line.text}`)
    .join('\n')}\n`;
  const warnings = [];
  if (normalized.normalizedBoundaryJitter) {
    warnings.push('normalized-boundary-jitter');
  }
  if (!normalized.completeT2 && normalized.partialWordTiming) {
    warnings.push('partial-word-timing');
  }
  return {
    status: 'ok',
    capability: {
      level: normalized.completeT2 ? 'T2' : 'T1',
      partial: !normalized.completeT2 && normalized.partialWordTiming,
    },
    compatibility: { t0: true, t1: true, t2: normalized.completeT2 },
    warnings,
    sourceText,
    document: {
      plain: normalized.lines.map((line) => line.text).join('\n'),
      lines: normalized.lines,
    },
    lineCount: normalized.lines.length,
    segmentCount: normalized.completeT2
      ? normalized.lines.reduce((sum, line) => sum + line.words.length, 0)
      : 0,
    timingEnd: normalized.lines.at(-1).endMs / 1000,
  };
}

module.exports = {
  DEFAULT_AMLL_TTML_RESPONSE_BYTES,
  analyzeAmllTtml,
  buildAmllTimingDocument,
  buildTtmlTimingDocument,
  parseTtmlTime,
};
