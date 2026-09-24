// Pure projection from a sessionHistoryService.js session file into a
// YouTube chapter list. No IPC/DOM here — see useObsSessionExport.js for
// the composable that feeds this real session data.

// obs-websocket's own outputTimecode format, e.g. "01:02:03.456".
const OBS_TIMECODE_PATTERN = /^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/;

// YouTube's own documented chapter requirements: at least 3 timestamps,
// strictly ascending, each at least 10s apart, and the first must be 0:00.
const YOUTUBE_MIN_CHAPTERS = 3;
const YOUTUBE_MIN_GAP_MS = 10_000;

export function parseObsTimecode(timecode) {
  if (typeof timecode !== 'string') return null;
  const match = OBS_TIMECODE_PATTERN.exec(timecode);
  if (!match) return null;
  const [, hours, minutes, seconds, fraction = '0'] = match;
  const ms = Number(fraction.padEnd(3, '0').slice(0, 3));
  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1000 +
    ms
  );
}

// YouTube's chapter format: M:SS below an hour, H:MM:SS past one — leading
// unit unpadded, matching formatDuration's convention in format.js (a
// different, unpadded style from formatElapsedClock's always-HH:MM:SS,
// because this text is pasted verbatim into a YouTube description where
// that's the expected shape).
export function formatChapterTimestamp(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

function chapterLabel(entry) {
  if (entry.type === 'marker') return entry.label || '標記';
  return entry.artist ? `${entry.title} - ${entry.artist}` : entry.title;
}

// entries: sessionHistoryService.js's session.entries (track + marker
// entries mixed). source: 'stream' | 'record' — which output's timecode to
// project; entries missing that output (never active, or a failed
// snapshot) are silently dropped, not shown as broken rows. offsetMs
// corrects for a VOD's own start point differing from OBS's raw output
// duration (e.g. stream setup time trimmed off before upload) — subtracted
// from every timestamp, never rewriting the stored entries.
//
// Deliberately does NOT force the first chapter's displayed time to 0:00 —
// if the real first song starts a few minutes into the video (e.g. after
// pre-stream chat), silently relabeling it "0:00" would just be a wrong
// timestamp. When the first entry isn't already at 0 (because offsetMs was
// set precisely, or an entry genuinely sits there), this surfaces a
// first-chapter-not-zero issue instead — the fix is a real 0:00 marker
// (see sessionHistoryService.js's addMarker(), wired to the same session)
// or a corrected offset, not a silent rewrite.
export function projectYoutubeChapters(
  entries,
  { offsetMs = 0, source = 'stream' } = {},
) {
  const usable = (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const rawMs = parseObsTimecode(entry?.[source]?.timecode);
      if (rawMs === null) return null;
      return { entry, ms: Math.max(0, rawMs - offsetMs) };
    })
    .filter((row) => row !== null)
    .sort((a, b) => a.ms - b.ms);

  const issues = [];
  if (usable.length < YOUTUBE_MIN_CHAPTERS) {
    issues.push({
      code: 'too-few-chapters',
      message: `YouTube 章節至少需要 ${YOUTUBE_MIN_CHAPTERS} 段，目前只有 ${usable.length} 段。`,
    });
  }
  if (usable.length > 0 && usable[0].ms !== 0) {
    issues.push({
      code: 'first-chapter-not-zero',
      message:
        '第一段時間戳不是 0:00，YouTube 章節格式要求第一段從 0:00 開始；可以在真正開場時新增一個標記，或調整偏移量。',
    });
  }
  for (let i = 1; i < usable.length; i += 1) {
    const gapMs = usable[i].ms - usable[i - 1].ms;
    if (gapMs < YOUTUBE_MIN_GAP_MS) {
      issues.push({
        code: 'chapters-too-close',
        message: `第 ${i} 與第 ${i + 1} 段間隔不足 10 秒，YouTube 可能拒絕這份章節清單。`,
        index: i,
      });
    }
  }

  const lines = usable.map(({ entry, ms }) => ({
    ms,
    time: formatChapterTimestamp(ms),
    label: chapterLabel(entry),
  }));

  return {
    lines,
    text: lines.map((line) => `${line.time} ${line.label}`).join('\n'),
    valid: issues.length === 0,
    issues,
  };
}
