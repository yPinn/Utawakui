const LRC_TIME_RE = /^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/u;
const LRC_METADATA_KEYS = new Set([
  'al',
  'ar',
  'au',
  'by',
  'id',
  'la',
  'length',
  'offset',
  're',
  'ti',
  'tool',
  've',
]);

export function parseLrcTimestamp(value) {
  const match = LRC_TIME_RE.exec(String(value || '').trim());
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (seconds > 59) return null;
  const fraction = match[3] || '';
  const millis = fraction ? Number(fraction.padEnd(3, '0').slice(0, 3)) : 0;
  return minutes * 60 + seconds + millis / 1000;
}

export function lrcTimestamps(value) {
  return leadingLrcTags(value).timestamps;
}

export function stripLrcTimestampTags(value) {
  return leadingLrcTags(value).text;
}

function leadingLrcTags(value) {
  let text = String(value ?? '').trimStart();
  const timestamps = [];
  while (text.startsWith('[')) {
    const end = text.indexOf(']');
    if (end === -1) break;
    const timestamp = parseLrcTimestamp(text.slice(1, end));
    if (timestamp === null) break;
    timestamps.push(timestamp);
    text = text.slice(end + 1).trimStart();
  }
  return { timestamps, text };
}

export function normalizeLyricsNewlines(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?|\u2028|\u2029/gu, '\n');
}

export function isLrcMetadataLine(value) {
  const match = /^\[([^:\]]+):[^\]]*\]$/u.exec(String(value ?? '').trim());
  return Boolean(match && LRC_METADATA_KEYS.has(match[1].trim().toLowerCase()));
}
