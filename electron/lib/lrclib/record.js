'use strict';

const crypto = require('crypto');

const LRCLIB_RECORD_LIMITS = Object.freeze({
  metadataChars: 2048,
  lyricsChars: 1_000_000,
});

function containsControlCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint <= 8 ||
      codePoint === 11 ||
      codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) ||
      codePoint === 127
    ) {
      return true;
    }
  }
  return false;
}

function invalidRecord(issues) {
  return { status: 'error', reason: 'invalid-record', issues };
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredIdentity(value, fieldName, issues) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    containsControlCharacters(value)
  ) {
    issues.push(`invalid-${fieldName}`);
    return null;
  }
  if (value.length > LRCLIB_RECORD_LIMITS.metadataChars) {
    issues.push(`${fieldName}-too-large`);
    return null;
  }
  return value;
}

function optionalMetadata(value, fieldName, issues) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || containsControlCharacters(value)) {
    issues.push(`invalid-${fieldName}`);
    return null;
  }
  if (value.length > LRCLIB_RECORD_LIMITS.metadataChars) {
    issues.push(`${fieldName}-too-large`);
    return null;
  }
  return value;
}

function optionalLyrics(value, fieldName, issues) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    issues.push(`invalid-${fieldName}`);
    return null;
  }
  if (value.length > LRCLIB_RECORD_LIMITS.lyricsChars) {
    issues.push(`${fieldName}-too-large`);
    return null;
  }
  return value;
}

function normalizeLrclibRecord(value) {
  if (!isPlainRecord(value)) return invalidRecord(['invalid-root']);

  const issues = [];
  const id = value.id;
  if (!Number.isSafeInteger(id) || id <= 0) issues.push('invalid-id');

  const name = optionalMetadata(value.name, 'name', issues);
  const trackName = requiredIdentity(value.trackName, 'track-name', issues);
  const artistName = requiredIdentity(value.artistName, 'artist-name', issues);
  const albumName = optionalMetadata(value.albumName, 'album-name', issues);

  const duration = value.duration ?? null;
  if (duration !== null && (!Number.isFinite(duration) || duration < 0)) {
    issues.push('invalid-duration');
  }

  if (typeof value.instrumental !== 'boolean') {
    issues.push('invalid-instrumental');
  }

  const plainLyrics = optionalLyrics(value.plainLyrics, 'plain-lyrics', issues);
  const syncedLyrics = optionalLyrics(
    value.syncedLyrics,
    'synced-lyrics',
    issues,
  );
  const lyricsfile = optionalLyrics(value.lyricsfile, 'lyricsfile', issues);

  if (issues.length > 0) return invalidRecord(issues);

  return {
    status: 'ok',
    record: {
      id,
      name,
      trackName,
      artistName,
      albumName,
      duration,
      instrumental: value.instrumental,
      plainLyrics,
      syncedLyrics,
      lyricsfile,
    },
  };
}

function fingerprintLrclibRecord(value) {
  const normalized = normalizeLrclibRecord(value);
  if (normalized.status !== 'ok') {
    throw new Error('cannot fingerprint an invalid lrclib record');
  }
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized.record))
    .digest('hex');
}

module.exports = {
  LRCLIB_RECORD_LIMITS,
  fingerprintLrclibRecord,
  normalizeLrclibRecord,
};
