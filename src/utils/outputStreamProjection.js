import { projectOutputSnapshot } from './outputSnapshot.js';

const QUEUE_DOCUMENT_ID = 'queue-current';
const SHA256_RE = /^[a-f0-9]{64}$/;

function publicLyricsSource(source) {
  if (!source || typeof source !== 'object') return null;
  const result = {};
  for (const key of ['kind', 'language', 'label']) {
    if (typeof source[key] === 'string' && source[key].length > 0) {
      result[key] = source[key];
    }
  }
  return result;
}

function projectSegment(segment) {
  return {
    segmentId: segment.segmentId,
    text: segment.text,
    startMs: segment.startMs,
    endMs: segment.endMs,
  };
}

function projectLine(line) {
  return {
    lineId: line.lineId,
    text: line.text,
    startMs: line.startMs,
    endMs: line.endMs,
    ...(Array.isArray(line.segments)
      ? { segments: line.segments.map(projectSegment) }
      : {}),
  };
}

export function projectLyricsOutputDocument({
  trackId,
  source,
  document,
} = {}) {
  if (
    typeof trackId !== 'string' ||
    trackId.length === 0 ||
    !document ||
    typeof document.documentId !== 'string'
  ) {
    return null;
  }
  return {
    documentId: document.documentId,
    trackId,
    granularity: document.granularity,
    source: publicLyricsSource(source),
    lines: Array.isArray(document.lines) ? document.lines.map(projectLine) : [],
  };
}

export function projectQueueOutputDocument(queue = {}) {
  const snapshot = projectOutputSnapshot(
    { player: {}, queue, lyrics: {}, output: {} },
    { generatedAt: '1970-01-01T00:00:00.000Z' },
  );
  return {
    documentId: QUEUE_DOCUMENT_ID,
    ...snapshot.queue,
  };
}

function optionalConfidence(value) {
  return Number.isFinite(value) ? { confidence: value } : {};
}

export function projectMusicStructureOutputDocument({
  trackId,
  sourceRevision,
  sourceDurationMs,
  signals,
} = {}) {
  if (
    typeof trackId !== 'string' ||
    trackId.length === 0 ||
    !SHA256_RE.test(sourceRevision ?? '') ||
    !Number.isSafeInteger(sourceDurationMs) ||
    sourceDurationMs < 0 ||
    signals?.reason !== 'current' ||
    !['M1', 'M2'].includes(signals.level)
  ) {
    return null;
  }

  return {
    documentId: `music-structure-${sourceRevision}`,
    trackId,
    sourceRevision,
    sourceDurationMs,
    level: signals.level,
    tempo: signals.tempo
      ? {
          bpm: signals.tempo.bpm,
          ...optionalConfidence(signals.tempo.confidence),
        }
      : null,
    beats: (Array.isArray(signals.beats) ? signals.beats : []).map((beat) => ({
      timeMs: beat.timeMs,
      ...(Number.isSafeInteger(beat.positionInBar)
        ? { positionInBar: beat.positionInBar }
        : {}),
      ...(typeof beat.downbeat === 'boolean'
        ? { downbeat: beat.downbeat }
        : {}),
      ...optionalConfidence(beat.confidence),
    })),
    sections: (Array.isArray(signals.sections) ? signals.sections : []).map(
      (section) => ({
        sectionId: section.sectionId,
        startMs: section.startMs,
        endMs: section.endMs,
        role: section.role,
        ...optionalConfidence(section.confidence),
      }),
    ),
  };
}

function lyricsReference(lyrics = {}) {
  const reference = lyrics.reference;
  return {
    documentId:
      typeof reference?.documentId === 'string' ? reference.documentId : null,
    documentRevision: Number.isSafeInteger(reference?.documentRevision)
      ? reference.documentRevision
      : 0,
    offsetMs: Number.isFinite(lyrics.offsetSeconds)
      ? Math.round(lyrics.offsetSeconds * 1000)
      : 0,
    activeLineId:
      typeof lyrics.activeLineId === 'string' ? lyrics.activeLineId : null,
    activeSegmentId:
      typeof lyrics.activeSegmentId === 'string'
        ? lyrics.activeSegmentId
        : null,
  };
}

function nullableReference(value) {
  const reference = value?.reference;
  return {
    documentId:
      typeof reference?.documentId === 'string' ? reference.documentId : null,
    documentRevision: Number.isSafeInteger(reference?.documentRevision)
      ? reference.documentRevision
      : 0,
  };
}

export function projectDynamicOutputState(input = {}, options = {}) {
  const snapshot = projectOutputSnapshot(
    {
      player: input.player,
      output: input.output,
      queue: {},
      lyrics: {},
    },
    { generatedAt: options.generatedAt },
  );
  return {
    generatedAt: snapshot.generatedAt,
    displayDelayMs: snapshot.displayDelayMs,
    playback: snapshot.playback,
    lyrics: lyricsReference(input.lyrics),
    queue: {
      documentId: input.queue?.reference?.documentId ?? QUEUE_DOCUMENT_ID,
      documentRevision: Number.isSafeInteger(
        input.queue?.reference?.documentRevision,
      )
        ? input.queue.reference.documentRevision
        : 0,
    },
    musicStructure: nullableReference(input.musicStructure),
  };
}

export { QUEUE_DOCUMENT_ID };
