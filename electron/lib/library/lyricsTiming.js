'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('../atomicWrite');
const timingValues = require('../../../shared/lyricsTimingValues.json');
const { LYRICS_DIRNAME } = require('./constants');
const { isLyricsSubtitleFilename } = require('./paths');

const LYRICS_TIMING_SCHEMA_VERSION = timingValues.schemaVersion;
const LYRICS_NORMALIZER_PROFILE_ID = timingValues.normalizerProfileId;
const TIMING_DIRNAME = 'timing';
const HASH_BUFFER_BYTES = 64 * 1024;
const MAX_SOURCE_FILENAME_LENGTH = 240;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function sourcePath(trackDir, sourceFilename) {
  if (
    !isLyricsSubtitleFilename(sourceFilename) ||
    sourceFilename.length > MAX_SOURCE_FILENAME_LENGTH
  ) {
    return null;
  }
  return path.join(trackDir, LYRICS_DIRNAME, sourceFilename);
}

function timingSidecarPath(trackDir, sourceFilename) {
  if (!sourcePath(trackDir, sourceFilename)) return null;
  return path.join(
    trackDir,
    LYRICS_DIRNAME,
    TIMING_DIRNAME,
    `${sourceFilename}.json`,
  );
}

function computeLyricsSourceFingerprint(trackDir, sourceFilename) {
  const filePath = sourcePath(trackDir, sourceFilename);
  if (!filePath) return null;
  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(filePath, 'r');
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(HASH_BUFFER_BYTES);
    let bytesRead;
    do {
      bytesRead = fs.readSync(fileDescriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
    return hash.digest('hex');
  } catch {
    return null;
  } finally {
    if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function validateId(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > timingValues.maxIdLength ||
    !ID_RE.test(value)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function validateText(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > timingValues.maxTextLength
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function validateTime(value, label, { nullable = true } = {}) {
  if (value === null && nullable) return null;
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > timingValues.maxTimeMs
  ) {
    throw new Error(`${label} must be a bounded integer or null`);
  }
  return value;
}

function validateLyricsTimingDocument(rawDocument, options = {}) {
  const document = assertPlainObject(rawDocument, 'timing document');
  let serialized;
  try {
    serialized = JSON.stringify(document);
  } catch {
    throw new Error('timing document is not serializable');
  }
  if (
    typeof serialized !== 'string' ||
    Buffer.byteLength(serialized, 'utf8') > timingValues.maxDocumentBytes
  ) {
    throw new Error('timing document is too large');
  }

  if (document.schemaVersion !== LYRICS_TIMING_SCHEMA_VERSION) {
    throw new Error('unsupported lyrics timing schema version');
  }
  const documentId = validateId(document.documentId, 'documentId');
  const normalizerProfileId = validateId(
    document.normalizerProfileId,
    'normalizerProfileId',
  );
  const source = assertPlainObject(document.source, 'source');
  if (
    !isLyricsSubtitleFilename(source.filename) ||
    !SHA256_RE.test(source.sha256)
  ) {
    throw new Error('source identity is invalid');
  }
  if (
    options.sourceFilename !== undefined &&
    source.filename !== options.sourceFilename
  ) {
    throw new Error('source filename does not match');
  }
  if (
    options.sourceSha256 !== undefined &&
    source.sha256 !== options.sourceSha256
  ) {
    throw new Error('source fingerprint does not match');
  }
  if (
    options.normalizerProfileId !== undefined &&
    normalizerProfileId !== options.normalizerProfileId
  ) {
    throw new Error('source normalizer profile does not match');
  }
  if (
    !Array.isArray(document.lines) ||
    document.lines.length > timingValues.maxLines
  ) {
    throw new Error('lines must be a bounded array');
  }

  const usedIds = new Set();
  let previousLineStart = null;
  let totalSegments = 0;
  let hasTiming = false;
  let hasSegments = false;
  const lines = document.lines.map((rawLine, lineIndex) => {
    const line = assertPlainObject(rawLine, `line ${lineIndex}`);
    const lineId = validateId(line.lineId, `line ${lineIndex} id`);
    if (usedIds.has(lineId)) throw new Error(`duplicate timing id: ${lineId}`);
    usedIds.add(lineId);
    const text = validateText(line.text, `line ${lineIndex} text`);
    const startMs = validateTime(line.startMs, `line ${lineIndex} startMs`);
    const endMs = validateTime(line.endMs, `line ${lineIndex} endMs`);
    if (
      line.endInferred !== undefined &&
      typeof line.endInferred !== 'boolean'
    ) {
      throw new Error(`line ${lineIndex} endInferred must be a boolean`);
    }
    const endInferred = line.endInferred === true;
    if (startMs === null && endMs !== null) {
      throw new Error(`line ${lineIndex} cannot end without a start`);
    }
    if (startMs !== null) {
      hasTiming = true;
      if (endMs !== null && endMs < startMs) {
        throw new Error(`line ${lineIndex} ends before it starts`);
      }
      if (previousLineStart !== null && startMs < previousLineStart) {
        throw new Error('line starts must be monotonic');
      }
      previousLineStart = startMs;
    }

    let segments;
    if (line.segments !== undefined) {
      if (
        !Array.isArray(line.segments) ||
        line.segments.length > timingValues.maxSegmentsPerLine
      ) {
        throw new Error(`line ${lineIndex} segments must be a bounded array`);
      }
      totalSegments += line.segments.length;
      if (totalSegments > timingValues.maxTotalSegments) {
        throw new Error('timing document has too many segments');
      }
      if (line.segments.length > 0 && startMs === null) {
        throw new Error(`line ${lineIndex} segments require a timed line`);
      }

      let previousSegmentStart = null;
      let previousSegmentEnd = null;
      segments = line.segments.map((rawSegment, segmentIndex) => {
        const segment = assertPlainObject(
          rawSegment,
          `line ${lineIndex} segment ${segmentIndex}`,
        );
        const segmentId = validateId(
          segment.segmentId,
          `line ${lineIndex} segment ${segmentIndex} id`,
        );
        if (usedIds.has(segmentId)) {
          throw new Error(`duplicate timing id: ${segmentId}`);
        }
        usedIds.add(segmentId);
        const segmentText = validateText(
          segment.text,
          `line ${lineIndex} segment ${segmentIndex} text`,
        );
        const segmentStartMs = validateTime(
          segment.startMs,
          `line ${lineIndex} segment ${segmentIndex} startMs`,
          { nullable: false },
        );
        const segmentEndMs = validateTime(
          segment.endMs,
          `line ${lineIndex} segment ${segmentIndex} endMs`,
        );
        if (
          segmentStartMs < startMs ||
          (endMs !== null && segmentStartMs > endMs)
        ) {
          throw new Error(`line ${lineIndex} segment is outside its parent`);
        }
        if (
          segmentEndMs !== null &&
          (segmentEndMs < segmentStartMs ||
            (endMs !== null && segmentEndMs > endMs))
        ) {
          throw new Error(`line ${lineIndex} segment is outside its parent`);
        }
        if (
          previousSegmentStart !== null &&
          segmentStartMs < previousSegmentStart
        ) {
          throw new Error('segment starts must be monotonic');
        }
        if (
          previousSegmentEnd !== null &&
          segmentStartMs < previousSegmentEnd
        ) {
          throw new Error('timing segments cannot overlap');
        }
        previousSegmentStart = segmentStartMs;
        previousSegmentEnd = segmentEndMs;
        return {
          segmentId,
          text: segmentText,
          startMs: segmentStartMs,
          endMs: segmentEndMs,
        };
      });
      if (
        segments.length > 0 &&
        segments.map((segment) => segment.text).join('') !== text
      ) {
        throw new Error(
          `line ${lineIndex} segment text does not match its parent`,
        );
      }
      hasSegments ||= segments.length > 0;
    }

    return {
      lineId,
      text,
      startMs,
      endMs,
      ...(endInferred ? { endInferred: true } : {}),
      ...(segments ? { segments } : {}),
    };
  });
  lines.forEach((line, lineIndex) => {
    const nextStartMs = lines[lineIndex + 1]?.startMs;
    if (
      line.endInferred === true &&
      (!Number.isFinite(line.endMs) ||
        !Number.isFinite(nextStartMs) ||
        line.endMs !== nextStartMs)
    ) {
      throw new Error(
        `line ${lineIndex} inferred end must match the next line start`,
      );
    }
  });

  return {
    schemaVersion: LYRICS_TIMING_SCHEMA_VERSION,
    documentId,
    normalizerProfileId,
    source: { filename: source.filename, sha256: source.sha256 },
    granularity: hasSegments ? 'T2' : hasTiming ? 'T1' : 'T0',
    lines,
  };
}

function timingStatus(status, sourceFingerprint, extra = {}) {
  return {
    status,
    sourceFingerprint,
    normalizerProfileId: LYRICS_NORMALIZER_PROFILE_ID,
    ...extra,
  };
}

function loadTrackLyricsTiming(trackDir, sourceFilename) {
  const sourceFingerprint = computeLyricsSourceFingerprint(
    trackDir,
    sourceFilename,
  );
  if (!sourceFingerprint) return timingStatus('unavailable', null);

  const sidecarPath = timingSidecarPath(trackDir, sourceFilename);
  let rawDocument;
  try {
    rawDocument = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  } catch (error) {
    return timingStatus(
      error?.code === 'ENOENT' ? 'missing' : 'corrupt',
      sourceFingerprint,
    );
  }
  if (rawDocument?.schemaVersion !== LYRICS_TIMING_SCHEMA_VERSION) {
    return timingStatus('unsupported', sourceFingerprint);
  }

  let document;
  try {
    document = validateLyricsTimingDocument(rawDocument, {
      sourceFilename,
      sourceSha256: rawDocument?.source?.sha256,
      normalizerProfileId: rawDocument?.normalizerProfileId,
    });
  } catch {
    return timingStatus('corrupt', sourceFingerprint);
  }
  if (
    document.source.sha256 !== sourceFingerprint ||
    document.normalizerProfileId !== LYRICS_NORMALIZER_PROFILE_ID
  ) {
    return timingStatus('stale', sourceFingerprint);
  }
  return timingStatus('current', sourceFingerprint, { document });
}

function saveTrackLyricsTiming(
  trackDir,
  sourceFilename,
  expectedSourceFingerprint,
  rawDocument,
) {
  if (!SHA256_RE.test(expectedSourceFingerprint)) {
    throw new Error('expected source fingerprint is invalid');
  }
  const currentFingerprint = computeLyricsSourceFingerprint(
    trackDir,
    sourceFilename,
  );
  if (!currentFingerprint || currentFingerprint !== expectedSourceFingerprint) {
    throw new Error('lyrics source changed before timing could be saved');
  }
  const document = validateLyricsTimingDocument(rawDocument, {
    sourceFilename,
    sourceSha256: currentFingerprint,
    normalizerProfileId: LYRICS_NORMALIZER_PROFILE_ID,
  });
  const sidecarPath = timingSidecarPath(trackDir, sourceFilename);
  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  atomicWriteJson(sidecarPath, document);
  return timingStatus('current', currentFingerprint, { document });
}

function deleteTrackLyricsTiming(trackDir, sourceFilename) {
  const sidecarPath = timingSidecarPath(trackDir, sourceFilename);
  if (!sidecarPath) return false;
  try {
    fs.unlinkSync(sidecarPath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  LYRICS_NORMALIZER_PROFILE_ID,
  LYRICS_TIMING_SCHEMA_VERSION,
  computeLyricsSourceFingerprint,
  deleteTrackLyricsTiming,
  loadTrackLyricsTiming,
  saveTrackLyricsTiming,
  timingSidecarPath,
  validateLyricsTimingDocument,
};
