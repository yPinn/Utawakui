'use strict';
// Lazy so the catalog loads only when a message is built.
const t = (key, named) => require('./i18n').t(key, named);
const crypto = require('node:crypto');
const { hasControlCharacters } = require('./textGuards');
const {
  sessionPerformedItems,
} = require('../../shared/sessionPerformedItems.mjs');

const ARCHIVE_LIMIT = 100;
const TIMELINE_LIMIT = 2000;
const safeId = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const text = (value, limit = 256) =>
  typeof value === 'string' &&
  value.length <= limit &&
  !hasControlCharacters(value);
const timestamp = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
function invalid(message = t('session.main.archiveInvalid')) {
  return Object.assign(new Error(message), {
    code: 'SESSION_ARCHIVE_INVALID',
    field: null,
    publicValidation: true,
  });
}
function output(value) {
  if (value === null || value === undefined) return null;
  if (
    !text(value.timecode, 32) ||
    !/^\d{2,}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(value.timecode) ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < 0 ||
    (value.segmentId !== undefined && !safeId(value.segmentId))
  )
    throw invalid();
  return {
    timecode: value.timecode,
    durationMs: value.durationMs,
    ...(value.segmentId ? { segmentId: value.segmentId } : {}),
  };
}
function timelineEntry(value) {
  if (
    !value ||
    !safeId(value.id) ||
    !['track', 'marker'].includes(value.type) ||
    !timestamp(value.occurredAt)
  )
    throw invalid();
  const base = {
    id: value.id,
    type: value.type,
    occurredAt: value.occurredAt,
    stream: output(value.stream),
    record: output(value.record),
  };
  if (value.type === 'marker') {
    if (value.label !== null && !text(value.label)) throw invalid();
    return { ...base, label: value.label };
  }
  if (
    !text(value.title) ||
    !text(value.artist ?? '') ||
    !text(value.trackId ?? '') ||
    (value.itemId != null && !safeId(value.itemId))
  )
    throw invalid();
  return {
    ...base,
    trackId: value.trackId ?? null,
    title: value.title,
    artist: value.artist ?? '',
    itemId: value.itemId ?? null,
  };
}
function timeline(value) {
  if (!Array.isArray(value) || value.length > TIMELINE_LIMIT) throw invalid();
  const entries = value.map(timelineEntry);
  if (new Set(entries.map((e) => e.id)).size !== entries.length)
    throw invalid();
  return entries;
}
function normalizeSessionFields(value, sanitizeItem, sanitizeSource) {
  if (
    value.sessionId === undefined &&
    value.archives === undefined &&
    value.timeline === undefined
  )
    return {};
  if (
    !safeId(value.sessionId) ||
    !Array.isArray(value.archives) ||
    value.archives.length > ARCHIVE_LIMIT
  )
    throw invalid(t('session.main.archiveUnreadable'));
  const archives = value.archives.map((a) => {
    if (
      !safeId(a?.id) ||
      !text(a.name, 200) ||
      !a.name.trim() ||
      !timestamp(a.endedAt) ||
      !Array.isArray(a.items) ||
      a.items.length > 500
    )
      throw invalid();
    const items = a.items.map(sanitizeItem);
    if (
      items.some((i) => !i) ||
      new Set(items.map((i) => i.itemId)).size !== items.length
    )
      throw invalid();
    return {
      id: a.id,
      name: a.name,
      startedAt: timestamp(a.startedAt) ? a.startedAt : null,
      endedAt: a.endedAt,
      source: sanitizeSource(a.source),
      items,
      timeline: timeline(a.timeline),
    };
  });
  if (
    new Set(archives.map((a) => a.id)).size !== archives.length ||
    archives.some((a) => a.id === value.sessionId)
  )
    throw invalid();
  return {
    sessionId: value.sessionId,
    sessionStartedAt: timestamp(value.sessionStartedAt)
      ? value.sessionStartedAt
      : null,
    timeline: timeline(value.timeline),
    archives,
  };
}
function hasSessionContent(document) {
  return document.items.length > 0 || document.timeline.length > 0;
}

function sessionProjectionFields(document) {
  if (!document.sessionId) return {};
  return {
    sessionId: document.sessionId,
    sessionStartedAt: document.sessionStartedAt,
    canArchive: hasSessionContent(document),
    archives: document.archives.map((a) => {
      const performed = sessionPerformedItems(a);
      return {
        id: a.id,
        name: a.name,
        startedAt: a.startedAt,
        endedAt: a.endedAt,
        itemCount: a.items.length,
        performedCount: performed.length,
        completedCount: performed.filter((i) => i.progress === 'completed')
          .length,
        completedManualCount: performed.filter(
          (i) => i.progress === 'completed' && i.mode === 'manual',
        ).length,
        coverTrackIds: [
          ...new Set(
            performed
              .filter((i) => i.mode === 'library-track' && i.trackId)
              .map((i) => i.trackId),
          ),
        ].slice(0, 4),
      };
    }),
  };
}
function createSessionOperations({
  load,
  mutate,
  project,
  assertNoCurrent,
  now,
}) {
  function begin(draft) {
    if (draft.sessionId) return false;
    Object.assign(draft, {
      sessionId: crypto.randomUUID(),
      sessionStartedAt: null,
      timeline: [],
      archives: [],
    });
    return true;
  }
  function ensureSession(tracks) {
    return project(mutate(begin), tracks);
  }

  function getArchivableSessionId() {
    const document = load();
    return document.sessionId && hasSessionContent(document)
      ? document.sessionId
      : null;
  }
  function attachTimeline(draft, entry) {
    begin(draft);
    const clean = timelineEntry(entry);
    if (draft.timeline.some((e) => e.id === clean.id)) return false;
    if (draft.timeline.length >= TIMELINE_LIMIT)
      throw invalid(t('session.main.timelineFull'));
    draft.timeline.push(clean);
    draft.sessionStartedAt ??= clean.occurredAt;
    return true;
  }
  function recordMarker(entry, sessionId) {
    return mutate((d) =>
      d.sessionId === sessionId ? attachTimeline(d, entry) : false,
    );
  }
  function getSession(id, tracks) {
    const d = load();
    if (id === d.sessionId)
      return {
        id,
        name: d.source?.name ?? t('session.main.currentSession'),
        startedAt: d.sessionStartedAt,
        endedAt: null,
        source: d.source,
        items: project(d, tracks).items,
        timeline: d.timeline,
      };
    const a = d.archives?.find((a) => a.id === id);
    if (!a) throw invalid(t('session.main.sessionNotFound'));
    // The archive stays scalar-only; availability is always resolved afresh.
    return { ...a, items: project({ ...d, items: a.items }, tracks).items };
  }
  function archiveSession(intent, tracks) {
    if (
      !safeId(intent?.sessionId) ||
      !text(intent.name, 200) ||
      !intent.name.trim()
    )
      throw invalid(t('session.main.nameRequired'));
    const d = mutate((d) => {
      if (d.archives?.some((a) => a.id === intent.sessionId)) return false;
      if (d.sessionId !== intent.sessionId)
        throw invalid(t('session.main.sessionChanged'));
      assertNoCurrent(d);
      if (!hasSessionContent(d))
        throw invalid(t('session.main.nothingToArchive'));
      if (d.archives.length >= ARCHIVE_LIMIT)
        throw invalid(t('session.main.archiveFull'));
      d.archives.push({
        id: d.sessionId,
        name: intent.name.trim(),
        startedAt: d.sessionStartedAt,
        endedAt: now().toISOString(),
        source: d.source,
        items: d.items,
        timeline: d.timeline,
      });
      Object.assign(d, {
        sessionId: crypto.randomUUID(),
        sessionStartedAt: null,
        timeline: [],
        source: null,
        reviewCursorItemId: null,
        items: [],
      });
    });
    return project(d, tracks);
  }
  function previewPlaylist(intent, tracks) {
    if (!['all', 'completed'].includes(intent?.scope))
      throw invalid(t('session.main.scopeRequired'));
    const session = getSession(intent.sessionId, tracks);
    let items = session.items;
    if (intent.scope === 'completed')
      items = items
        .filter((i) => i.progress === 'completed')
        .sort((a, b) =>
          (a.progressUpdatedAt ?? '').localeCompare(b.progressUpdatedAt ?? ''),
        );
    let manualCount = 0,
      unavailableCount = 0,
      mergedCount = 0;
    const trackIds = [],
      seen = new Set();
    for (const i of items) {
      if (i.mode === 'manual') {
        manualCount++;
        continue;
      }
      if (i.mode !== 'library-track' || !i.trackId || !tracks.has(i.trackId)) {
        unavailableCount++;
        continue;
      }
      if (seen.has(i.trackId)) {
        mergedCount++;
        continue;
      }
      seen.add(i.trackId);
      trackIds.push(i.trackId);
    }
    const result = {
      sessionId: intent.sessionId,
      scope: intent.scope,
      total: items.length,
      savedCount: trackIds.length,
      mergedCount,
      manualCount,
      unavailableCount,
      trackIds,
    };
    const token = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          result,
          items: items.map((i) => [
            i.itemId,
            i.revision,
            i.progressRevision,
            i.trackId,
          ]),
        }),
      )
      .digest('hex');
    return { ...result, token };
  }
  function verifyPlaylistPreview(intent, tracks) {
    const next = previewPlaylist(intent, tracks);
    if (intent.token !== next.token)
      throw invalid(t('session.main.previewStale'));
    if (!next.savedCount) throw invalid(t('session.main.nothingToSave'));
    return next;
  }
  return {
    ensureSession,
    getArchivableSessionId,
    attachTimeline,
    recordMarker,
    getSession,
    archiveSession,
    previewPlaylist,
    verifyPlaylistPreview,
  };
}
module.exports = {
  normalizeSessionFields,
  sessionProjectionFields,
  createSessionOperations,
  isSessionArchiveValidationError: (error) => error?.publicValidation === true,
};
