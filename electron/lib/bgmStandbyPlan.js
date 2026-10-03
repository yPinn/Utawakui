'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJson, backupCorrupted } = require('./atomicWrite');
const { isSafeTrackId } = require('./library/paths');

const BGM_STANDBY_PLAN_FILENAME = 'bgm-standby.json';
const BGM_STANDBY_PLAN_VERSION = 3;
const BGM_STANDBY_LEGACY_VERSIONS = Object.freeze([1, 2]);
const BGM_STANDBY_LEGACY_TRACK_LIMIT = 100;
const BGM_STANDBY_POSITION_MAX_SECONDS = 24 * 60 * 60;
const BGM_STANDBY_DEFAULT_DIM_DB = -12;

const BGM_STANDBY_DEFAULT_SETTINGS = Object.freeze({
  volume: 0.25,
  isMuted: false,
  loop: true,
  fadeInSeconds: 1,
  fadeOutSeconds: 0.6,
  dimDb: BGM_STANDBY_DEFAULT_DIM_DB,
  dimAttackMs: 100,
  dimReleaseMs: 600,
  preRollSeconds: 0.75,
  postRollSeconds: 1,
});

const BGM_STANDBY_VERSION_ONE_TRANSITION_DEFAULTS = Object.freeze({
  fadeInSeconds: 1.5,
  fadeOutSeconds: 1,
  preRollSeconds: 2,
  postRollSeconds: 2,
});

const BGM_STANDBY_LEGACY_DEFAULT_SETTINGS = Object.freeze({
  1: Object.freeze({
    volume: 0.5,
    isMuted: false,
    loop: true,
    fadeInSeconds: 1.5,
    fadeOutSeconds: 1,
    dimDb: -12,
    dimAttackMs: 100,
    dimReleaseMs: 600,
    preRollSeconds: 2,
    postRollSeconds: 2,
  }),
  2: Object.freeze({
    volume: 0.5,
    isMuted: false,
    loop: true,
    fadeInSeconds: 1,
    fadeOutSeconds: 0.6,
    dimDb: 20 * Math.log10(0.25),
    dimAttackMs: 100,
    dimReleaseMs: 600,
    preRollSeconds: 0.75,
    postRollSeconds: 1,
  }),
});

const SETTING_RULES = Object.freeze({
  volume: { type: 'number', min: 0, max: 1 },
  isMuted: { type: 'boolean' },
  fadeInSeconds: { type: 'number', min: 0.1, max: 5 },
  fadeOutSeconds: { type: 'number', min: 0.1, max: 5 },
  dimDb: { type: 'number', min: -30, max: -6 },
  dimAttackMs: { type: 'number', min: 20, max: 500 },
  dimReleaseMs: { type: 'number', min: 100, max: 2000 },
  preRollSeconds: { type: 'number', min: 0.5, max: 10 },
  postRollSeconds: { type: 'number', min: 0.5, max: 10 },
});

const VALIDATION_MESSAGES = Object.freeze({
  BGM_INTENT_INVALID: 'BGM 操作無效，請重新整理後再試。',
  BGM_TRACK_UNAVAILABLE: '這首本機曲目目前無法作為 BGM。',
  BGM_TRACK_NOT_FOUND: '找不到這個 BGM 項目，請重新整理後再試。',
  BGM_SETTING_OUT_OF_RANGE: 'BGM 設定超出允許範圍。',
  BGM_POSITION_INVALID: 'BGM 播放位置無效。',
});

class BgmStandbyPlanValidationError extends Error {
  constructor({ code, message, field = null }) {
    super(message || VALIDATION_MESSAGES[code] || 'BGM 操作無效。');
    this.name = 'BgmStandbyPlanValidationError';
    this.code = code;
    this.field = field;
  }
}

function validationError(code, field = null, message = undefined) {
  return new BgmStandbyPlanValidationError({ code, field, message });
}

function isBgmStandbyPlanValidationError(error) {
  return (
    error?.name === 'BgmStandbyPlanValidationError' &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  );
}

function isBoundedTrackId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 255 &&
    isSafeTrackId(value) &&
    ![...value].some((character) => character.codePointAt(0) <= 0x1f)
  );
}

function normalizeTracksById(value) {
  if (value instanceof Map) return value;
  if (!Array.isArray(value)) return new Map();
  return new Map(
    value
      .filter((track) => isBoundedTrackId(track?.id))
      .map((track) => [track.id, track]),
  );
}

function emptyDocument() {
  return {
    version: BGM_STANDBY_PLAN_VERSION,
    updatedAt: null,
    trackIds: [],
    currentTrackId: null,
    positionSeconds: 0,
    settings: { ...BGM_STANDBY_DEFAULT_SETTINGS },
  };
}

function sanitizeSetting(key, value, { strict = false } = {}) {
  const rule = SETTING_RULES[key];
  if (!rule) return undefined;
  if (typeof value !== rule.type) {
    if (strict) throw validationError('BGM_INTENT_INVALID', key);
    return BGM_STANDBY_DEFAULT_SETTINGS[key];
  }
  if (
    rule.type === 'number' &&
    (!Number.isFinite(value) || value < rule.min || value > rule.max)
  ) {
    if (strict) {
      const label = key === 'fadeOutSeconds' ? 'BGM 淡出時間' : 'BGM 設定';
      throw validationError(
        'BGM_SETTING_OUT_OF_RANGE',
        key,
        `${label}超出允許範圍。`,
      );
    }
    return BGM_STANDBY_DEFAULT_SETTINGS[key];
  }
  return value;
}

function matchesLegacyDefaults(source, version) {
  const defaults = BGM_STANDBY_LEGACY_DEFAULT_SETTINGS[version];
  if (!defaults) return false;
  return Object.entries(defaults).every(([key, value]) => {
    if (key === 'dimDb') {
      return (
        Number.isFinite(source[key]) && Math.abs(source[key] - value) <= 0.05
      );
    }
    return source[key] === value;
  });
}

function sanitizeSettings(value, { sourceVersion } = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const settings = Object.fromEntries(
    Object.keys(BGM_STANDBY_DEFAULT_SETTINGS).map((key) => [
      key,
      key === 'loop' ? true : sanitizeSetting(key, source[key]),
    ]),
  );
  const usedVersionOneTransitionDefaults = Object.entries(
    BGM_STANDBY_VERSION_ONE_TRANSITION_DEFAULTS,
  ).every(([key, value]) => source[key] === value);

  if (sourceVersion === 1 && usedVersionOneTransitionDefaults) {
    for (const key of Object.keys(
      BGM_STANDBY_VERSION_ONE_TRANSITION_DEFAULTS,
    )) {
      settings[key] = BGM_STANDBY_DEFAULT_SETTINGS[key];
    }
  }
  if (matchesLegacyDefaults(source, sourceVersion)) {
    return { ...BGM_STANDBY_DEFAULT_SETTINGS };
  }
  return settings;
}

function normalizeDocument(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![...BGM_STANDBY_LEGACY_VERSIONS, BGM_STANDBY_PLAN_VERSION].includes(
      value.version,
    ) ||
    !Array.isArray(value.trackIds) ||
    value.trackIds.length > BGM_STANDBY_LEGACY_TRACK_LIMIT
  ) {
    throw new Error('invalid BGM standby document');
  }

  const seen = new Set();
  const trackIds = value.trackIds.filter((trackId) => {
    if (!isBoundedTrackId(trackId) || seen.has(trackId)) return false;
    seen.add(trackId);
    return true;
  });
  const selectedTrackId =
    value.currentTrackId === null
      ? (trackIds[0] ?? null)
      : trackIds.includes(value.currentTrackId)
        ? value.currentTrackId
        : (trackIds[0] ?? null);
  const currentTrackId = selectedTrackId;
  const positionSeconds =
    currentTrackId &&
    Number.isFinite(value.positionSeconds) &&
    value.positionSeconds >= 0 &&
    value.positionSeconds <= BGM_STANDBY_POSITION_MAX_SECONDS
      ? value.positionSeconds
      : 0;
  const updatedAt =
    typeof value.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(value.updatedAt))
      ? new Date(value.updatedAt).toISOString()
      : null;

  return {
    version: BGM_STANDBY_PLAN_VERSION,
    updatedAt,
    trackIds: selectedTrackId ? [selectedTrackId] : [],
    currentTrackId,
    positionSeconds,
    settings: sanitizeSettings(value.settings, {
      sourceVersion: value.version,
    }),
  };
}

function cloneDocument(document) {
  return {
    ...document,
    trackIds: [...document.trackIds],
    settings: { ...document.settings },
  };
}

function normalizedTitle(track, fallback) {
  const title = typeof track?.title === 'string' ? track.title.trim() : '';
  return title || fallback;
}

function normalizedArtist(track) {
  return typeof track?.artist === 'string' ? track.artist.trim() : '';
}

function projectDocument(document, tracksByIdValue) {
  const tracksById = normalizeTracksById(tracksByIdValue);
  return {
    version: document.version,
    updatedAt: document.updatedAt,
    trackIds: [...document.trackIds],
    currentTrackId: document.currentTrackId,
    positionSeconds: document.positionSeconds,
    settings: { ...document.settings },
    items: document.trackIds.map((trackId) => {
      const track = tracksById.get(trackId);
      return {
        trackId,
        title: normalizedTitle(track, trackId),
        artist: normalizedArtist(track),
      };
    }),
  };
}

function createBgmStandbyPlanStore({ directory, now = () => new Date() }) {
  if (typeof directory !== 'string' || !directory) {
    throw new Error('BGM standby directory is required');
  }
  const filePath = path.join(directory, BGM_STANDBY_PLAN_FILENAME);

  function load() {
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyDocument();
      throw error;
    }
    let source;
    let normalized;
    try {
      source = JSON.parse(raw);
      normalized = normalizeDocument(source);
    } catch {
      backupCorrupted(filePath);
      return emptyDocument();
    }
    if (JSON.stringify(source) !== JSON.stringify(normalized)) {
      normalized.updatedAt = now().toISOString();
      persist(normalized);
    }
    return normalized;
  }

  function persist(document) {
    fs.mkdirSync(directory, { recursive: true });
    atomicWriteJson(filePath, document);
  }

  function mutate(mutator) {
    const document = cloneDocument(load());
    const changed = mutator(document) !== false;
    if (changed) {
      document.updatedAt = now().toISOString();
      persist(document);
    }
    return document;
  }

  function reconcile(document, tracksByIdValue) {
    const tracksById = normalizeTracksById(tracksByIdValue);
    const validTrackIds = document.trackIds.filter((trackId) =>
      tracksById.has(trackId),
    );
    if (
      validTrackIds.length === document.trackIds.length &&
      (document.currentTrackId === null ||
        validTrackIds.includes(document.currentTrackId))
    ) {
      return document;
    }
    const next = cloneDocument(document);
    next.trackIds = validTrackIds;
    next.currentTrackId =
      document.currentTrackId === null
        ? null
        : validTrackIds.includes(document.currentTrackId)
          ? document.currentTrackId
          : (validTrackIds[0] ?? null);
    if (next.currentTrackId !== document.currentTrackId) {
      next.positionSeconds = 0;
    }
    next.updatedAt = now().toISOString();
    persist(next);
    return next;
  }

  function getProjected(tracksById) {
    return projectDocument(reconcile(load(), tracksById), tracksById);
  }

  function requireAvailableTrack(trackId, tracksByIdValue) {
    if (!isBoundedTrackId(trackId)) {
      throw validationError('BGM_INTENT_INVALID', 'trackId');
    }
    const tracksById = normalizeTracksById(tracksByIdValue);
    if (!tracksById.has(trackId)) {
      throw validationError('BGM_TRACK_UNAVAILABLE', 'trackId');
    }
    return tracksById;
  }

  function setTrack(trackId, tracksByIdValue) {
    const tracksById = requireAvailableTrack(trackId, tracksByIdValue);
    const document = mutate((draft) => {
      if (
        draft.trackIds.length === 1 &&
        draft.trackIds[0] === trackId &&
        draft.currentTrackId === trackId
      ) {
        return false;
      }
      draft.trackIds = [trackId];
      draft.currentTrackId = trackId;
      draft.positionSeconds = 0;
    });
    return projectDocument(document, tracksById);
  }

  function removeTrackReference(trackId) {
    if (!isBoundedTrackId(trackId)) return false;
    const document = load();
    if (!document.trackIds.includes(trackId)) return false;
    mutate((draft) => {
      draft.trackIds = [];
      draft.currentTrackId = null;
      draft.positionSeconds = 0;
    });
    return true;
  }

  function updateSettings(intent, tracksById) {
    if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
      throw validationError('BGM_INTENT_INVALID');
    }
    const document = mutate((draft) => {
      let changed = false;
      for (const key of Object.keys(SETTING_RULES)) {
        if (!Object.hasOwn(intent, key)) continue;
        const value = sanitizeSetting(key, intent[key], { strict: true });
        if (draft.settings[key] === value) continue;
        draft.settings[key] = value;
        changed = true;
      }
      return changed;
    });
    return projectDocument(document, tracksById);
  }

  function updatePosition(intent, tracksById) {
    if (
      !intent ||
      typeof intent !== 'object' ||
      !isBoundedTrackId(intent.trackId) ||
      !Number.isFinite(intent.positionSeconds) ||
      intent.positionSeconds < 0 ||
      intent.positionSeconds > BGM_STANDBY_POSITION_MAX_SECONDS
    ) {
      throw validationError('BGM_POSITION_INVALID', 'positionSeconds');
    }
    const document = mutate((draft) => {
      if (draft.currentTrackId !== intent.trackId) {
        throw validationError('BGM_TRACK_NOT_FOUND', 'trackId');
      }
      if (draft.positionSeconds === intent.positionSeconds) return false;
      draft.positionSeconds = intent.positionSeconds;
    });
    return projectDocument(document, tracksById);
  }

  return {
    getProjected,
    removeTrackReference,
    setTrack,
    updatePosition,
    updateSettings,
  };
}

module.exports = {
  BGM_STANDBY_DEFAULT_SETTINGS,
  BGM_STANDBY_PLAN_FILENAME,
  BGM_STANDBY_PLAN_VERSION,
  BgmStandbyPlanValidationError,
  createBgmStandbyPlanStore,
  isBgmStandbyPlanValidationError,
};
