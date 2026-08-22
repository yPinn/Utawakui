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
    const lineId = `${documentId}_l_${index.toString(36)}`;
    const normalized = {
      lineId,
      text: line.text,
      startMs,
      endMs,
    };
    if (Array.isArray(line.segments) && line.segments.length > 0) {
      normalized.segments = line.segments.map((segment, segmentIndex) => ({
        segmentId: `${lineId}_s_${segmentIndex.toString(36)}`,
        text: segment.text,
        startMs: toMilliseconds(segment.start),
        endMs: toMilliseconds(segment.end),
      }));
    }
    return normalized;
  });

  return {
    schemaVersion: timingValues.schemaVersion,
    documentId,
    normalizerProfileId,
    source: {
      filename: source?.filename || '',
      sha256: SHA256_RE.test(sourceFingerprint) ? sourceFingerprint : null,
    },
    granularity: lines.some((line) => line.segments)
      ? 'T2'
      : lines.some((line) => line.startMs !== null)
        ? 'T1'
        : 'T0',
    lines,
  };
}

function boundedProgress(positionMs, startMs, endMs) {
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return null;
  }
  return Math.min(1, Math.max(0, (positionMs - startMs) / (endMs - startMs)));
}

function emptyPlaybackState() {
  return {
    activeLineId: null,
    activeLineIndex: -1,
    activeLineProgress: null,
    activeSegmentId: null,
    activeSegmentIndex: -1,
    activeSegmentProgress: null,
  };
}

export function deriveLyricsPlaybackState(
  document,
  positionMs,
  durationMs = null,
) {
  const lines = document?.lines ?? [];
  if (!Number.isFinite(positionMs)) return emptyPlaybackState();

  const lineIndex = lines.findLastIndex((line, index) => {
    if (!Number.isFinite(line.startMs) || positionMs < line.startMs)
      return false;
    const endMs =
      line.endMs ??
      lines[index + 1]?.startMs ??
      durationMs ??
      Number.POSITIVE_INFINITY;
    return positionMs < endMs;
  });
  if (lineIndex === -1) return emptyPlaybackState();

  const line = lines[lineIndex];
  const lineEndMs =
    line.endMs ??
    lines[lineIndex + 1]?.startMs ??
    durationMs ??
    Number.POSITIVE_INFINITY;
  const state = {
    ...emptyPlaybackState(),
    activeLineId: line.lineId,
    activeLineIndex: lineIndex,
    activeLineProgress: boundedProgress(positionMs, line.startMs, lineEndMs),
  };

  const segments = line.segments ?? [];
  const segmentIndex = segments.findLastIndex((segment, index) => {
    if (!Number.isFinite(segment.startMs) || positionMs < segment.startMs) {
      return false;
    }
    const endMs = segment.endMs ?? segments[index + 1]?.startMs ?? lineEndMs;
    return positionMs < endMs;
  });
  if (segmentIndex === -1) return state;

  const segment = segments[segmentIndex];
  const segmentEndMs =
    segment.endMs ?? segments[segmentIndex + 1]?.startMs ?? lineEndMs;
  return {
    ...state,
    activeSegmentId: segment.segmentId,
    activeSegmentIndex: segmentIndex,
    activeSegmentProgress: boundedProgress(
      positionMs,
      segment.startMs,
      segmentEndMs,
    ),
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
