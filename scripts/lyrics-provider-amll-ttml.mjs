import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sax = require('sax');

export const DEFAULT_AMLL_TTML_RESPONSE_BYTES = 2 * 1024 * 1024;

const TTML_NAMESPACE = 'http://www.w3.org/ns/ttml';
const TTML_METADATA_NAMESPACE = 'http://www.w3.org/ns/ttml#metadata';
const ITUNES_NAMESPACE = 'http://itunes.apple.com/lyric-ttml-extensions';
const UNTYPED_AUXILIARY_ROLES = new Set(['x-translation', 'x-roman']);
const MAX_XML_ELEMENTS = 50_000;
const MAX_XML_DEPTH = 128;
const MAX_LYRIC_LINES = 5_000;
const MAX_LYRIC_SEGMENTS = 50_000;
const TTML_LIMIT_ABORT = Symbol('TTML_LIMIT_ABORT');

function parseSecondsComponent(value, allowOverMinute) {
  const match = /^(\d+)(?:\.(\d{1,3}))?$/u.exec(value);
  if (!match) return null;
  const seconds = Number(match[1]);
  const fractionMs = Number((match[2] || '').padEnd(3, '0') || '0');
  if (!Number.isSafeInteger(seconds) || (!allowOverMinute && seconds >= 60)) {
    return null;
  }
  const milliseconds = seconds * 1000 + fractionMs;
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

function parseTtmlTime(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.endsWith('s')) {
    return parseSecondsComponent(normalized.slice(0, -1), true);
  }
  const parts = normalized.split(':');
  if (parts.length < 1 || parts.length > 3) return null;
  const secondsMs = parseSecondsComponent(parts.at(-1), parts.length === 1);
  if (secondsMs === null) return null;
  let milliseconds = secondsMs;
  if (parts.length >= 2) {
    if (!/^\d+$/u.test(parts.at(-2))) return null;
    const minutes = Number(parts.at(-2));
    if (!Number.isSafeInteger(minutes) || minutes >= 60) return null;
    milliseconds += minutes * 60_000;
  }
  if (parts.length === 3) {
    if (!/^\d+$/u.test(parts[0])) return null;
    const hours = Number(parts[0]);
    if (!Number.isSafeInteger(hours)) return null;
    milliseconds += hours * 3_600_000;
  }
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
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

function invalidTtml(reason = 'invalid-ttml') {
  return { status: 'error', reason };
}

function createParserState() {
  return {
    parseFailed: false,
    rootSeen: false,
    timingMode: 'auto',
    bodyDuration: Infinity,
    elementCount: 0,
    segmentElementCount: 0,
    lines: [],
    elementStack: [],
    divStack: [],
    spanStack: [],
    bodyDepth: 0,
    currentLine: null,
  };
}

function openRoot(state, node) {
  state.rootSeen = true;
  if (node.local !== 'tt' || node.uri !== TTML_NAMESPACE) {
    state.parseFailed = true;
    return;
  }
  const declaredTiming = attribute(node, 'timing', ITUNES_NAMESPACE);
  if (declaredTiming === undefined) return;
  const normalizedTiming = declaredTiming.toLowerCase();
  if (!new Set(['word', 'line']).has(normalizedTiming)) {
    state.parseFailed = true;
    return;
  }
  state.timingMode = normalizedTiming;
}

function openBody(state, node) {
  state.bodyDepth += 1;
  if (state.bodyDepth > 1) state.parseFailed = true;
  const duration = attribute(node, 'dur');
  if (duration === undefined) return;
  const parsed = parseTtmlTime(duration);
  if (parsed === null) state.parseFailed = true;
  else state.bodyDuration = parsed;
}

function openDiv(state, node) {
  const parent = state.divStack.at(-1);
  const parentBegin = parent?.begin ?? 0;
  const parentEnd = parent?.end ?? state.bodyDuration;
  const beginValue = attribute(node, 'begin');
  const endValue = attribute(node, 'end');
  const hasExplicitTiming = beginValue !== undefined || endValue !== undefined;
  const begin = hasExplicitTiming ? parseTtmlTime(beginValue) : parentBegin;
  const end = hasExplicitTiming ? parseTtmlTime(endValue) : parentEnd;
  const intervalIsValid =
    !hasExplicitTiming || validInterval(begin, end, parentBegin, parentEnd);
  if (!intervalIsValid) state.parseFailed = true;
  state.divStack.push({ begin, end });
}

function openLine(state, node) {
  if (state.lines.length >= MAX_LYRIC_LINES) throw TTML_LIMIT_ABORT;
  const begin = parseTtmlTime(attribute(node, 'begin'));
  const end = parseTtmlTime(attribute(node, 'end'));
  const parent = state.divStack.at(-1);
  const parentBegin = parent?.begin ?? 0;
  const parentEnd = parent?.end ?? state.bodyDuration;
  state.currentLine = {
    begin,
    end,
    intervalValid: validInterval(begin, end, parentBegin, parentEnd),
    hasText: false,
    unwrappedText: false,
    validSegments: 0,
    invalidSegments: 0,
  };
  state.lines.push(state.currentLine);
}

function openSpan(state, node) {
  state.segmentElementCount += 1;
  if (state.segmentElementCount > MAX_LYRIC_SEGMENTS) throw TTML_LIMIT_ABORT;
  const beginValue = attribute(node, 'begin');
  const endValue = attribute(node, 'end');
  state.spanStack.push({
    begin: parseTtmlTime(beginValue),
    end: parseTtmlTime(endValue),
    hasExplicitTiming: beginValue !== undefined || endValue !== undefined,
    hasText: false,
    role: attribute(node, 'role', TTML_METADATA_NAMESPACE) || null,
    validDescendantCount: 0,
  });
}

function openElement(state, node) {
  state.elementCount += 1;
  if (
    state.elementCount > MAX_XML_ELEMENTS ||
    state.elementStack.length >= MAX_XML_DEPTH
  ) {
    throw TTML_LIMIT_ABORT;
  }
  state.elementStack.push(node);
  if (!state.rootSeen) return openRoot(state, node);
  if (node.uri !== TTML_NAMESPACE) return undefined;
  if (node.local === 'body') return openBody(state, node);
  if (node.local === 'div' && state.bodyDepth > 0) return openDiv(state, node);
  if (node.local === 'p' && state.bodyDepth > 0) return openLine(state, node);
  if (
    node.local === 'span' &&
    state.currentLine &&
    state.timingMode !== 'line'
  ) {
    return openSpan(state, node);
  }
  return undefined;
}

function markText(state, text) {
  if (!state.currentLine || !/\S/u.test(text)) return;
  state.currentLine.hasText = true;
  if (state.spanStack.length === 0) state.currentLine.unwrappedText = true;
  for (const span of state.spanStack) span.hasText = true;
}

function closeSpan(state) {
  const span = state.spanStack.pop();
  if (!span?.hasText) return;
  const timedAncestor = [...state.spanStack]
    .reverse()
    .find((ancestor) => ancestor.hasExplicitTiming);
  const ancestorIntervalIsValid =
    !timedAncestor ||
    validInterval(
      timedAncestor.begin,
      timedAncestor.end,
      state.currentLine.begin,
      state.currentLine.end,
    );
  const intervalIsValid =
    state.currentLine.intervalValid &&
    ancestorIntervalIsValid &&
    validInterval(
      span.begin,
      span.end,
      timedAncestor?.begin ?? state.currentLine.begin,
      timedAncestor?.end ?? state.currentLine.end,
    );
  if (intervalIsValid && span.validDescendantCount === 0) {
    state.currentLine.validSegments += 1;
    for (const ancestor of state.spanStack) ancestor.validDescendantCount += 1;
    return;
  }
  const isAuxiliary =
    !span.hasExplicitTiming && UNTYPED_AUXILIARY_ROLES.has(span.role);
  const hasValidAncestor = state.spanStack.some((ancestor) =>
    validInterval(
      ancestor.begin,
      ancestor.end,
      state.currentLine.begin,
      state.currentLine.end,
    ),
  );
  if (
    span.validDescendantCount === 0 &&
    !isAuxiliary &&
    (span.hasExplicitTiming || !hasValidAncestor)
  ) {
    state.currentLine.invalidSegments += 1;
  }
}

function closeElement(state) {
  const node = state.elementStack.pop();
  if (
    node?.uri === TTML_NAMESPACE &&
    node.local === 'span' &&
    state.currentLine &&
    state.timingMode !== 'line'
  ) {
    closeSpan(state);
  }
  if (node?.uri === TTML_NAMESPACE && node.local === 'p') {
    state.currentLine = null;
  }
  if (
    node?.uri === TTML_NAMESPACE &&
    node.local === 'div' &&
    state.bodyDepth > 0
  ) {
    state.divStack.pop();
  }
  if (node?.uri === TTML_NAMESPACE && node.local === 'body') {
    state.bodyDepth -= 1;
  }
}

function parseTtml(value) {
  const state = createParserState();
  const parser = sax.parser(true, {
    xmlns: true,
    position: false,
    strictEntities: true,
  });
  parser.onerror = () => {
    state.parseFailed = true;
  };
  parser.onopentag = (node) => openElement(state, node);
  parser.ontext = (text) => markText(state, text);
  parser.oncdata = (text) => markText(state, text);
  parser.onclosetag = () => closeElement(state);
  try {
    parser.write(value).close();
  } catch (error) {
    state.parseFailed = true;
    if (error !== TTML_LIMIT_ABORT) return state;
  }
  return state;
}

function summarizeLines(state, lyricLines) {
  if (state.timingMode === 'line') {
    return {
      status: 'ok',
      capability: 'T1',
      timingValidation: 'not-applicable',
      timingMode: 'line',
      lineCount: lyricLines.length,
      timedLineCount: 0,
      segmentCount: 0,
      invalidSegmentCount: 0,
    };
  }
  const segmentCount = lyricLines.reduce(
    (sum, line) => sum + line.validSegments,
    0,
  );
  const invalidSegmentCount = lyricLines.reduce(
    (sum, line) => sum + line.invalidSegments,
    0,
  );
  const timedLineCount = lyricLines.filter(
    (line) =>
      line.validSegments > 0 &&
      line.invalidSegments === 0 &&
      !line.unwrappedText,
  ).length;
  const resolvedMode =
    state.timingMode === 'auto' && segmentCount === 0
      ? 'line'
      : state.timingMode;
  if (resolvedMode === 'line') {
    return {
      status: 'ok',
      capability: 'T1',
      timingValidation: 'not-applicable',
      timingMode: 'line',
      lineCount: lyricLines.length,
      timedLineCount: 0,
      segmentCount: 0,
      invalidSegmentCount,
    };
  }
  const fullyTimed =
    timedLineCount === lyricLines.length && invalidSegmentCount === 0;
  return {
    status: 'ok',
    capability: fullyTimed ? 'T2' : timedLineCount > 0 ? 'partial-T2' : 'T2',
    timingValidation: fullyTimed
      ? 'valid'
      : timedLineCount > 0
        ? 'partial'
        : 'invalid',
    timingMode: 'word',
    lineCount: lyricLines.length,
    timedLineCount,
    segmentCount,
    invalidSegmentCount,
  };
}

export function classifyAmllTtml(value) {
  if (typeof value !== 'string' || value.length === 0) return invalidTtml();
  if (Buffer.byteLength(value, 'utf8') > DEFAULT_AMLL_TTML_RESPONSE_BYTES) {
    return invalidTtml('ttml-too-large');
  }
  if (value.charCodeAt(0) === 0xfeff) return invalidTtml();
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(value)) {
    return invalidTtml('unsafe-ttml');
  }
  const state = parseTtml(value);
  if (state.parseFailed || !state.rootSeen || state.elementStack.length !== 0) {
    return invalidTtml();
  }
  const lyricLines = state.lines.filter((line) => line.hasText);
  if (
    lyricLines.length === 0 ||
    lyricLines.some((line) => !line.intervalValid)
  ) {
    return invalidTtml();
  }
  return summarizeLines(state, lyricLines);
}
