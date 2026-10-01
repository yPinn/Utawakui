'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJson, backupCorrupted } = require('./atomicWrite');
const { isSafeTrackId } = require('./library/paths');

const PLAYBACK_HISTORY_LIMIT = 50;
const PLAYBACK_QUEUE_LIMIT = 500;
const PLAYBACK_PERSISTENCE_VERSION = 1;
const MAX_TRACK_ID_LENGTH = 255;
const MAX_SOURCE_TEXT_LENGTH = 255;
const MAX_RESUME_POSITION_SECONDS = 7 * 24 * 60 * 60;
const PLAYBACK_MODES = new Set(['sequence', 'repeat-list', 'repeat-one']);
const HISTORY_FILENAME = 'playback-history.json';
const RESUME_FILENAME = 'playback-resume.json';
const USAGE_FILENAME = 'playback-usage.json';

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function isBoundedTrackId(value) {
  return (
    isSafeTrackId(value) &&
    value.length <= MAX_TRACK_ID_LENGTH &&
    !hasControlCharacters(value)
  );
}

function validateTrackId(value) {
  if (!isBoundedTrackId(value)) throw new Error('invalid playback track id');
  return value;
}

function optionalBoundedText(value) {
  if (value === null || value === undefined || value === '') return null;
  if (
    typeof value !== 'string' ||
    value.length > MAX_SOURCE_TEXT_LENGTH ||
    hasControlCharacters(value)
  ) {
    throw new Error('invalid playback source context');
  }
  return value;
}

function uniqueTrackIds(value) {
  if (!Array.isArray(value) || value.length > PLAYBACK_QUEUE_LIMIT) {
    throw new Error('invalid playback resume snapshot');
  }
  const seen = new Set();
  const result = [];
  for (const trackId of value) {
    validateTrackId(trackId);
    if (seen.has(trackId)) continue;
    seen.add(trackId);
    result.push(trackId);
  }
  return result;
}

function normalizeHistoryEntries(value) {
  if (!Array.isArray(value)) return [];
  const entries = [];
  const seenTrackIds = new Set();
  for (const entry of value.slice(0, PLAYBACK_HISTORY_LIMIT)) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      !isBoundedTrackId(entry.trackId) ||
      typeof entry.playedAt !== 'string' ||
      Number.isNaN(Date.parse(entry.playedAt))
    ) {
      continue;
    }
    try {
      const normalizedEntry = {
        trackId: entry.trackId,
        playedAt: new Date(entry.playedAt).toISOString(),
        sourceId: optionalBoundedText(entry.sourceId),
        sourceName: optionalBoundedText(entry.sourceName),
      };
      if (seenTrackIds.has(normalizedEntry.trackId)) continue;
      seenTrackIds.add(normalizedEntry.trackId);
      entries.push(normalizedEntry);
    } catch {
      // One stale/corrupt event must not hide every valid event around it.
    }
  }
  return entries;
}

function normalizeSourceContext(value) {
  if (value === null || value === undefined) {
    return { sourceId: null, sourceName: null };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid playback source context');
  }
  return {
    sourceId: optionalBoundedText(value.sourceId),
    sourceName: optionalBoundedText(value.sourceName),
  };
}

function normalizeQueueSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid playback resume snapshot');
  }
  if (
    typeof value.currentIsSource !== 'boolean' ||
    typeof value.isShuffle !== 'boolean'
  ) {
    throw new Error('invalid playback resume snapshot');
  }
  if (
    !Array.isArray(value.historyEntries) ||
    value.historyEntries.length > PLAYBACK_QUEUE_LIMIT
  ) {
    throw new Error('invalid playback resume snapshot');
  }
  const historyEntries = value.historyEntries.map((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      typeof entry.source !== 'boolean'
    ) {
      throw new Error('invalid playback resume snapshot');
    }
    return { trackId: validateTrackId(entry.trackId), source: entry.source };
  });

  return {
    sourceTrackIds: uniqueTrackIds(value.sourceTrackIds),
    queuedTrackIds: uniqueTrackIds(value.queuedTrackIds),
    historyEntries,
    currentIsSource: value.currentIsSource,
    lastSourceTrackId:
      value.lastSourceTrackId === null
        ? null
        : validateTrackId(value.lastSourceTrackId),
    sourceName: optionalBoundedText(value.sourceName) ?? '',
    sourceId: optionalBoundedText(value.sourceId),
    isShuffle: value.isShuffle,
    orderIds: uniqueTrackIds(value.orderIds),
  };
}

function normalizeResumeSnapshot(value, now) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid playback resume snapshot');
  }
  if (
    !Number.isFinite(value.positionSeconds) ||
    value.positionSeconds < 0 ||
    value.positionSeconds > MAX_RESUME_POSITION_SECONDS ||
    !Number.isFinite(value.volume) ||
    value.volume < 0 ||
    value.volume > 1 ||
    typeof value.isMuted !== 'boolean' ||
    !PLAYBACK_MODES.has(value.playbackMode)
  ) {
    throw new Error('invalid playback resume snapshot');
  }

  return {
    version: PLAYBACK_PERSISTENCE_VERSION,
    updatedAt: now().toISOString(),
    currentTrackId: validateTrackId(value.currentTrackId),
    positionSeconds: value.positionSeconds,
    volume: value.volume,
    isMuted: value.isMuted,
    playbackMode: value.playbackMode,
    queue: normalizeQueueSnapshot(value.queue),
  };
}

function loadDocument(filePath, fallback, normalize) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    backupCorrupted(filePath);
    return fallback;
  }
  try {
    return normalize(parsed);
  } catch {
    backupCorrupted(filePath);
    return fallback;
  }
}

function createPlaybackPersistence({ userDataDir, now = () => new Date() }) {
  const historyPath = path.join(userDataDir, HISTORY_FILENAME);
  const resumePath = path.join(userDataDir, RESUME_FILENAME);
  const usagePath = path.join(userDataDir, USAGE_FILENAME);

  function ensureDirectory() {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  function getRecentHistory() {
    return loadDocument(historyPath, [], (document) => {
      if (
        !document ||
        typeof document !== 'object' ||
        Array.isArray(document) ||
        document.version !== PLAYBACK_PERSISTENCE_VERSION
      ) {
        throw new Error('invalid playback history document');
      }
      return normalizeHistoryEntries(document.entries);
    });
  }

  function writeHistory(entries) {
    ensureDirectory();
    atomicWriteJson(historyPath, {
      version: PLAYBACK_PERSISTENCE_VERSION,
      entries: entries.slice(0, PLAYBACK_HISTORY_LIMIT),
    });
  }

  function getLastPlayedAtByTrackId() {
    return loadDocument(usagePath, {}, (document) => {
      if (
        !document ||
        typeof document !== 'object' ||
        Array.isArray(document) ||
        document.version !== PLAYBACK_PERSISTENCE_VERSION ||
        !document.lastPlayedAtByTrackId ||
        typeof document.lastPlayedAtByTrackId !== 'object' ||
        Array.isArray(document.lastPlayedAtByTrackId)
      ) {
        throw new Error('invalid playback usage document');
      }
      const result = {};
      for (const [trackId, playedAt] of Object.entries(
        document.lastPlayedAtByTrackId,
      )) {
        if (
          isBoundedTrackId(trackId) &&
          typeof playedAt === 'string' &&
          !Number.isNaN(Date.parse(playedAt))
        ) {
          result[trackId] = new Date(playedAt).toISOString();
        }
      }
      return result;
    });
  }

  function writeUsage(lastPlayedAtByTrackId) {
    ensureDirectory();
    atomicWriteJson(usagePath, {
      version: PLAYBACK_PERSISTENCE_VERSION,
      lastPlayedAtByTrackId,
    });
  }

  function recordRecentPlayback(trackId, sourceContext) {
    const entry = {
      trackId: validateTrackId(trackId),
      playedAt: now().toISOString(),
      ...normalizeSourceContext(sourceContext),
    };
    const entries = [
      entry,
      ...getRecentHistory().filter(
        (existingEntry) => existingEntry.trackId !== entry.trackId,
      ),
    ].slice(0, PLAYBACK_HISTORY_LIMIT);
    writeHistory(entries);
    writeUsage({
      ...getLastPlayedAtByTrackId(),
      [entry.trackId]: entry.playedAt,
    });
    return entries;
  }

  function clearRecentHistory() {
    writeHistory([]);
    return [];
  }

  function getResumeSnapshot() {
    return loadDocument(resumePath, null, (document) => {
      if (document === null) return null;
      const normalized = normalizeResumeSnapshot(
        document,
        () => new Date(document.updatedAt),
      );
      if (
        document.version !== PLAYBACK_PERSISTENCE_VERSION ||
        typeof document.updatedAt !== 'string' ||
        Number.isNaN(Date.parse(document.updatedAt))
      ) {
        throw new Error('invalid playback resume document');
      }
      return normalized;
    });
  }

  function saveResumeSnapshot(value) {
    const normalized = normalizeResumeSnapshot(value, now);
    ensureDirectory();
    atomicWriteJson(resumePath, normalized);
    return normalized;
  }

  return {
    getRecentHistory,
    recordRecentPlayback,
    clearRecentHistory,
    getLastPlayedAtByTrackId,
    getResumeSnapshot,
    saveResumeSnapshot,
  };
}

module.exports = {
  PLAYBACK_HISTORY_LIMIT,
  PLAYBACK_PERSISTENCE_VERSION,
  createPlaybackPersistence,
};
