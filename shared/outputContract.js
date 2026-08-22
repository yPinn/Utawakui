'use strict';

const contractValues = require('./outputContractValues.json');
const runtimeValues = require('./outputRuntimeValues.json');

const OUTPUT_STATE_VERSION = contractValues.stateVersion;
const OUTPUT_PLAYBACK_STATUSES = Object.freeze([
  'idle',
  'buffering',
  'playing',
  'seeking',
  'paused',
  'ended',
  'error',
]);
const OUTPUT_QUEUE_ITEM_STATES = Object.freeze(['played', 'current', 'queued']);
const MAX_OUTPUT_QUEUE_ITEMS = contractValues.maxQueueItems;
const MAX_OUTPUT_LYRIC_LINES = contractValues.maxLyricLines;
const MAX_ID_LENGTH = 200;
const MAX_LABEL_LENGTH = 300;
const MAX_LYRIC_TEXT_LENGTH = 2000;

function invalid(path, reason) {
  throw new TypeError(`Invalid output snapshot ${path}: ${reason}`);
}

function requireRecord(value, path) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(path, 'expected an object');
  }
  return value;
}

function requireString(value, path, maxLength, allowEmpty = true) {
  if (typeof value !== 'string') invalid(path, 'expected a string');
  if (!allowEmpty && value.length === 0) invalid(path, 'must not be empty');
  return value.slice(0, maxLength);
}

function requireFiniteNumber(value, path, options = {}) {
  if (!Number.isFinite(value)) invalid(path, 'expected a finite number');
  if (options.integer && !Number.isSafeInteger(value)) {
    invalid(path, 'expected a safe integer');
  }
  if (options.min !== undefined && value < options.min) {
    invalid(path, `must be at least ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    invalid(path, `must be at most ${options.max}`);
  }
  return value;
}

function optionalString(value, path, maxLength) {
  if (value === undefined || value === null || value === '') return undefined;
  return requireString(value, path, maxLength, false);
}

function parseTrack(value, path) {
  const track = requireRecord(value, path);
  const artist = optionalString(
    track.artist,
    `${path}.artist`,
    MAX_LABEL_LENGTH,
  );
  return {
    id: requireString(track.id, `${path}.id`, MAX_ID_LENGTH, false),
    title: requireString(track.title, `${path}.title`, MAX_LABEL_LENGTH, false),
    ...(artist ? { artist } : {}),
  };
}

function parsePlayback(value) {
  const playback = requireRecord(value, 'playback');
  if (!OUTPUT_PLAYBACK_STATUSES.includes(playback.status)) {
    invalid('playback.status', 'unsupported status');
  }

  let durationMs = null;
  if (playback.durationMs !== null) {
    durationMs = requireFiniteNumber(
      playback.durationMs,
      'playback.durationMs',
      {
        integer: true,
        min: 0,
      },
    );
  }

  return {
    status: playback.status,
    positionMs: requireFiniteNumber(
      playback.positionMs,
      'playback.positionMs',
      { integer: true, min: 0 },
    ),
    durationMs,
    rate: requireFiniteNumber(playback.rate, 'playback.rate', {
      min: 0.1,
      max: 4,
    }),
    track:
      playback.track === null
        ? null
        : parseTrack(playback.track, 'playback.track'),
  };
}

function parseQueue(value) {
  const queue = requireRecord(value, 'queue');
  if (!Array.isArray(queue.items)) invalid('queue.items', 'expected an array');
  if (queue.items.length > MAX_OUTPUT_QUEUE_ITEMS) {
    invalid('queue.items', `must contain at most ${MAX_OUTPUT_QUEUE_ITEMS}`);
  }

  return {
    sourceName: requireString(
      queue.sourceName,
      'queue.sourceName',
      MAX_LABEL_LENGTH,
    ),
    items: queue.items.map((rawItem, index) => {
      const itemPath = `queue.items[${index}]`;
      const item = requireRecord(rawItem, itemPath);
      if (!OUTPUT_QUEUE_ITEM_STATES.includes(item.state)) {
        invalid(`${itemPath}.state`, 'unsupported state');
      }
      return {
        state: item.state,
        track: parseTrack(item.track, `${itemPath}.track`),
      };
    }),
  };
}

function parseLyricsSource(value) {
  if (value === null) return null;
  const source = requireRecord(value, 'lyrics.source');
  const kind = optionalString(
    source.kind,
    'lyrics.source.kind',
    MAX_LABEL_LENGTH,
  );
  const language = optionalString(
    source.language,
    'lyrics.source.language',
    MAX_LABEL_LENGTH,
  );
  const label = optionalString(
    source.label,
    'lyrics.source.label',
    MAX_LABEL_LENGTH,
  );
  return {
    ...(kind ? { kind } : {}),
    ...(language ? { language } : {}),
    ...(label ? { label } : {}),
  };
}

function parseNullableLineTime(value, path) {
  if (value === null) return null;
  return requireFiniteNumber(value, path, { integer: true, min: 0 });
}

function parseLyrics(value) {
  const lyrics = requireRecord(value, 'lyrics');
  if (!Array.isArray(lyrics.lines)) {
    invalid('lyrics.lines', 'expected an array');
  }
  if (lyrics.lines.length > MAX_OUTPUT_LYRIC_LINES) {
    invalid('lyrics.lines', `must contain at most ${MAX_OUTPUT_LYRIC_LINES}`);
  }

  const lines = lyrics.lines.map((rawLine, index) => {
    const linePath = `lyrics.lines[${index}]`;
    const line = requireRecord(rawLine, linePath);
    const startMs = parseNullableLineTime(line.startMs, `${linePath}.startMs`);
    const endMs = parseNullableLineTime(line.endMs, `${linePath}.endMs`);
    if (startMs !== null && endMs !== null && endMs < startMs) {
      invalid(`${linePath}.endMs`, 'must not precede startMs');
    }
    return {
      text: requireString(line.text, `${linePath}.text`, MAX_LYRIC_TEXT_LENGTH),
      startMs,
      endMs,
    };
  });

  const activeLineIndex = requireFiniteNumber(
    lyrics.activeLineIndex,
    'lyrics.activeLineIndex',
    { integer: true, min: -1 },
  );
  if (activeLineIndex >= lines.length) {
    invalid('lyrics.activeLineIndex', 'must reference an existing line');
  }

  const trackId =
    lyrics.trackId === null
      ? null
      : requireString(lyrics.trackId, 'lyrics.trackId', MAX_ID_LENGTH, false);
  if (typeof lyrics.synced !== 'boolean') {
    invalid('lyrics.synced', 'expected a boolean');
  }

  return {
    trackId,
    source: parseLyricsSource(lyrics.source),
    synced: lyrics.synced,
    offsetMs: requireFiniteNumber(lyrics.offsetMs, 'lyrics.offsetMs', {
      integer: true,
      min: -600000,
      max: 600000,
    }),
    activeLineIndex,
    lines,
  };
}

function parseOutputSnapshot(value) {
  const snapshot = requireRecord(value, 'root');
  if (snapshot.version !== OUTPUT_STATE_VERSION) {
    invalid('version', `expected ${OUTPUT_STATE_VERSION}`);
  }
  const generatedAt = requireString(
    snapshot.generatedAt,
    'generatedAt',
    64,
    false,
  );
  const generatedDate = new Date(generatedAt);
  if (
    Number.isNaN(generatedDate.getTime()) ||
    generatedDate.toISOString() !== generatedAt
  ) {
    invalid('generatedAt', 'expected an ISO timestamp');
  }

  return {
    version: OUTPUT_STATE_VERSION,
    revision: requireFiniteNumber(snapshot.revision, 'revision', {
      integer: true,
      min: 0,
    }),
    generatedAt,
    displayDelayMs: requireFiniteNumber(
      snapshot.displayDelayMs,
      'displayDelayMs',
      {
        integer: true,
        min: runtimeValues.minDisplayDelayMs,
        max: runtimeValues.maxDisplayDelayMs,
      },
    ),
    playback: parsePlayback(snapshot.playback),
    queue: parseQueue(snapshot.queue),
    lyrics: parseLyrics(snapshot.lyrics),
  };
}

function createEmptyOutputSnapshot(options = {}) {
  return parseOutputSnapshot({
    version: OUTPUT_STATE_VERSION,
    revision: options.revision ?? 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    displayDelayMs: runtimeValues.defaultDisplayDelayMs,
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
  });
}

function isOutputSnapshot(value) {
  try {
    parseOutputSnapshot(value);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  OUTPUT_STATE_VERSION,
  OUTPUT_PLAYBACK_STATUSES,
  OUTPUT_QUEUE_ITEM_STATES,
  MAX_OUTPUT_QUEUE_ITEMS,
  MAX_OUTPUT_LYRIC_LINES,
  createEmptyOutputSnapshot,
  isOutputSnapshot,
  parseOutputSnapshot,
};
