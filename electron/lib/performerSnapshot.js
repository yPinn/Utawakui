'use strict';

const { parseOutputSnapshot } = require('../../shared/outputContract');
const performerValues = require('../../shared/performerContractValues.json');
const outputValues = require('../../shared/outputContractValues.json');

const MAX_TEXT_LENGTH = 2000;
const MAX_TRACK_ID_LENGTH = 200;

function invalid(path, reason) {
  throw new TypeError(`Invalid performer snapshot ${path}: ${reason}`);
}

function record(value, path) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(path, 'expected an object');
  }
  return value;
}

function string(value, path, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') invalid(path, 'expected a string');
  return value.slice(0, maxLength);
}

function optionalString(value, path) {
  if (value === undefined || value === null || value === '') return undefined;
  return string(value, path);
}

function number(value, path, { min, max } = {}) {
  if (!Number.isFinite(value)) invalid(path, 'expected a finite number');
  if (min !== undefined && value < min)
    invalid(path, `must be at least ${min}`);
  if (max !== undefined && value > max) invalid(path, `must be at most ${max}`);
  return value;
}

function parseReadingSegment(value, path) {
  const segment = record(value, path);
  const reading = optionalString(segment.reading, `${path}.reading`);
  return {
    text: string(segment.text, `${path}.text`),
    ...(reading ? { reading } : {}),
  };
}

function parseReadingLine(value, path, lyricText) {
  if (value === null) return null;
  const line = record(value, path);
  const text = string(line.text, `${path}.text`);
  if (text !== lyricText) invalid(`${path}.text`, 'must match the lyric line');
  if (!Array.isArray(line.segments)) {
    invalid(`${path}.segments`, 'expected an array');
  }
  if (line.segments.length > performerValues.maxReadingSegmentsPerLine) {
    invalid(
      `${path}.segments`,
      `must contain at most ${performerValues.maxReadingSegmentsPerLine}`,
    );
  }
  const romaji = optionalString(line.romaji, `${path}.romaji`);
  return {
    text,
    ...(romaji ? { romaji } : {}),
    segments: line.segments.map((segment, index) =>
      parseReadingSegment(segment, `${path}.segments[${index}]`),
    ),
  };
}

function parseReadings(value, lyrics) {
  const readings = record(value, 'readings');
  if (!Array.isArray(readings.lines)) {
    invalid('readings.lines', 'expected an array');
  }
  if (readings.lines.length !== lyrics.lines.length) {
    invalid('readings.lines', 'must align with lyric lines');
  }
  const trackId =
    readings.trackId === null
      ? null
      : string(readings.trackId, 'readings.trackId', MAX_TRACK_ID_LENGTH);
  if (trackId !== lyrics.trackId) {
    invalid('readings.trackId', 'must match lyrics.trackId');
  }
  return {
    trackId,
    lines: readings.lines.map((line, index) =>
      parseReadingLine(
        line,
        `readings.lines[${index}]`,
        lyrics.lines[index].text,
      ),
    ),
  };
}

function parseAdjustments(value) {
  const adjustments = record(value, 'adjustments');
  return {
    transposeSemitones: number(
      adjustments.transposeSemitones,
      'adjustments.transposeSemitones',
      { min: -24, max: 24 },
    ),
    pitchCents: number(adjustments.pitchCents, 'adjustments.pitchCents', {
      min: -100,
      max: 100,
    }),
    tempoRate: number(adjustments.tempoRate, 'adjustments.tempoRate', {
      min: 0.25,
      max: 4,
    }),
  };
}

function parsePerformerSnapshot(value) {
  const snapshot = record(value, 'root');
  if (snapshot.version !== performerValues.stateVersion) {
    invalid('version', `expected ${performerValues.stateVersion}`);
  }
  const state = parseOutputSnapshot(snapshot.state);
  if (state.displayDelayMs !== 0) {
    invalid('state.displayDelayMs', 'must be 0 for local self-view');
  }
  return {
    version: performerValues.stateVersion,
    state,
    adjustments: parseAdjustments(snapshot.adjustments),
    readings: parseReadings(snapshot.readings, state.lyrics),
  };
}

function createEmptyPerformerSnapshot(options = {}) {
  return parsePerformerSnapshot({
    version: performerValues.stateVersion,
    state: {
      version: outputValues.stateVersion,
      revision: options.revision ?? 0,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      displayDelayMs: 0,
      playback: {
        status: 'idle',
        positionMs: 0,
        durationMs: null,
        rate: 1,
        track: null,
      },
      queue: { sourceName: '', items: [] },
      lyrics: {
        trackId: null,
        source: null,
        synced: false,
        offsetMs: 0,
        activeLineIndex: -1,
        lines: [],
      },
    },
    adjustments: {
      transposeSemitones: 0,
      pitchCents: 0,
      tempoRate: 1,
    },
    readings: { trackId: null, lines: [] },
  });
}

module.exports = {
  createEmptyPerformerSnapshot,
  parsePerformerSnapshot,
};
