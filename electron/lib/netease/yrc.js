'use strict';

const { parseLrcLines } = require('../lrclib/lrc.js');

const MAX_LYRIC_BYTES = 2 * 1024 * 1024;
const MAX_YRC_LINES = 20_000;
const MAX_YRC_SEGMENTS = 100_000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const YRC_LINE_RE = /^\[(\d+),(\d+)\](.*)$/u;
const YRC_SEGMENT_RE = /\((\d+),(\d+),(\d+)\)/gu;

function payloadTooLarge(value) {
  return Buffer.byteLength(value, 'utf8') > MAX_LYRIC_BYTES;
}

function safeInteger(value, minimum = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
}

function formatLrcTimestamp(milliseconds) {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0',
  )}.${String(millis).padStart(3, '0')}`;
}

function normalizeSourceText(value) {
  const text = String(value || '').trim();
  return text ? `${text}\n` : '';
}

function parseYrc(value) {
  if (payloadTooLarge(value)) {
    return { status: 'error', reason: 'response-too-large' };
  }
  const rawLines = value
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (rawLines.length > MAX_YRC_LINES) {
    return { status: 'error', reason: 'response-too-large' };
  }

  const lines = [];
  let segmentCount = 0;
  let previousLineStart = -1;
  for (const rawLine of rawLines) {
    if (rawLine.trimStart().startsWith('{')) {
      try {
        JSON.parse(rawLine);
      } catch {
        return { status: 'invalid' };
      }
      continue;
    }

    const header = YRC_LINE_RE.exec(rawLine);
    if (!header) return { status: 'invalid' };
    const startMs = safeInteger(header[1]);
    const durationMs = safeInteger(header[2], 1);
    const endMs =
      startMs === null || durationMs === null ? null : startMs + durationMs;
    if (
      startMs === null ||
      durationMs === null ||
      !Number.isSafeInteger(endMs) ||
      endMs > MAX_DURATION_MS ||
      startMs < previousLineStart
    ) {
      return { status: 'invalid' };
    }

    const body = header[3];
    const matches = [...body.matchAll(YRC_SEGMENT_RE)];
    if (matches.length === 0 || body.slice(0, matches[0].index).trim()) {
      return { status: 'invalid' };
    }

    const words = [];
    let previousEnd = startMs;
    for (const [index, match] of matches.entries()) {
      segmentCount += 1;
      if (segmentCount > MAX_YRC_SEGMENTS) {
        return { status: 'error', reason: 'response-too-large' };
      }
      const wordStartMs = safeInteger(match[1]);
      const wordDurationMs = safeInteger(match[2], 1);
      const markerValue = safeInteger(match[3]);
      const wordEndMs =
        wordStartMs === null || wordDurationMs === null
          ? null
          : wordStartMs + wordDurationMs;
      const textStart = match.index + match[0].length;
      const textEnd = matches[index + 1]?.index ?? body.length;
      const text = body.slice(textStart, textEnd);
      if (
        wordStartMs === null ||
        wordDurationMs === null ||
        markerValue === null ||
        !Number.isSafeInteger(wordEndMs) ||
        wordStartMs < startMs ||
        wordStartMs < previousEnd ||
        wordEndMs > endMs ||
        text.length === 0
      ) {
        return { status: 'invalid' };
      }
      words.push({ text, startMs: wordStartMs, endMs: wordEndMs });
      previousEnd = wordEndMs;
    }

    const text = words.map((word) => word.text).join('');
    if (!text.trim()) return { status: 'invalid' };
    lines.push({ text, startMs, endMs, words });
    previousLineStart = startMs;
  }

  if (lines.length === 0) return { status: 'invalid' };
  return { status: 'ok', document: { lines }, segmentCount };
}

function analyzeFallback(lrcLyrics, warnings) {
  const sourceText = normalizeSourceText(lrcLyrics);
  const timedLines = parseLrcLines(lrcLyrics);
  const level = timedLines.length > 0 ? 'T1' : 'T0';
  return {
    status: 'ok',
    capability: { level, partial: false },
    compatibility: {
      t0: sourceText.length > 0,
      t1: level === 'T1',
      t2: false,
    },
    warnings,
    lineCount:
      level === 'T1'
        ? timedLines.length
        : String(lrcLyrics || '')
            .split(/\r?\n/u)
            .filter((line) => line.trim()).length,
    segmentCount: 0,
    sourceText,
    document: null,
  };
}

function analyzeNeteaseLyrics(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.yrcLyrics !== 'string' ||
    typeof value.lrcLyrics !== 'string'
  ) {
    return { status: 'error', reason: 'invalid-record' };
  }
  if (payloadTooLarge(value.lrcLyrics)) {
    return { status: 'error', reason: 'response-too-large' };
  }

  if (value.yrcLyrics) {
    const parsed = parseYrc(value.yrcLyrics);
    if (parsed.status === 'error') return parsed;
    if (parsed.status === 'ok') {
      const sourceText = `${parsed.document.lines
        .map((line) => `[${formatLrcTimestamp(line.startMs)}]${line.text}`)
        .join('\n')}\n`;
      return {
        status: 'ok',
        capability: { level: 'T2', partial: false },
        compatibility: { t0: true, t1: true, t2: true },
        warnings: [],
        lineCount: parsed.document.lines.length,
        segmentCount: parsed.segmentCount,
        sourceText,
        document: parsed.document,
      };
    }
    return analyzeFallback(value.lrcLyrics, ['invalid-yrc']);
  }

  return analyzeFallback(value.lrcLyrics, []);
}

module.exports = { analyzeNeteaseLyrics };
