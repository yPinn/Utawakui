const LRC_TAG_RE = /\[([^\]]+)\]/gu;
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
  const fraction = match[3] || '';
  const millis = fraction ? Number(fraction.padEnd(3, '0').slice(0, 3)) : 0;
  return minutes * 60 + seconds + millis / 1000;
}

export function lrcTimestamps(value) {
  return [...String(value ?? '').matchAll(LRC_TAG_RE)]
    .map((match) => parseLrcTimestamp(match[1]))
    .filter((timestamp) => timestamp !== null);
}

export function stripLrcTimestampTags(value) {
  return String(value ?? '').replace(LRC_TAG_RE, (tag, content) =>
    parseLrcTimestamp(content) === null ? tag : '',
  );
}

export function isLrcMetadataLine(value) {
  const match = /^\[([^:\]]+):[^\]]*\]$/u.exec(String(value ?? '').trim());
  return Boolean(match && LRC_METADATA_KEYS.has(match[1].trim().toLowerCase()));
}
