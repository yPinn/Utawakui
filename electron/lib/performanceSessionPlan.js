'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJson, backupCorrupted } = require('./atomicWrite');
const { isSafeTrackId } = require('./library/paths');

const PERFORMANCE_SESSION_PLAN_FILENAME = 'performance-session-plan.json';
const PERFORMANCE_SESSION_PLAN_VERSION = 1;
const PERFORMANCE_SESSION_PLAN_ITEM_LIMIT = 500;
const PERFORMANCE_SESSION_PLAN_LABEL_LIMIT = 200;
const PERFORMANCE_SESSION_PLAN_PASTE_LIMIT =
  PERFORMANCE_SESSION_PLAN_ITEM_LIMIT *
  (PERFORMANCE_SESSION_PLAN_LABEL_LIMIT + 1);
const PERFORMANCE_SESSION_PLAN_ID_LIMIT = 255;
const VERIFICATION_STATES = new Set(['unreviewed', 'verified']);
const ITEM_MODES = new Set(['library-track', 'manual', 'placeholder']);
const ORIGINS = new Set(['collection', 'paste', 'live', 'manual', 'duplicate']);
const COLLECTION_KINDS = new Set(['playlist', 'album']);

const VALIDATION_MESSAGES = Object.freeze({
  SESSION_PLAN_REPLACE_REQUIRED: '目前已有場次草稿，請先確認是否取代。',
  SESSION_PLAN_ITEM_LIMIT_EXCEEDED: '場次草稿最多可包含 500 首曲目。',
  SESSION_PLAN_DISPLAY_TITLE_REQUIRED: '請輸入顯示曲名或項目名稱。',
  SESSION_PLAN_DISPLAY_TITLE_TOO_LONG: '顯示曲名或項目名稱不可超過 200 個字。',
  SESSION_PLAN_DISPLAY_ARTIST_TOO_LONG: '第二行不可超過 200 個字。',
  SESSION_PLAN_LABEL_INVALID: '名稱包含無法使用的控制字元。',
  SESSION_PLAN_TRACK_REQUIRED: '請先連結可播放的本機曲目。',
  SESSION_PLAN_TRACK_UNAVAILABLE: '連結的本機曲目目前無法使用。',
  SESSION_PLAN_ITEM_NOT_FOUND: '找不到這個場次項目，請重新整理後再試。',
  SESSION_PLAN_STALE_REVISION: '這首曲目已在其他操作中更新，請重新確認。',
  SESSION_PLAN_SOURCE_INVALID: '來源播放清單目前無法建立場次草稿。',
  SESSION_PLAN_INTENT_INVALID: '場次準備操作無效，請重新整理後再試。',
});

class PerformanceSessionPlanValidationError extends Error {
  constructor({ code, message, field = null, context = undefined }) {
    super(message || VALIDATION_MESSAGES[code] || '場次準備操作無效。');
    this.name = 'PerformanceSessionPlanValidationError';
    this.code = code;
    this.field = field;
    this.context = context;
  }
}

function isPerformanceSessionPlanValidationError(error) {
  return (
    error?.name === 'PerformanceSessionPlanValidationError' &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  );
}

function validationError(code, field = null, context = undefined) {
  return new PerformanceSessionPlanValidationError({
    code,
    message: VALIDATION_MESSAGES[code],
    field,
    context,
  });
}

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function isBoundedId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= PERFORMANCE_SESSION_PLAN_ID_LIMIT &&
    !hasControlCharacters(value)
  );
}

function isBoundedTrackId(value) {
  return (
    isBoundedId(value) && isSafeTrackId(value) && !hasControlCharacters(value)
  );
}

function normalizeDisplayTitle(value) {
  if (typeof value !== 'string') {
    throw validationError(
      'SESSION_PLAN_DISPLAY_TITLE_REQUIRED',
      'displayTitle',
    );
  }
  const normalized = value.trim();
  if (!normalized) {
    throw validationError(
      'SESSION_PLAN_DISPLAY_TITLE_REQUIRED',
      'displayTitle',
    );
  }
  if (normalized.length > PERFORMANCE_SESSION_PLAN_LABEL_LIMIT) {
    throw validationError(
      'SESSION_PLAN_DISPLAY_TITLE_TOO_LONG',
      'displayTitle',
    );
  }
  if (hasControlCharacters(normalized)) {
    throw validationError('SESSION_PLAN_LABEL_INVALID', 'displayTitle');
  }
  return normalized;
}

function normalizeDisplayArtist(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') {
    throw validationError('SESSION_PLAN_LABEL_INVALID', 'displayArtist');
  }
  const normalized = value.trim();
  if (normalized.length > PERFORMANCE_SESSION_PLAN_LABEL_LIMIT) {
    throw validationError(
      'SESSION_PLAN_DISPLAY_ARTIST_TOO_LONG',
      'displayArtist',
    );
  }
  if (hasControlCharacters(normalized)) {
    throw validationError('SESSION_PLAN_LABEL_INVALID', 'displayArtist');
  }
  return normalized;
}

function normalizedTrackArtist(track) {
  return typeof track?.artist === 'string' ? track.artist.trim() : '';
}

function normalizedTrackTitle(track, fallback = '') {
  const title = typeof track?.title === 'string' ? track.title.trim() : '';
  if (title && title.length <= PERFORMANCE_SESSION_PLAN_LABEL_LIMIT) {
    return hasControlCharacters(title) ? fallback : title;
  }
  return fallback;
}

function emptyDocument() {
  return {
    version: PERFORMANCE_SESSION_PLAN_VERSION,
    updatedAt: null,
    source: null,
    reviewCursorItemId: null,
    items: [],
  };
}

function sanitizeSource(value) {
  if (value === null || value === undefined) return null;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !isBoundedId(value.id) ||
    !COLLECTION_KINDS.has(value.kind) ||
    typeof value.name !== 'string'
  ) {
    return null;
  }
  const name = value.name.trim();
  if (
    !name ||
    name.length > PERFORMANCE_SESSION_PLAN_LABEL_LIMIT ||
    hasControlCharacters(name)
  ) {
    return null;
  }
  return { id: value.id, name, kind: value.kind };
}

function sanitizeSourceSnapshot(value) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    return {
      title: normalizeDisplayTitle(value.title),
      artist: normalizeDisplayArtist(value.artist),
    };
  } catch {
    return null;
  }
}

function sanitizePersistedItem(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (
    !isBoundedId(value.itemId) ||
    !ORIGINS.has(value.origin) ||
    !VERIFICATION_STATES.has(value.verification) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  ) {
    return null;
  }

  let displayTitle;
  let displayArtist;
  try {
    displayTitle = normalizeDisplayTitle(value.displayTitle);
    displayArtist = normalizeDisplayArtist(value.displayArtist);
  } catch {
    return null;
  }

  const trackId = value.trackId === null ? null : value.trackId;
  if (trackId !== null && !isBoundedTrackId(trackId)) return null;
  const inferredMode = trackId ? 'library-track' : 'placeholder';
  const mode = ITEM_MODES.has(value.mode) ? value.mode : inferredMode;
  if (mode === 'manual' && trackId !== null) return null;

  return {
    itemId: value.itemId,
    mode,
    trackId,
    displayTitle,
    displayArtist,
    verification: value.verification,
    origin: value.origin,
    sourceSnapshot: sanitizeSourceSnapshot(value.sourceSnapshot),
    revision: value.revision,
  };
}

function normalizeDocument(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.version !== PERFORMANCE_SESSION_PLAN_VERSION ||
    !Array.isArray(value.items) ||
    value.items.length > PERFORMANCE_SESSION_PLAN_ITEM_LIMIT
  ) {
    throw new Error('invalid performance session plan document');
  }

  const seen = new Set();
  const items = [];
  for (const rawItem of value.items) {
    const item = sanitizePersistedItem(rawItem);
    if (!item || seen.has(item.itemId)) continue;
    seen.add(item.itemId);
    items.push(item);
  }

  const source = sanitizeSource(value.source);
  const reviewCursorItemId = items.some(
    (item) => item.itemId === value.reviewCursorItemId,
  )
    ? value.reviewCursorItemId
    : (items[0]?.itemId ?? null);
  const updatedAt =
    typeof value.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(value.updatedAt))
      ? new Date(value.updatedAt).toISOString()
      : null;

  return {
    version: PERFORMANCE_SESSION_PLAN_VERSION,
    updatedAt,
    source,
    reviewCursorItemId,
    items,
  };
}

function cloneDocument(document) {
  return {
    ...document,
    source: document.source ? { ...document.source } : null,
    items: document.items.map((item) => ({
      ...item,
      sourceSnapshot: item.sourceSnapshot ? { ...item.sourceSnapshot } : null,
    })),
  };
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

function projectDocument(document, tracksByIdValue) {
  const tracksById = normalizeTracksById(tracksByIdValue);
  const summary = {
    total: document.items.length,
    verified: 0,
    unreviewed: 0,
    manual: 0,
    needsLink: 0,
    unavailable: 0,
    sourceChanged: 0,
    ready: 0,
    needsAttention: 0,
  };

  const items = document.items.map((item) => {
    const linkedTrack = item.trackId ? tracksById.get(item.trackId) : null;
    const availability =
      item.mode === 'manual'
        ? 'manual'
        : item.trackId
          ? linkedTrack
            ? 'playable'
            : 'unavailable'
          : 'unlinked';
    const sourceChanged = Boolean(
      item.mode === 'library-track' &&
      linkedTrack &&
      item.sourceSnapshot &&
      (normalizedTrackTitle(linkedTrack, linkedTrack.id) !==
        item.sourceSnapshot.title ||
        normalizedTrackArtist(linkedTrack) !== item.sourceSnapshot.artist),
    );
    const ready =
      item.mode === 'manual' ||
      (item.mode === 'library-track' && availability === 'playable');
    const status =
      item.mode === 'manual'
        ? 'manual'
        : availability === 'unlinked'
          ? 'needs-link'
          : availability === 'unavailable'
            ? 'unavailable'
            : sourceChanged
              ? 'source-changed'
              : ready
                ? 'ready'
                : 'needs-attention';

    if (item.verification === 'verified') summary.verified += 1;
    else summary.unreviewed += 1;
    if (item.mode === 'manual') summary.manual += 1;
    if (availability === 'unlinked') summary.needsLink += 1;
    if (availability === 'unavailable') summary.unavailable += 1;
    if (sourceChanged) summary.sourceChanged += 1;
    if (ready) summary.ready += 1;
    if (!ready) summary.needsAttention += 1;

    return {
      ...item,
      availability,
      status,
      sourceChanged,
      ready,
      linkedTrack: linkedTrack
        ? {
            id: linkedTrack.id,
            title: normalizedTrackTitle(linkedTrack, linkedTrack.id),
            artist: normalizedTrackArtist(linkedTrack),
          }
        : null,
    };
  });

  return {
    version: document.version,
    updatedAt: document.updatedAt,
    source: document.source,
    reviewCursorItemId: document.reviewCursorItemId,
    items,
    summary,
  };
}

function createPerformanceSessionPlanStore({
  directory,
  now = () => new Date(),
  createId = () => crypto.randomUUID(),
}) {
  if (typeof directory !== 'string' || !directory) {
    throw new Error('performance session plan directory is required');
  }
  const filePath = path.join(directory, PERFORMANCE_SESSION_PLAN_FILENAME);

  function load() {
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyDocument();
      throw error;
    }

    try {
      return normalizeDocument(JSON.parse(raw));
    } catch {
      backupCorrupted(filePath);
      return emptyDocument();
    }
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

  function createItem({
    mode = trackId ? 'library-track' : 'placeholder',
    trackId = null,
    displayTitle,
    displayArtist = '',
    origin,
    verification = mode === 'placeholder' ? 'unreviewed' : 'verified',
    sourceSnapshot = null,
  }) {
    return {
      itemId: createId(),
      mode,
      trackId,
      displayTitle: normalizeDisplayTitle(displayTitle),
      displayArtist: normalizeDisplayArtist(displayArtist),
      verification,
      origin,
      sourceSnapshot,
      revision: 1,
    };
  }

  function trackSnapshot(track, trackId) {
    if (!track) return null;
    return {
      title: normalizedTrackTitle(track, trackId),
      artist: normalizedTrackArtist(track),
    };
  }

  function appendItem(item, tracksById) {
    const document = mutate((draft) => {
      if (draft.items.length >= PERFORMANCE_SESSION_PLAN_ITEM_LIMIT) {
        throw validationError('SESSION_PLAN_ITEM_LIMIT_EXCEEDED');
      }
      draft.items.push(item);
      draft.reviewCursorItemId = item.itemId;
    });
    return projectDocument(document, tracksById);
  }

  function getProjected(tracksById) {
    return projectDocument(load(), tracksById);
  }

  function replaceFromCollection({
    collection,
    tracksById: tracksByIdValue,
    replaceCurrent = false,
  }) {
    const source = sanitizeSource(collection);
    if (!source || !Array.isArray(collection?.trackIds)) {
      throw validationError('SESSION_PLAN_SOURCE_INVALID');
    }
    if (collection.trackIds.length > PERFORMANCE_SESSION_PLAN_ITEM_LIMIT) {
      throw validationError('SESSION_PLAN_ITEM_LIMIT_EXCEEDED');
    }
    const tracksById = normalizeTracksById(tracksByIdValue);
    const nextItems = [];
    for (const trackId of collection.trackIds) {
      if (!isBoundedTrackId(trackId)) continue;
      const linkedTrack = tracksById.get(trackId);
      nextItems.push(
        createItem({
          mode: 'library-track',
          trackId,
          displayTitle: normalizedTrackTitle(linkedTrack, trackId),
          displayArtist: normalizedTrackArtist(linkedTrack),
          origin: 'collection',
          verification: 'verified',
          sourceSnapshot: trackSnapshot(linkedTrack, trackId),
        }),
      );
    }

    const document = mutate((draft) => {
      if (draft.items.length > 0 && !replaceCurrent) {
        throw validationError('SESSION_PLAN_REPLACE_REQUIRED', null, {
          currentSourceName: draft.source?.name ?? null,
          itemCount: draft.items.length,
          updatedAt: draft.updatedAt,
        });
      }
      draft.source = source;
      draft.items = nextItems;
      draft.reviewCursorItemId = nextItems[0]?.itemId ?? null;
    });
    return projectDocument(document, tracksById);
  }

  function appendPlaceholders(text, tracksById) {
    if (typeof text !== 'string') {
      throw validationError('SESSION_PLAN_INTENT_INVALID');
    }
    if (text.length > PERFORMANCE_SESSION_PLAN_PASTE_LIMIT) {
      throw validationError('SESSION_PLAN_ITEM_LIMIT_EXCEEDED');
    }
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const items = lines.map((displayTitle) =>
      createItem({ mode: 'placeholder', displayTitle, origin: 'paste' }),
    );

    const document = mutate((draft) => {
      if (
        draft.items.length + items.length >
        PERFORMANCE_SESSION_PLAN_ITEM_LIMIT
      ) {
        throw validationError('SESSION_PLAN_ITEM_LIMIT_EXCEEDED');
      }
      if (items.length === 0) return false;
      draft.items.push(...items);
      draft.reviewCursorItemId ??= items[0].itemId;
    });
    return projectDocument(document, tracksById);
  }

  function appendLibraryTrack(trackId, tracksByIdValue) {
    if (!isBoundedTrackId(trackId)) {
      throw validationError('SESSION_PLAN_INTENT_INVALID', 'trackId');
    }
    const tracksById = normalizeTracksById(tracksByIdValue);
    const linkedTrack = tracksById.get(trackId);
    if (!linkedTrack) {
      throw validationError('SESSION_PLAN_TRACK_UNAVAILABLE', 'trackId');
    }
    return appendItem(
      createItem({
        mode: 'library-track',
        trackId,
        displayTitle: normalizedTrackTitle(linkedTrack, trackId),
        displayArtist: normalizedTrackArtist(linkedTrack),
        origin: 'live',
        verification: 'verified',
        sourceSnapshot: trackSnapshot(linkedTrack, trackId),
      }),
      tracksById,
    );
  }

  function appendManualItem(intent, tracksById) {
    if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
      throw validationError('SESSION_PLAN_INTENT_INVALID');
    }
    return appendItem(
      createItem({
        mode: 'manual',
        displayTitle: intent.displayTitle,
        displayArtist: intent.displayArtist,
        origin: 'manual',
        verification: 'verified',
      }),
      tracksById,
    );
  }

  function updateItem(intent, tracksByIdValue) {
    if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
      throw validationError('SESSION_PLAN_INTENT_INVALID');
    }
    const tracksById = normalizeTracksById(tracksByIdValue);
    const document = mutate((draft) => {
      const index = draft.items.findIndex(
        (item) => item.itemId === intent.itemId,
      );
      if (index < 0) throw validationError('SESSION_PLAN_ITEM_NOT_FOUND');
      const current = draft.items[index];
      if (
        !Number.isSafeInteger(intent.expectedRevision) ||
        intent.expectedRevision !== current.revision
      ) {
        throw validationError('SESSION_PLAN_STALE_REVISION');
      }

      const displayTitle =
        intent.displayTitle === undefined
          ? current.displayTitle
          : normalizeDisplayTitle(intent.displayTitle);
      const displayArtist =
        intent.displayArtist === undefined
          ? current.displayArtist
          : normalizeDisplayArtist(intent.displayArtist);
      let trackId = current.trackId;
      if (intent.trackId !== undefined) {
        if (intent.trackId === null || intent.trackId === '') trackId = null;
        else if (isBoundedTrackId(intent.trackId)) trackId = intent.trackId;
        else throw validationError('SESSION_PLAN_INTENT_INVALID', 'trackId');
      }
      if (trackId && !tracksById.has(trackId)) {
        throw validationError('SESSION_PLAN_TRACK_UNAVAILABLE', 'trackId');
      }

      const authoredChanged =
        displayTitle !== current.displayTitle ||
        displayArtist !== current.displayArtist ||
        trackId !== current.trackId;
      const mode =
        current.mode === 'manual'
          ? 'manual'
          : trackId
            ? 'library-track'
            : 'placeholder';
      if (mode === 'manual' && trackId) {
        throw validationError('SESSION_PLAN_INTENT_INVALID', 'trackId');
      }
      const linkedTrack = trackId ? tracksById.get(trackId) : null;
      const next = {
        ...current,
        mode,
        displayTitle,
        displayArtist,
        trackId,
        verification: mode === 'placeholder' ? 'unreviewed' : 'verified',
        sourceSnapshot:
          mode === 'library-track'
            ? trackId !== current.trackId || !current.sourceSnapshot
              ? trackSnapshot(linkedTrack, trackId)
              : current.sourceSnapshot
            : null,
      };

      if (intent.verify === true) {
        if (!trackId) {
          throw validationError('SESSION_PLAN_TRACK_REQUIRED', 'trackId');
        }
        const verifiedTrack = tracksById.get(trackId);
        if (!verifiedTrack) {
          throw validationError('SESSION_PLAN_TRACK_UNAVAILABLE', 'trackId');
        }
        next.mode = 'library-track';
        next.verification = 'verified';
        next.sourceSnapshot = trackSnapshot(verifiedTrack, trackId);
      }

      const verificationChanged =
        next.verification !== current.verification ||
        JSON.stringify(next.sourceSnapshot) !==
          JSON.stringify(current.sourceSnapshot);
      if (authoredChanged || verificationChanged) {
        next.revision = current.revision + 1;
        draft.items[index] = next;
      }

      if (intent.advance === true) {
        draft.reviewCursorItemId =
          draft.items[index + 1]?.itemId ?? draft.items[index].itemId;
      } else {
        draft.reviewCursorItemId = draft.items[index].itemId;
      }
      return authoredChanged || verificationChanged || intent.advance === true;
    });
    return projectDocument(document, tracksById);
  }

  function duplicateItem(itemId, tracksById) {
    const document = mutate((draft) => {
      if (draft.items.length >= PERFORMANCE_SESSION_PLAN_ITEM_LIMIT) {
        throw validationError('SESSION_PLAN_ITEM_LIMIT_EXCEEDED');
      }
      const index = draft.items.findIndex((item) => item.itemId === itemId);
      if (index < 0) throw validationError('SESSION_PLAN_ITEM_NOT_FOUND');
      const current = draft.items[index];
      const duplicate = createItem({
        mode: current.mode,
        trackId: current.trackId,
        displayTitle: current.displayTitle,
        displayArtist: current.displayArtist,
        origin: 'duplicate',
        verification: current.verification,
        sourceSnapshot: current.sourceSnapshot
          ? { ...current.sourceSnapshot }
          : null,
      });
      draft.items.splice(index + 1, 0, duplicate);
      draft.reviewCursorItemId = duplicate.itemId;
    });
    return projectDocument(document, tracksById);
  }

  function moveItem(intent, tracksById) {
    if (
      !intent ||
      typeof intent !== 'object' ||
      ![1, -1].includes(intent.offset)
    ) {
      throw validationError('SESSION_PLAN_INTENT_INVALID');
    }
    const document = mutate((draft) => {
      const index = draft.items.findIndex(
        (item) => item.itemId === intent.itemId,
      );
      if (index < 0) throw validationError('SESSION_PLAN_ITEM_NOT_FOUND');
      const targetIndex = index + intent.offset;
      if (targetIndex < 0 || targetIndex >= draft.items.length) return false;
      const [moved] = draft.items.splice(index, 1);
      moved.revision += 1;
      draft.items.splice(targetIndex, 0, moved);
      draft.reviewCursorItemId = moved.itemId;
    });
    return projectDocument(document, tracksById);
  }

  function removeItem(itemId, tracksById) {
    const document = mutate((draft) => {
      const index = draft.items.findIndex((item) => item.itemId === itemId);
      if (index < 0) throw validationError('SESSION_PLAN_ITEM_NOT_FOUND');
      draft.items.splice(index, 1);
      if (draft.reviewCursorItemId === itemId) {
        draft.reviewCursorItemId =
          draft.items[index]?.itemId ?? draft.items[index - 1]?.itemId ?? null;
      }
    });
    return projectDocument(document, tracksById);
  }

  function setReviewCursor(itemId, tracksById) {
    const document = mutate((draft) => {
      if (!draft.items.some((item) => item.itemId === itemId)) {
        throw validationError('SESSION_PLAN_ITEM_NOT_FOUND');
      }
      if (draft.reviewCursorItemId === itemId) return false;
      draft.reviewCursorItemId = itemId;
    });
    return projectDocument(document, tracksById);
  }

  function clear(tracksById) {
    const document = mutate((draft) => {
      if (draft.items.length === 0 && !draft.source) return false;
      draft.source = null;
      draft.reviewCursorItemId = null;
      draft.items = [];
    });
    return projectDocument(document, tracksById);
  }

  function unlinkTrack(trackId) {
    if (!isBoundedTrackId(trackId)) return false;
    let changed = false;
    mutate((draft) => {
      for (const item of draft.items) {
        if (item.trackId !== trackId) continue;
        item.trackId = null;
        item.mode = 'placeholder';
        item.verification = 'unreviewed';
        item.sourceSnapshot = null;
        item.revision += 1;
        changed = true;
      }
      return changed;
    });
    return changed;
  }

  return {
    appendLibraryTrack,
    appendManualItem,
    appendPlaceholders,
    clear,
    duplicateItem,
    getProjected,
    moveItem,
    removeItem,
    replaceFromCollection,
    setReviewCursor,
    unlinkTrack,
    updateItem,
  };
}

module.exports = {
  PERFORMANCE_SESSION_PLAN_FILENAME,
  PERFORMANCE_SESSION_PLAN_ITEM_LIMIT,
  PERFORMANCE_SESSION_PLAN_LABEL_LIMIT,
  PERFORMANCE_SESSION_PLAN_PASTE_LIMIT,
  PERFORMANCE_SESSION_PLAN_VERSION,
  PerformanceSessionPlanValidationError,
  createPerformanceSessionPlanStore,
  isPerformanceSessionPlanValidationError,
};
