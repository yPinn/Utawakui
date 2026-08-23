'use strict';

const yaml = require('js-yaml');

const LYRICSFILE_LIMITS = Object.freeze({
  maxBytes: 1_000_000,
  maxDepth: 24,
  maxNodes: 100_000,
  maxLines: 5000,
  maxWordsPerLine: 1000,
  maxWordsTotal: 50_000,
});

const TOP_LEVEL_KEYS = new Set(['version', 'metadata', 'lines', 'plain']);
const METADATA_KEYS = new Set([
  'title',
  'artist',
  'album',
  'duration_ms',
  'offset_ms',
  'language',
  'instrumental',
]);
const LINE_KEYS = new Set(['text', 'start_ms', 'end_ms', 'words']);
const WORD_KEYS = new Set(['text', 'start_ms', 'end_ms']);

function structuralError(issue) {
  return { status: 'error', reason: 'structural-error', issues: [issue] };
}

function semanticError(issues) {
  return { status: 'error', reason: 'semantic-error', issues };
}

function isPlainMapping(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function firstUnexpectedKey(value, allowedKeys) {
  return Object.keys(value).find((key) => !allowedKeys.has(key)) || null;
}

function structuralShapeIssue(value, limits) {
  if (!isPlainMapping(value.metadata)) return 'invalid-metadata';
  if (firstUnexpectedKey(value.metadata, METADATA_KEYS)) {
    return 'unexpected-metadata-field';
  }
  if (
    value.plain !== null &&
    value.plain !== undefined &&
    typeof value.plain !== 'string'
  ) {
    return 'invalid-plain';
  }
  if (value.lines === null || value.lines === undefined) return null;
  if (!Array.isArray(value.lines)) return 'invalid-lines';
  if (value.lines.length > limits.maxLines) return 'too-many-lines';

  let wordCount = 0;
  for (const line of value.lines) {
    if (!isPlainMapping(line)) return 'invalid-line';
    if (firstUnexpectedKey(line, LINE_KEYS)) return 'unexpected-line-field';
    if (line.words === null || line.words === undefined) continue;
    if (!Array.isArray(line.words)) return 'invalid-words';
    if (line.words.length > limits.maxWordsPerLine) {
      return 'too-many-words-in-line';
    }
    wordCount += line.words.length;
    if (wordCount > limits.maxWordsTotal) return 'too-many-words';
    for (const word of line.words) {
      if (!isPlainMapping(word)) return 'invalid-word';
      if (firstUnexpectedKey(word, WORD_KEYS)) return 'unexpected-word-field';
    }
  }
  return null;
}

function parseYamlStructure(source, limits) {
  let events;
  try {
    events = yaml.parseEvents(source, { maxDepth: limits.maxDepth });
  } catch (error) {
    const issue = String(error?.reason || error?.message).includes(
      'nesting exceeded',
    )
      ? 'nesting-too-deep'
      : 'invalid-yaml';
    return structuralError(issue);
  }

  if (events.length > limits.maxNodes) return structuralError('too-many-nodes');
  if (events.filter((event) => event.type === 1).length > 1) {
    return structuralError('multiple-documents');
  }
  if (events.some((event) => event.type === 5)) {
    return structuralError('alias-not-allowed');
  }
  if (events.some((event) => event.anchorStart >= 0)) {
    return structuralError('alias-not-allowed');
  }
  if (events.some((event) => event.tagStart >= 0)) {
    return structuralError('tag-not-allowed');
  }

  try {
    return {
      status: 'ok',
      value: yaml.load(source, {
        schema: yaml.CORE_SCHEMA,
        maxDepth: limits.maxDepth,
        maxAliases: 0,
        maxTotalMergeKeys: 0,
      }),
    };
  } catch (error) {
    const detail = String(error?.reason || error?.message);
    if (detail.includes('duplicated mapping key')) {
      return structuralError('duplicate-key');
    }
    if (detail.includes('single document') || detail.includes('more')) {
      return structuralError('multiple-documents');
    }
    return structuralError('invalid-yaml');
  }
}

function optionalString(value, fieldName, issues) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    issues.push(`invalid-${fieldName}`);
    return null;
  }
  return value;
}

function requiredString(value, fieldName, issues) {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push(`invalid-${fieldName}`);
    return null;
  }
  return value;
}

function optionalInteger(value, fieldName, issues, options = {}) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || (options.nonNegative && value < 0)) {
    issues.push(`invalid-${fieldName}`);
    return null;
  }
  return value;
}

function timingEnd(value, startMs, scope, issues) {
  const endMs = optionalInteger(value, `${scope}-end-ms`, issues, {
    nonNegative: true,
  });
  if (endMs !== null && startMs !== null && endMs < startMs) {
    issues.push(`${scope}-end-before-start`);
  }
  return endMs;
}

function normalizeMetadata(value, issues) {
  if (!isPlainMapping(value)) {
    issues.push('invalid-metadata');
    return null;
  }
  if (firstUnexpectedKey(value, METADATA_KEYS)) {
    issues.push('unexpected-metadata-field');
  }
  const title = requiredString(value.title, 'metadata-title', issues);
  const artist = requiredString(value.artist, 'metadata-artist', issues);
  const album = optionalString(value.album, 'metadata-album', issues);
  const durationMs = optionalInteger(
    value.duration_ms,
    'metadata-duration-ms',
    issues,
    { nonNegative: true },
  );
  const offsetMs = optionalInteger(
    value.offset_ms,
    'metadata-offset-ms',
    issues,
  );
  const language = optionalString(value.language, 'metadata-language', issues);
  const instrumental = value.instrumental ?? false;
  if (typeof instrumental !== 'boolean') {
    issues.push('invalid-metadata-instrumental');
  }
  return {
    title,
    artist,
    album,
    durationMs,
    offsetMs,
    language,
    instrumental,
  };
}

function normalizeWord(value, issues) {
  if (!isPlainMapping(value)) {
    issues.push('invalid-word');
    return null;
  }
  if (firstUnexpectedKey(value, WORD_KEYS))
    issues.push('unexpected-word-field');
  const text = requiredString(value.text, 'word-text', issues);
  const startMs = optionalInteger(value.start_ms, 'word-start-ms', issues, {
    nonNegative: true,
  });
  if (value.start_ms === null || value.start_ms === undefined) {
    issues.push('missing-word-start-ms');
  }
  const endMs = timingEnd(value.end_ms, startMs, 'word', issues);
  return { text, startMs, endMs };
}

function normalizeLine(value, limits, counters, issues) {
  if (!isPlainMapping(value)) {
    issues.push('invalid-line');
    return null;
  }
  if (firstUnexpectedKey(value, LINE_KEYS))
    issues.push('unexpected-line-field');
  const text = requiredString(value.text, 'line-text', issues);
  const startMs = optionalInteger(value.start_ms, 'line-start-ms', issues, {
    nonNegative: true,
  });
  if (value.start_ms === null || value.start_ms === undefined) {
    issues.push('missing-line-start-ms');
  }
  const endMs = timingEnd(value.end_ms, startMs, 'line', issues);

  let words = [];
  if (value.words !== null && value.words !== undefined) {
    if (!Array.isArray(value.words)) {
      issues.push('invalid-words');
    } else if (value.words.length > limits.maxWordsPerLine) {
      issues.push('too-many-words-in-line');
    } else {
      counters.words += value.words.length;
      words = value.words
        .map((word) => normalizeWord(word, issues))
        .filter(Boolean);
    }
  }
  if (words.length > 0 && words.map((word) => word.text).join('') !== text) {
    issues.push('word-text-mismatch');
  }
  return { text, startMs, endMs, words };
}

function normalizeLines(value, limits, issues) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push('invalid-lines');
    return [];
  }
  if (value.length > limits.maxLines) {
    issues.push('too-many-lines');
    return [];
  }
  const counters = { words: 0 };
  const lines = value
    .map((line) => normalizeLine(line, limits, counters, issues))
    .filter(Boolean);
  if (counters.words > limits.maxWordsTotal) issues.push('too-many-words');
  return lines;
}

function hasOverlap(items) {
  const timed = items
    .filter(
      (item) => Number.isFinite(item.startMs) && Number.isFinite(item.endMs),
    )
    .toSorted((first, second) => first.startMs - second.startMs);
  let latestEnd = Number.NEGATIVE_INFINITY;
  for (const item of timed) {
    if (item.startMs < latestEnd) return true;
    latestEnd = Math.max(latestEnd, item.endMs);
  }
  return false;
}

function deriveCapabilities(document) {
  const warnings = [];
  if (document.metadata.offsetMs !== null) warnings.push('offset-present');

  const hasPlain =
    typeof document.plain === 'string' && document.plain.length > 0;
  const hasLines = document.lines.length > 0;
  const wordTimedLineCount = document.lines.filter(
    (line) => line.words.length > 0,
  ).length;
  const hasWords = wordTimedLineCount > 0;
  const partialWords = hasWords && wordTimedLineCount < document.lines.length;
  const overlappingLines = hasOverlap(document.lines);
  const overlappingWords = document.lines.some((line) =>
    hasOverlap(line.words),
  );

  if (partialWords) warnings.push('partial-word-timing');
  if (overlappingLines) warnings.push('overlapping-lines');
  if (overlappingWords) warnings.push('overlapping-words');

  let level = 'T0';
  if (document.metadata.instrumental) level = 'instrumental';
  else if (hasWords) level = 'T2';
  else if (hasLines) level = 'T1';

  return {
    capability: { level, partial: partialWords },
    compatibility: {
      t0: hasPlain,
      t1: hasLines,
      t2: hasWords && !partialWords && !overlappingLines && !overlappingWords,
    },
    warnings,
  };
}

function parseLyricsfile(source, options = {}) {
  if (typeof source !== 'string') return structuralError('invalid-document');
  const limits = { ...LYRICSFILE_LIMITS, ...options };
  if (Buffer.byteLength(source, 'utf8') > limits.maxBytes) {
    return structuralError('document-too-large');
  }

  const parsed = parseYamlStructure(source, limits);
  if (parsed.status === 'error') return parsed;
  if (!isPlainMapping(parsed.value)) return structuralError('invalid-root');
  if (typeof parsed.value.version !== 'string') {
    return semanticError(['invalid-version-type']);
  }
  if (parsed.value.version !== '1.0') {
    return {
      status: 'unsupported',
      reason: 'unknown-version',
      version: parsed.value.version,
    };
  }
  if (firstUnexpectedKey(parsed.value, TOP_LEVEL_KEYS)) {
    return structuralError('unexpected-top-level-field');
  }
  const shapeIssue = structuralShapeIssue(parsed.value, limits);
  if (shapeIssue) return structuralError(shapeIssue);

  const issues = [];
  const metadata = normalizeMetadata(parsed.value.metadata, issues);
  const plain = optionalString(parsed.value.plain, 'plain', issues);
  const lines = normalizeLines(parsed.value.lines, limits, issues);
  if (metadata?.instrumental && (lines.length > 0 || plain)) {
    issues.push('instrumental-has-lyrics');
  }
  if (metadata && !metadata.instrumental && lines.length === 0 && !plain) {
    issues.push('missing-lyrics');
  }
  if (issues.length > 0) return semanticError([...new Set(issues)]);

  const document = { metadata, plain, lines };
  return {
    status: 'ok',
    version: '1.0',
    document,
    ...deriveCapabilities(document),
  };
}

module.exports = { LYRICSFILE_LIMITS, parseLyricsfile };
