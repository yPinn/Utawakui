import { t } from './i18n.js';
import {
  alignSessionTimepoints,
  groupSessionTimepoints,
} from '../../shared/sessionExportTimepoints.mjs';
export { parseObsTimecode } from '../../shared/sessionExportTimepoints.mjs';
// Pure projection from a sessionHistoryService.js session file into a
// YouTube chapter list. No IPC/DOM here — see useObsSessionExport.js for
// the composable that feeds this real session data.

// YouTube's own documented chapter requirements: at least 3 timestamps,
// strictly ascending, each at least 10s apart, and the first must be 0:00.
const YOUTUBE_MIN_CHAPTERS = 3;
const YOUTUBE_MIN_GAP_MS = 10_000;

// YouTube's chapter format: M:SS below an hour, H:MM:SS past one — leading
// unit unpadded, matching formatDuration's convention in format.js (a
// different, unpadded style from formatElapsedClock's always-HH:MM:SS,
// because this text is pasted verbatim into a YouTube description where
// that's the expected shape).
export function formatChapterTimestamp(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  if (!totalSeconds) return '00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

export function formatSessionTimepointLabel(entry) {
  const label =
    entry.type === 'marker'
      ? entry.label
      : entry.artist
        ? `${entry.title} - ${entry.artist}`
        : entry.title;
  return (
    String(label ?? '')
      .replace(/[\r\n\u2028\u2029]+/gu, ' ')
      .trim() || t('obs.export.markerFallback')
  );
}

// entries: session.entries from sessionHistoryService.js (track + marker
// entries). source: 'stream' | 'record' selects which output's timecode to
// project; entries lacking it are dropped, not shown as broken rows. offsetMs
// shifts every timestamp when the VOD start differs from OBS's output start;
// stored entries are never rewritten.
//
// Deliberately does NOT force the first chapter to 0:00: relabeling a song that
// really starts minutes in would be a wrong timestamp. A non-zero first chapter
// surfaces an issue instead; fix it with a real 0:00 marker (addMarker() in
// sessionHistoryService.js) or a corrected offset.
export function projectYoutubeChapters(
  entries,
  { offsetMs = 0, source = 'stream' } = {},
) {
  const { segments } = groupSessionTimepoints(entries, source);
  return formatYoutubeChapters(
    alignSessionTimepoints(segments.length === 1 ? segments[0] : [], offsetMs)
      .rows,
  );
}

export function formatYoutubeChapters(rows, { includeOpening = false } = {}) {
  const lines = rows.map(({ entry, ms }) => ({
    ms,
    time: formatChapterTimestamp(ms),
    label: formatSessionTimepointLabel(entry),
  }));
  if (includeOpening && lines.length && lines[0].time !== '00:00') {
    lines.unshift({
      ms: 0,
      time: '00:00',
      label: t('obs.export.openingLabel'),
    });
  }
  const seconds = lines.map(({ ms }) => Math.round(ms / 1000));

  const issues = [];
  if (lines.length < YOUTUBE_MIN_CHAPTERS) {
    issues.push({
      code: 'too-few-chapters',
      message: t('obs.export.tooFew', {
        min: YOUTUBE_MIN_CHAPTERS,
        count: lines.length,
      }),
    });
  }
  if (lines.length > 0 && seconds[0] !== 0) {
    issues.push({
      code: 'first-chapter-not-zero',
      message: t('obs.export.firstNotZero'),
    });
  }
  for (let i = 1; i < lines.length; i += 1) {
    const gapMs = (seconds[i] - seconds[i - 1]) * 1000;
    if (gapMs < YOUTUBE_MIN_GAP_MS) {
      issues.push({
        code: 'chapters-too-close',
        message: t('obs.export.tooClose', { index: i, next: i + 1 }),
        index: i,
      });
    }
  }

  return {
    lines,
    text: lines.map((line) => `${line.time} ${line.label}`).join('\n'),
    valid: issues.length === 0,
    issues,
  };
}
