'use strict';

const outputValues = require('./outputContractValues.json');
const runtimeValues = require('./outputRuntimeValues.json');
const timingValues = require('./lyricsTimingValues.json');
const musicValues = require('./musicStructureContractValues.json');
const performerValues = require('./performerContractValues.json');
const { parseOutputSnapshot } = require('./outputContract');

const OUTPUT_V3_SUBPROTOCOL = outputValues.webSocketSubprotocol;
const OUTPUT_STREAMS = new Set([
  'lyrics.document',
  'music-structure.document',
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
const SHA256_RE = /^[a-f0-9]{64}$/;
const MUSIC_LEVELS = new Set(['M1', 'M2']);
const MUSIC_SECTION_ROLES = new Set(musicValues.canonicalSectionRoles);
const JAPANESE_KANA_RE = /[\u3040-\u30ff]/g;
const KOREAN_HANGUL_RE = /[\uac00-\ud7af]/g;

function invalid(path, reason) {
  throw new TypeError(`Invalid output stream ${path}: ${reason}`);
}

function record(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(path, 'expected an object');
  }
  return value;
}

function strictKeys(value, path, allowed) {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) invalid(`${path}.${unexpected}`, 'unexpected field');
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
  if (line.endInferred !== undefined && typeof line.endInferred !== 'boolean') {
    invalid(`${path}.endInferred`, 'expected a boolean');
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
    ...(line.endInferred === true ? { endInferred: true } : {}),
    ...(segments ? { segments } : {}),
  };
}

function parseReading(value, lines) {
  if (value === undefined || value === null) return null;
  const reading = record(value, 'payload.document.reading');
  if (!Array.isArray(reading.lines) || reading.lines.length !== lines.length) {
    invalid(
      'payload.document.reading.lines',
      'must align with every lyric line',
    );
  }
  return {
    lines: reading.lines.map((rawLine, lineIndex) => {
      const path = `payload.document.reading.lines[${lineIndex}]`;
      const line = record(rawLine, path);
      const lyricLine = lines[lineIndex];
      const lineId = id(line.lineId, `${path}.lineId`);
      const lineText = string(
        line.text,
        `${path}.text`,
        timingValues.maxTextLength,
      );
      if (lineId !== lyricLine.lineId || lineText !== lyricLine.text) {
        invalid(path, 'must match the corresponding lyric line');
      }
      if (
        !Array.isArray(line.segments) ||
        line.segments.length > performerValues.maxReadingSegmentsPerLine
      ) {
        invalid(`${path}.segments`, 'expected a bounded array');
      }
      const segments = line.segments.map((rawSegment, segmentIndex) => {
        const segmentPath = `${path}.segments[${segmentIndex}]`;
        const segment = record(rawSegment, segmentPath);
        const segmentText = string(
          segment.text,
          `${segmentPath}.text`,
          timingValues.maxTextLength,
        );
        const readingText = optionalString(
          segment.reading,
          `${segmentPath}.reading`,
          timingValues.maxTextLength,
        );
        return {
          text: segmentText,
          ...(readingText ? { reading: readingText } : {}),
        };
      });
      if (segments.map((segment) => segment.text).join('') !== lineText) {
        invalid(`${path}.segments`, 'text must preserve the parent line');
      }
      return { lineId, text: lineText, segments };
    }),
  };
}

function hasJapaneseLyricsEvidence(source, lines) {
  if (
    String(source?.language ?? '')
      .toLocaleLowerCase()
      .startsWith('ja')
  ) {
    return true;
  }
  const text = lines.map((line) => line.text).join('\n');
  const kana = (text.match(JAPANESE_KANA_RE) || []).length;
  const hangul = (text.match(KOREAN_HANGUL_RE) || []).length;
  return kana > 0 && hangul <= kana;
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
  lines.forEach((line, index) => {
    const nextStartMs = lines[index + 1]?.startMs;
    if (
      line.endInferred === true &&
      (!Number.isFinite(line.endMs) ||
        !Number.isFinite(nextStartMs) ||
        line.endMs !== nextStartMs)
    ) {
      invalid(
        `payload.document.lines[${index}].endInferred`,
        'must match the next line start',
      );
    }
  });
  const granularity = lines.some((line) => line.segments?.length)
    ? 'T2'
    : lines.some((line) => line.startMs !== null)
      ? 'T1'
      : 'T0';
  if (document.granularity !== granularity) {
    invalid('payload.document.granularity', `expected ${granularity}`);
  }
  const source = parseSource(document.source, 'payload.document.source');
  const reading = parseReading(document.reading, lines);
  if (reading && !hasJapaneseLyricsEvidence(source, lines)) {
    invalid('payload.document.reading', 'Japanese lyrics are required');
  }
  return {
    documentId: id(document.documentId, 'payload.document.documentId'),
    trackId: id(document.trackId, 'payload.document.trackId'),
    granularity,
    source,
    lines,
    ...(reading ? { reading } : {}),
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

function optionalConfidence(value, path) {
  if (value === undefined) return {};
  return {
    confidence: finite(value, path, {
      min: musicValues.minConfidence,
      max: musicValues.maxConfidence,
    }),
  };
}

function parseMusicStructureDocument(value) {
  const path = 'payload.document';
  const document = record(value, path);
  strictKeys(
    document,
    path,
    new Set([
      'documentId',
      'trackId',
      'sourceRevision',
      'sourceDurationMs',
      'level',
      'tempo',
      'beats',
      'sections',
    ]),
  );
  if (
    Buffer.byteLength(JSON.stringify(document), 'utf8') >
    musicValues.maxDocumentBytes
  ) {
    invalid(path, 'document is too large');
  }
  if (!SHA256_RE.test(document.sourceRevision)) {
    invalid(`${path}.sourceRevision`, 'expected a lowercase SHA-256 digest');
  }
  const documentId = id(document.documentId, `${path}.documentId`);
  if (documentId !== `music-structure-${document.sourceRevision}`) {
    invalid(`${path}.documentId`, 'must be keyed by source revision');
  }
  const sourceDurationMs = integer(
    document.sourceDurationMs,
    `${path}.sourceDurationMs`,
    { max: musicValues.maxDurationMs },
  );
  if (!MUSIC_LEVELS.has(document.level)) {
    invalid(`${path}.level`, 'expected M1 or M2');
  }

  let tempo = null;
  if (document.tempo !== null) {
    const rawTempo = record(document.tempo, `${path}.tempo`);
    strictKeys(rawTempo, `${path}.tempo`, new Set(['bpm', 'confidence']));
    tempo = {
      bpm: finite(rawTempo.bpm, `${path}.tempo.bpm`, {
        min: musicValues.minBpm,
        max: musicValues.maxBpm,
      }),
      ...optionalConfidence(rawTempo.confidence, `${path}.tempo.confidence`),
    };
  }

  if (
    !Array.isArray(document.beats) ||
    document.beats.length > musicValues.maxBeats
  ) {
    invalid(`${path}.beats`, 'expected a bounded array');
  }
  let previousBeatMs = -1;
  const maxCueTimeMs = Math.min(
    musicValues.maxDurationMs,
    sourceDurationMs + musicValues.durationToleranceMs,
  );
  const beats = document.beats.map((value, index) => {
    const beatPath = `${path}.beats[${index}]`;
    const beat = record(value, beatPath);
    strictKeys(
      beat,
      beatPath,
      new Set(['timeMs', 'positionInBar', 'downbeat', 'confidence']),
    );
    const timeMs = integer(beat.timeMs, `${beatPath}.timeMs`, {
      max: maxCueTimeMs,
    });
    if (timeMs <= previousBeatMs) {
      invalid(`${beatPath}.timeMs`, 'beats must be strictly monotonic');
    }
    previousBeatMs = timeMs;
    if (beat.downbeat !== undefined && typeof beat.downbeat !== 'boolean') {
      invalid(`${beatPath}.downbeat`, 'expected a boolean');
    }
    return {
      timeMs,
      ...(beat.positionInBar === undefined
        ? {}
        : {
            positionInBar: integer(
              beat.positionInBar,
              `${beatPath}.positionInBar`,
              { min: 1, max: musicValues.maxBeatsPerBar },
            ),
          }),
      ...(beat.downbeat === undefined ? {} : { downbeat: beat.downbeat }),
      ...optionalConfidence(beat.confidence, `${beatPath}.confidence`),
    };
  });

  if (
    !Array.isArray(document.sections) ||
    document.sections.length > musicValues.maxSections
  ) {
    invalid(`${path}.sections`, 'expected a bounded array');
  }
  let previousSectionEndMs = 0;
  const sectionIds = new Set();
  const sections = document.sections.map((value, index) => {
    const sectionPath = `${path}.sections[${index}]`;
    const section = record(value, sectionPath);
    strictKeys(
      section,
      sectionPath,
      new Set(['sectionId', 'startMs', 'endMs', 'role', 'confidence']),
    );
    const sectionId = id(section.sectionId, `${sectionPath}.sectionId`);
    if (sectionIds.has(sectionId)) {
      invalid(`${sectionPath}.sectionId`, 'duplicate id');
    }
    sectionIds.add(sectionId);
    const startMs = integer(section.startMs, `${sectionPath}.startMs`, {
      max: maxCueTimeMs,
    });
    const endMs = integer(section.endMs, `${sectionPath}.endMs`, {
      max: maxCueTimeMs,
    });
    if (endMs <= startMs || startMs < previousSectionEndMs) {
      invalid(sectionPath, 'sections must be positive and non-overlapping');
    }
    previousSectionEndMs = endMs;
    if (!MUSIC_SECTION_ROLES.has(section.role)) {
      invalid(`${sectionPath}.role`, 'unsupported role');
    }
    return {
      sectionId,
      startMs,
      endMs,
      role: section.role,
      ...optionalConfidence(section.confidence, `${sectionPath}.confidence`),
    };
  });

  const expectedLevel = sections.length > 0 ? 'M2' : 'M1';
  if (
    document.level !== expectedLevel ||
    (expectedLevel === 'M1' && tempo === null && beats.length === 0)
  ) {
    invalid(`${path}.level`, `expected ${expectedLevel} with usable signals`);
  }
  return {
    documentId,
    trackId: id(document.trackId, `${path}.trackId`),
    sourceRevision: document.sourceRevision,
    sourceDurationMs,
    level: expectedLevel,
    tempo,
    beats,
    sections,
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
  const musicStructure = parseReference(
    state.musicStructure ?? { documentId: null, documentRevision: 0 },
    'payload.musicStructure',
    { nullable: true },
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
    musicStructure,
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
  } else if (envelope.stream === 'music-structure.document') {
    parsedPayload = {
      document: parseMusicStructureDocument(payload.document),
    };
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
