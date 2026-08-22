import timingValues from '../../shared/lyricsTimingValues.json';
import { parseLyricsText } from './lyrics.js';

const SHA256_RE = /^[a-f0-9]{64}$/;

function stableHash(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

function toMilliseconds(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) : null;
}

function identityToken(sourceFingerprint, source, text, normalizerProfileId) {
  const sourceIdentity = SHA256_RE.test(sourceFingerprint)
    ? sourceFingerprint
    : `${source?.filename || ''}\0${text}`;
  return `${sourceIdentity}\0${normalizerProfileId}`;
}

function documentIdentity(identity, sourceFingerprint, normalizerProfileId) {
  if (SHA256_RE.test(sourceFingerprint)) {
    return `lyr_${sourceFingerprint}_${stableHash(normalizerProfileId)}`;
  }
  return `lyr_${stableHash(identity)}_${stableHash(`${identity}\0document`)}`;
}

export function normalizeLyricsDocument({
  text = '',
  source = null,
  sourceFingerprint = null,
  normalizerProfileId = timingValues.normalizerProfileId,
  timing = null,
} = {}) {
  if (timing?.status === 'current' && timing.document) {
    return timing.document;
  }

  const identity = identityToken(
    sourceFingerprint,
    source,
    text,
    normalizerProfileId,
  );
  const documentId = documentIdentity(
    identity,
    sourceFingerprint,
    normalizerProfileId,
  );
  const parsedLines = parseLyricsText(text, { source });
  const lines = parsedLines.map((line, index) => {
    const startMs = toMilliseconds(line.start);
    const endMs = toMilliseconds(line.end);
    return {
      lineId: `${documentId}_l_${index.toString(36)}`,
      text: line.text,
      startMs,
      endMs,
    };
  });

  return {
    schemaVersion: timingValues.schemaVersion,
    documentId,
    normalizerProfileId,
    source: {
      filename: source?.filename || '',
      sha256: SHA256_RE.test(sourceFingerprint) ? sourceFingerprint : null,
    },
    granularity: lines.some((line) => line.startMs !== null) ? 'T1' : 'T0',
    lines,
  };
}

export function projectLegacyLyricLines(document) {
  return (document?.lines ?? []).map((line) => ({
    lineId: line.lineId,
    text: line.text,
    start: line.startMs === null ? Number.NaN : line.startMs / 1000,
    end:
      line.endMs === null
        ? line.startMs === null
          ? Number.NaN
          : Number.POSITIVE_INFINITY
        : line.endMs / 1000,
  }));
}
