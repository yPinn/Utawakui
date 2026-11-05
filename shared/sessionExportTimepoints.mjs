const OBS_TIMECODE_PATTERN = /^(\d+):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/u;

export function parseObsTimecode(timecode) {
  if (typeof timecode !== 'string') return null;
  const match = OBS_TIMECODE_PATTERN.exec(timecode);
  if (!match) return null;
  const [, hours, minutes, seconds, fraction = '0'] = match;
  const milliseconds =
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1000 +
    Number(fraction.padEnd(3, '0'));
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

export function groupSessionTimepoints(entries, source) {
  const segments = [];
  let missingCount = 0;
  let previous = null;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const output = entry?.[source];
    const rawMs = parseObsTimecode(output?.timecode);
    if (rawMs === null) {
      missingCount++;
      continue;
    }
    const observedAt = Date.parse(entry.occurredAt);
    const segmentId = output.segmentId ?? null;
    const row = { entry, rawMs, observedAt, segmentId };
    if (
      !previous ||
      previous.segmentId !== segmentId ||
      (observedAt > previous.observedAt && rawMs < previous.rawMs)
    ) {
      segments.push([]);
    }
    segments.at(-1).push(row);
    previous = row;
  }
  return { segments, missingCount };
}

export function alignSessionTimepoints(segment = [], offsetMs = 0) {
  const rows = [];
  let trimmedCount = 0;
  for (const { entry, rawMs } of segment) {
    const ms = rawMs - offsetMs;
    if (ms < 0 || !Number.isSafeInteger(ms)) trimmedCount++;
    else rows.push({ entry, ms });
  }
  rows.sort((left, right) => left.ms - right.ms);
  return { rows, trimmedCount };
}

export function formatMarkerTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const clock = [hours, minutes, seconds % 60]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
  return `${clock}.${String(milliseconds % 1000).padStart(3, '0')}`;
}

function csvCell(value) {
  const text = String(value ?? '');
  const safe =
    /^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)
      ? `'${text}`
      : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildSessionMarkerCsv(rows, source) {
  if (!rows.length) return '';
  const lines = rows.map(({ entry, ms }) =>
    [
      formatMarkerTime(ms),
      ms,
      entry.type,
      entry.type === 'marker' ? entry.label : entry.title,
      entry.artist,
      source,
    ]
      .map(csvCell)
      .join(','),
  );
  return `\uFEFFtime,elapsed_ms,type,title,artist,source\r\n${lines.join('\r\n')}\r\n`;
}
