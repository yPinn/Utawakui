import { projectOutputSnapshot } from './outputSnapshot.js';
import performerValues from '../../shared/performerContractValues.json';
import timingValues from '../../shared/lyricsTimingValues.json';
import outputValues from '../../shared/outputContractValues.json';
import { detectLyricsScript } from './lyrics.js';

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
    ...(line.endInferred === true ? { endInferred: true } : {}),
    ...(Array.isArray(line.segments)
      ? { segments: line.segments.map(projectSegment) }
      : {}),
    ...(line.estimatedStarts
      ? {
          estimatedStarts: {
            version: line.estimatedStarts.version,
            segments: line.estimatedStarts.segments.map(
              ({ segmentId, text, startMs }) => ({ segmentId, text, startMs }),
            ),
          },
        }
      : {}),
    ...(line.estimatedFineTiming
      ? {
          estimatedFineTiming: {
            version: line.estimatedFineTiming.version,
            units: line.estimatedFineTiming.units.map(
              ({ unitId, from, to, startMs, endMs }) => ({
                unitId,
                from,
                to,
                startMs,
                endMs,
              }),
            ),
          },
        }
      : {}),
  };
}

export function isJapaneseLyricsDocument(source, document) {
  if (
    String(source?.language ?? '')
      .toLocaleLowerCase()
      .startsWith('ja')
  ) {
    return true;
  }
  const text = Array.isArray(document?.lines)
    ? document.lines.map((line) => line?.text ?? '').join('\n')
    : '';
  return detectLyricsScript(text) === 'ja';
}

function projectReadingDocument(source, document, readingDocument) {
  if (
    !isJapaneseLyricsDocument(source, document) ||
    readingDocument?.version !== 3 ||
    readingDocument.documentId !== document.documentId ||
    readingDocument.normalizerProfileId !== document.normalizerProfileId ||
    readingDocument.sourceFingerprint !== document.source?.sha256 ||
    !Array.isArray(document.lines) ||
    !Array.isArray(readingDocument.lines) ||
    readingDocument.lines.length !== document.lines.length
  ) {
    return null;
  }

  const lines = [];
  for (const [index, line] of document.lines.entries()) {
    const readingLine = readingDocument.lines[index];
    if (
      readingLine?.lineId !== line.lineId ||
      readingLine.text !== line.text ||
      !Array.isArray(readingLine.segments) ||
      readingLine.segments.length > performerValues.maxReadingSegmentsPerLine
    ) {
      return null;
    }
    const segments = [];
    for (const segment of readingLine.segments) {
      if (
        typeof segment?.t !== 'string' ||
        segment.t.length > 2000 ||
        (segment.r !== undefined &&
          (typeof segment.r !== 'string' || segment.r.length > 2000))
      ) {
        return null;
      }
      segments.push({
        text: segment.t,
        ...(segment.r ? { reading: segment.r } : {}),
      });
    }
    if (segments.map((segment) => segment.text).join('') !== line.text) {
      return null;
    }
    lines.push({ lineId: line.lineId, text: line.text, segments });
  }
  return { lines };
}

export function projectLyricsOutputDocument({
  trackId,
  source,
  document,
  readingDocument,
} = {}) {
  if (
    typeof trackId !== 'string' ||
    trackId.length === 0 ||
    !document ||
    typeof document.documentId !== 'string'
  ) {
    return null;
  }
  const reading = projectReadingDocument(source, document, readingDocument);
  const projected = {
    documentId: document.documentId,
    trackId,
    granularity: document.granularity,
    source: publicLyricsSource(source),
    lines: Array.isArray(document.lines) ? document.lines.map(projectLine) : [],
    ...(reading ? { reading } : {}),
  };
  if (
    projected.lines.some((line) => line.estimatedFineTiming) &&
    new TextEncoder().encode(JSON.stringify(projected)).byteLength >
      timingValues.maxDocumentBytes
  ) {
    for (const line of projected.lines) delete line.estimatedFineTiming;
  }
  return projected;
}

export function projectQueueOutputDocument(queue = {}) {
  const snapshot = projectOutputSnapshot(
    { player: {}, queue, lyrics: {}, output: {} },
    { generatedAt: '1970-01-01T00:00:00.000Z' },
  );
  const completed = (
    Array.isArray(queue.completedEntries) ? queue.completedEntries : []
  ).filter(
    (entry) =>
      typeof entry?.track?.id === 'string' && entry.track.id.length > 0,
  );
  const completedCount = Math.min(1000000, completed.length);
  const receipt = {
    completedCount,
    history: completed
      .slice(0, completedCount)
      .slice(-outputValues.maxQueueItems)
      .map((entry, index, rows) => ({
        ordinal: completedCount - rows.length + index + 1,
        track: {
          id: entry.track.id,
          title:
            typeof entry.track.title === 'string' && entry.track.title
              ? entry.track.title
              : entry.track.id,
          ...(typeof entry.track.artist === 'string' && entry.track.artist
            ? { artist: entry.track.artist }
            : {}),
        },
      })),
  };
  return {
    documentId: QUEUE_DOCUMENT_ID,
    ...snapshot.queue,
    ...(Array.isArray(queue.completedEntries) ? { receipt } : {}),
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
