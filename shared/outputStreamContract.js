'use strict';

const outputValues = require('./outputContractValues.json');
const runtimeValues = require('./outputRuntimeValues.json');
const timingValues = require('./lyricsTimingValues.json');
const { parseOutputSnapshot } = require('./outputContract');

const OUTPUT_V3_SUBPROTOCOL = outputValues.webSocketSubprotocol;
const OUTPUT_STREAMS = new Set([
  'lyrics.document',
  'queue.document',
  'state.snapshot',
]);
const OUTPUT_KINDS = new Set(['full', 'update']);
const PLAYBACK_STATUSES = new Set([
  'idle',
  'buffering',
  'playing',
  'seeking',
  'paused',
  'ended',
  'error',
]);
const QUEUE_ITEM_STATES = new Set(['played', 'current', 'queued']);
const MAX_ID_LENGTH = 200;
const MAX_LABEL_LENGTH = 300;

function invalid(path, reason) {
  throw new TypeError(`Invalid output stream ${path}: ${reason}`);
}

function record(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(path, 'expected an object');
  }
  return value;
}

function string(value, path, maxLength, allowEmpty = true) {
  if (typeof value !== 'string') invalid(path, 'expected a string');
  if (!allowEmpty && value.length === 0) invalid(path, 'must not be empty');
  if (value.length > maxLength) invalid(path, `exceeds ${maxLength} chars`);
  return value;
}

function id(value, path) {
  return string(value, path, MAX_ID_LENGTH, false);
}

function optionalString(value, path, maxLength = MAX_LABEL_LENGTH) {
  if (value === undefined || value === null || value === '') return undefined;
  return string(value, path, maxLength, false);
}

function integer(value, path, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    invalid(path, `expected an integer from ${min} to ${max}`);
  }
  return value;
}

function finite(value, path, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) {
    invalid(path, `expected a finite number from ${min} to ${max}`);
  }
  return value;
}

function nullableTime(value, path) {
  return value === null
    ? null
    : integer(value, path, { min: 0, max: timingValues.maxTimeMs });
}

function parseTrack(value, path) {
  if (value === null) return null;
  const track = record(value, path);
  const artist = optionalString(track.artist, `${path}.artist`);
  return {
    id: id(track.id, `${path}.id`),
    title: string(track.title, `${path}.title`, MAX_LABEL_LENGTH, false),
    ...(artist ? { artist } : {}),
  };
}

function parseSource(value, path) {
  if (value === null || value === undefined) return null;
  const source = record(value, path);
  const result = {};
  for (const key of ['kind', 'language', 'label']) {
    const parsed = optionalString(source[key], `${path}.${key}`);
    if (parsed) result[key] = parsed;
  }
  return result;
}

function parseSegment(value, path) {
  const segment = record(value, path);
  return {
    segmentId: id(segment.segmentId, `${path}.segmentId`),
    text: string(segment.text, `${path}.text`, timingValues.maxTextLength),
    startMs: integer(segment.startMs, `${path}.startMs`, {
      min: 0,
      max: timingValues.maxTimeMs,
    }),
    endMs: nullableTime(segment.endMs, `${path}.endMs`),
  };
}

function parseLine(value, path, usedIds, counters) {
  const line = record(value, path);
  const lineId = id(line.lineId, `${path}.lineId`);
  if (usedIds.has(lineId)) invalid(`${path}.lineId`, 'duplicate id');
  usedIds.add(lineId);
  const text = string(line.text, `${path}.text`, timingValues.maxTextLength);
  const startMs = nullableTime(line.startMs, `${path}.startMs`);
  const endMs = nullableTime(line.endMs, `${path}.endMs`);
  if (startMs === null && endMs !== null) {
    invalid(`${path}.endMs`, 'cannot end without a start');
  }
  if (startMs !== null && endMs !== null && endMs < startMs) {
    invalid(`${path}.endMs`, 'precedes startMs');
  }

  let segments;
  if (line.segments !== undefined) {
    if (
      !Array.isArray(line.segments) ||
      line.segments.length > timingValues.maxSegmentsPerLine
    ) {
      invalid(`${path}.segments`, 'expected a bounded array');
    }
    if (line.segments.length > 0 && startMs === null) {
      invalid(`${path}.segments`, 'timed parent required');
    }
    counters.segments += line.segments.length;
    if (counters.segments > timingValues.maxTotalSegments) {
      invalid('lyrics.document.lines', 'too many segments');
    }
    let previousStart = null;
    let previousEnd = null;
    segments = line.segments.map((rawSegment, index) => {
      const segmentPath = `${path}.segments[${index}]`;
      const segment = parseSegment(rawSegment, segmentPath);
      if (usedIds.has(segment.segmentId)) {
        invalid(`${segmentPath}.segmentId`, 'duplicate id');
      }
      usedIds.add(segment.segmentId);
      if (
        segment.startMs < startMs ||
        (endMs !== null && segment.startMs > endMs) ||
        (segment.endMs !== null &&
          (segment.endMs < segment.startMs ||
            (endMs !== null && segment.endMs > endMs)))
      ) {
        invalid(segmentPath, 'outside parent interval');
      }
      if (
        (previousStart !== null && segment.startMs < previousStart) ||
        (previousEnd !== null && segment.startMs < previousEnd)
      ) {
        invalid(segmentPath, 'segments must be monotonic and non-overlapping');
      }
      previousStart = segment.startMs;
      previousEnd = segment.endMs;
      return segment;
    });
    if (
      segments.length > 0 &&
      segments.map((item) => item.text).join('') !== text
    ) {
      invalid(`${path}.segments`, 'text must preserve the parent line');
    }
  }

  return {
    lineId,
    text,
    startMs,
    endMs,
    ...(segments ? { segments } : {}),
  };
}

function parseLyricsDocument(value) {
  if (value === null) return null;
  const document = record(value, 'payload.document');
  if (
    !Array.isArray(document.lines) ||
    document.lines.length > timingValues.maxLines
  ) {
    invalid('payload.document.lines', 'expected a bounded array');
  }
  if (
    Buffer.byteLength(JSON.stringify(document)) > timingValues.maxDocumentBytes
  ) {
    invalid('payload.document', 'document is too large');
  }
  const usedIds = new Set();
  const counters = { segments: 0 };
  let previousLineStart = null;
  const lines = document.lines.map((rawLine, index) => {
    const line = parseLine(
      rawLine,
      `payload.document.lines[${index}]`,
      usedIds,
      counters,
    );
    if (
      line.startMs !== null &&
      previousLineStart !== null &&
      line.startMs < previousLineStart
    ) {
      invalid(`payload.document.lines[${index}].startMs`, 'must be monotonic');
    }
    if (line.startMs !== null) previousLineStart = line.startMs;
    return line;
  });
  const granularity = lines.some((line) => line.segments?.length)
    ? 'T2'
    : lines.some((line) => line.startMs !== null)
      ? 'T1'
      : 'T0';
  if (document.granularity !== granularity) {
    invalid('payload.document.granularity', `expected ${granularity}`);
  }
  return {
    documentId: id(document.documentId, 'payload.document.documentId'),
    trackId: id(document.trackId, 'payload.document.trackId'),
    granularity,
    source: parseSource(document.source, 'payload.document.source'),
    lines,
  };
}

function parseQueueDocument(value) {
  const document = record(value, 'payload.document');
  if (
    !Array.isArray(document.items) ||
    document.items.length > outputValues.maxQueueItems
  ) {
    invalid('payload.document.items', 'expected a bounded array');
  }
  return {
    documentId: id(document.documentId, 'payload.document.documentId'),
    sourceName: string(
      document.sourceName,
      'payload.document.sourceName',
      MAX_LABEL_LENGTH,
    ),
    items: document.items.map((rawItem, index) => {
      const path = `payload.document.items[${index}]`;
      const item = record(rawItem, path);
      if (!QUEUE_ITEM_STATES.has(item.state)) {
        invalid(`${path}.state`, 'unsupported state');
      }
      if (item.track === null) invalid(`${path}.track`, 'must not be null');
      return {
        state: item.state,
        track: parseTrack(item.track, `${path}.track`),
      };
    }),
  };
}

function parsePlayback(value) {
  const playback = record(value, 'payload.playback');
  if (!PLAYBACK_STATUSES.has(playback.status)) {
    invalid('payload.playback.status', 'unsupported status');
  }
  return {
    status: playback.status,
    positionMs: integer(playback.positionMs, 'payload.playback.positionMs'),
    durationMs:
      playback.durationMs === null
        ? null
        : integer(playback.durationMs, 'payload.playback.durationMs'),
    rate: finite(playback.rate, 'payload.playback.rate', { min: 0.1, max: 4 }),
    track: parseTrack(playback.track, 'payload.playback.track'),
  };
}

function parseReference(value, path, { nullable = false } = {}) {
  if (nullable && value?.documentId === null) {
    const documentRevision = integer(
      value.documentRevision,
      `${path}.documentRevision`,
    );
    if (documentRevision !== 0) {
      invalid(`${path}.documentRevision`, 'must be zero without a document');
    }
    return {
      documentId: null,
      documentRevision,
    };
  }
  const reference = record(value, path);
  return {
    documentId: id(reference.documentId, `${path}.documentId`),
    documentRevision: integer(
      reference.documentRevision,
      `${path}.documentRevision`,
    ),
  };
}

function parseNullableId(value, path) {
  return value === null ? null : id(value, path);
}

function parseDynamicState(value) {
  const state = record(value, 'payload');
  const generatedAt = string(
    state.generatedAt,
    'payload.generatedAt',
    64,
    false,
  );
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== generatedAt) {
    invalid('payload.generatedAt', 'expected an ISO timestamp');
  }
  const lyrics = record(state.lyrics, 'payload.lyrics');
  const lyricsReference = parseReference(lyrics, 'payload.lyrics', {
    nullable: true,
  });
  const activeLineId = parseNullableId(
    lyrics.activeLineId,
    'payload.lyrics.activeLineId',
  );
  const activeSegmentId = parseNullableId(
    lyrics.activeSegmentId,
    'payload.lyrics.activeSegmentId',
  );
  if (
    lyricsReference.documentId === null &&
    (activeLineId !== null || activeSegmentId !== null)
  ) {
    invalid('payload.lyrics', 'active ids require a document');
  }
  return {
    generatedAt,
    displayDelayMs: integer(state.displayDelayMs, 'payload.displayDelayMs', {
      min: runtimeValues.minDisplayDelayMs,
      max: runtimeValues.maxDisplayDelayMs,
    }),
    playback: parsePlayback(state.playback),
    lyrics: {
      ...lyricsReference,
      offsetMs: integer(lyrics.offsetMs, 'payload.lyrics.offsetMs', {
        min: -600000,
        max: 600000,
      }),
      activeLineId,
      activeSegmentId,
    },
    queue: parseReference(state.queue, 'payload.queue'),
  };
}

function parseOutputStreamEnvelope(value, expectedBootId) {
  const envelope = record(value, 'root');
  if (envelope.contractVersion !== outputValues.projectionEnvelopeVersion) {
    invalid(
      'contractVersion',
      `expected ${outputValues.projectionEnvelopeVersion}`,
    );
  }
  const bootId = id(envelope.bootId, 'bootId');
  if (bootId !== expectedBootId) invalid('bootId', 'stale app lifetime');
  const sourceEpoch = id(envelope.sourceEpoch, 'sourceEpoch');
  if (!OUTPUT_STREAMS.has(envelope.stream)) {
    invalid('stream', 'unsupported stream');
  }
  if (!OUTPUT_KINDS.has(envelope.kind)) invalid('kind', 'unsupported kind');
  const revision = integer(envelope.revision, 'revision');
  const payload = record(envelope.payload, 'payload');
  let parsedPayload;
  if (envelope.stream === 'lyrics.document') {
    parsedPayload = { document: parseLyricsDocument(payload.document) };
  } else if (envelope.stream === 'queue.document') {
    parsedPayload = { document: parseQueueDocument(payload.document) };
  } else {
    parsedPayload = parseDynamicState(payload);
  }
  return {
    contractVersion: outputValues.projectionEnvelopeVersion,
    bootId,
    sourceEpoch,
    stream: envelope.stream,
    kind: envelope.kind,
    revision,
    payload: parsedPayload,
  };
}

function requireReferencedDocument(reference, document, path) {
  if (reference.documentId === null) {
    if (document !== null) return null;
    return null;
  }
  if (!document || document.documentId !== reference.documentId) {
    invalid(path, 'referenced document is unavailable');
  }
  return document;
}

function assembleOutputSnapshotV2({
  revision,
  dynamic,
  lyricsDocument,
  queueDocument,
}) {
  const state = parseDynamicState(dynamic);
  const lyrics = requireReferencedDocument(
    state.lyrics,
    lyricsDocument,
    'payload.lyrics',
  );
  const queue = requireReferencedDocument(
    state.queue,
    queueDocument,
    'payload.queue',
  );
  const lines = (lyrics?.lines ?? [])
    .slice(0, outputValues.maxLyricLines)
    .map((line) => ({
      text: line.text,
      startMs: line.startMs,
      endMs: line.endMs,
    }));
  const activeLineIndex = lyrics
    ? lyrics.lines
        .slice(0, outputValues.maxLyricLines)
        .findIndex((line) => line.lineId === state.lyrics.activeLineId)
    : -1;
  return parseOutputSnapshot({
    version: outputValues.stateVersion,
    revision: integer(revision, 'compatibility.revision'),
    generatedAt: state.generatedAt,
    displayDelayMs: state.displayDelayMs,
    playback: state.playback,
    queue: queue
      ? { sourceName: queue.sourceName, items: queue.items }
      : { sourceName: '', items: [] },
    lyrics: lyrics
      ? {
          trackId: lyrics.trackId,
          source: lyrics.source,
          synced: lines.some((line) => line.startMs !== null),
          offsetMs: state.lyrics.offsetMs,
          activeLineIndex,
          lines,
        }
      : {
          trackId: null,
          source: null,
          synced: false,
          offsetMs: state.lyrics.offsetMs,
          activeLineIndex: -1,
          lines: [],
        },
  });
}

module.exports = {
  OUTPUT_V3_SUBPROTOCOL,
  assembleOutputSnapshotV2,
  parseOutputStreamEnvelope,
};
