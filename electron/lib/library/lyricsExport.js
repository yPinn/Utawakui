'use strict';

const { hasControlCharactersExceptLineBreaks } = require('../textGuards');
const { maxDocumentBytes } = require('../../../shared/lyricsTimingValues.json');
const {
  lrcTimestamps,
  normalizeLyricsNewlines,
  parseLrcTimestamp,
} = require('../../../shared/lrcParsing.mjs');

const pad = (value, digits = 2) => String(value).padStart(digits, '0');
const seconds = (ms) => Math.floor(ms / 1000);
function formatLrcTime(ms) {
  const ticks = Math.round(ms / 10);
  return `${pad(Math.floor(ticks / 6000))}:${pad(Math.floor(ticks / 100) % 60)}.${pad(ticks % 100)}`;
}
function formatSrtTime(ms) {
  const whole = seconds(ms);
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)},${pad(ms % 1000, 3)}`;
}

function buildLyricsExport(lines, { format, durationMs, offsetMs }) {
  const issues = {
    untimed: 0,
    invalid: 0,
    overlaps: 0,
    estimatedEnds: 0,
    adjustedBreaks: 0,
    sameTime: 0,
  };
  const timed = [];
  for (const [index, line] of lines.entries()) {
    if (line.startMs === null) {
      issues.untimed++;
      continue;
    }
    const start = line.startMs - offsetMs;
    if (
      !Number.isSafeInteger(start) ||
      start < 0 ||
      start >= durationMs ||
      !line.text.trim() ||
      hasControlCharactersExceptLineBreaks(line.text)
    ) {
      issues.invalid++;
      continue;
    }
    timed.push({ line, start, number: index + 1 });
  }
  const rows = [];
  const chunks = [];
  const overlapDetails = [];
  let lastTime = null;
  let coveringCue = null;
  for (const [index, { line, start, number }] of timed.entries()) {
    const cueText = normalizeLyricsNewlines(line.text).trim();
    if (format === 'lrc') {
      const text = cueText.replace(/\s*\n\s*/gu, ' ');
      const roundedStart = Math.round(start / 10) * 10;
      if (
        roundedStart >= Math.min(durationMs, 6_000_000) ||
        lrcTimestamps(text).length ||
        [...text.matchAll(/<([^<>]+)>/gu)].some(
          (match) => parseLrcTimestamp(match[1]) !== null,
        )
      ) {
        issues.invalid++;
        continue;
      }
      const time = formatLrcTime(roundedStart);
      if (text !== cueText) issues.adjustedBreaks++;
      if (time === lastTime) issues.sameTime++;
      lastTime = time;
      rows.push({ text, start: roundedStart });
      chunks.push(`[${time}]${text}`);
      continue;
    }
    const estimated = line.endMs === null || line.endInferred === true;
    const end = estimated
      ? Math.min(
          timed[index + 1]?.start ?? durationMs,
          durationMs,
          start + 4000,
        )
      : line.endMs - offsetMs;
    if (!Number.isSafeInteger(end) || end <= start || end > durationMs) {
      issues.invalid++;
      continue;
    }
    if (coveringCue && start < coveringCue.end) {
      issues.overlaps++;
      if (overlapDetails.length < 8)
        overlapDetails.push({
          earlier: coveringCue.number,
          later: number,
          start,
          end: Math.min(end, coveringCue.end),
          text: cueText.slice(0, 80),
        });
    }
    if (!coveringCue || end > coveringCue.end) coveringCue = { number, end };
    if (estimated) issues.estimatedEnds++;
    const text = cueText.replace(/\n(?:[ \t]*\n)+/gu, '\n');
    if (text !== cueText) issues.adjustedBreaks++;
    rows.push({ text, start, end, estimated });
    chunks.push(
      `${index + 1}\r\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\r\n${text.replaceAll('\n', '\r\n')}`,
    );
  }
  const output = `${chunks.join(format === 'lrc' ? '\r\n' : '\r\n\r\n')}\r\n`;
  if (Buffer.byteLength(output, 'utf8') > maxDocumentBytes) issues.invalid++;
  return {
    rows,
    issues,
    overlapDetails,
    text: !chunks.length || issues.invalid || issues.overlaps ? null : output,
  };
}

module.exports = { buildLyricsExport };
