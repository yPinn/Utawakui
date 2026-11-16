'use strict';
// Lazy so the catalog loads only when a message is built.
const t = (key, named) => require('./i18n').t(key, named);
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteBuffer } = require('./atomicWrite');
const {
  MAX_ARTWORK_BYTES,
  hasValidArtworkDimensions,
  inspectArtworkImage,
} = require('./artwork/image');
const { hasControlCharacters } = require('./textGuards');
const {
  sessionPerformedItems,
} = require('../../shared/sessionPerformedItems.mjs');

const ARCHIVE_LIMIT = 100;
const TIMELINE_LIMIT = 2000;
const safeId = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const safeCover = (value) =>
  typeof value === 'string' && /^[0-9a-f]{32}\.(?:jpg|png|webp)$/u.test(value);
const COVER_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

function coverPath(directory, id, filename) {
  if (!safeId(id) || !safeCover(filename)) return null;
  const root = fs.realpathSync(directory);
  const folder = path.join(root, 'performance-session-covers', id);
  return { root, folder, file: path.join(folder, filename) };
}

function resolveSessionCoverPath(directory, id, filename) {
  try {
    const target = coverPath(directory, id, filename);
    if (!target || fs.realpathSync(target.file) !== target.file) return null;
    return fs.statSync(target.file).isFile() ? target.file : null;
  } catch {
    return null;
  }
}

function coverUrl({ id, coverFilename }) {
  return safeCover(coverFilename)
    ? `utawakui-media://session-cover/${id}/${coverFilename}`
    : null;
}

function readCover(sourcePath) {
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile() || stat.size > MAX_ARTWORK_BYTES)
    throw invalid(t('session.main.coverInvalid'));
  const buffer = fs.readFileSync(sourcePath);
  const image =
    buffer.length <= MAX_ARTWORK_BYTES && inspectArtworkImage(buffer);
  const extension = image && COVER_EXTENSIONS[image.mimeType];
  if (!extension || !hasValidArtworkDimensions(image))
    throw invalid(t('session.main.coverInvalid'));
  return {
    buffer,
    filename: `${crypto.randomBytes(16).toString('hex')}.${extension}`,
  };
}
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
      ...(safeCover(a.coverFilename) ? { coverFilename: a.coverFilename } : {}),
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
        ...(a.coverFilename ? { coverUrl: coverUrl(a) } : {}),
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
  directory,
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
    const { coverFilename, ...record } = a;
    return {
      ...record,
      ...(coverFilename ? { coverUrl: coverUrl(a) } : {}),
      items: project({ ...d, items: a.items }, tracks).items,
    };
  }
  function setSessionCover(id, sourcePath, tracks) {
    let previous;
    let written;
    let document;
    try {
      document = mutate((draft) => {
        const archive = draft.archives?.find((entry) => entry.id === id);
        if (!archive) throw invalid(t('session.main.sessionNotFound'));
        previous = archive.coverFilename;
        if (sourcePath === null) {
          if (!previous) return false;
          delete archive.coverFilename;
          return true;
        }
        const { buffer, filename } = readCover(sourcePath);
        const target = coverPath(directory, archive.id, filename);
        const coverRoot = path.dirname(target.folder);
        fs.mkdirSync(coverRoot, { recursive: true });
        if (fs.realpathSync(coverRoot) !== coverRoot) throw invalid();
        fs.mkdirSync(target.folder, { recursive: true });
        if (fs.realpathSync(target.folder) !== target.folder) throw invalid();
        written = target.file;
        atomicWriteBuffer(written, buffer);
        archive.coverFilename = filename;
        return true;
      });
    } catch (error) {
      if (written) {
        try {
          fs.rmSync(written, { force: true });
          fs.rmSync(`${written}.tmp`, { force: true });
        } catch {
          // Preserve the original failure.
        }
      }
      throw error;
    }
    const oldFile =
      previous && resolveSessionCoverPath(directory, id, previous);
    if (oldFile) {
      try {
        fs.rmSync(oldFile, { force: true });
      } catch {
        /* The committed cover remains authoritative. */
      }
    }
    return project(document, tracks);
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
    setSessionCover,
    archiveSession,
    previewPlaylist,
    verifyPlaylistPreview,
  };
}
module.exports = {
  normalizeSessionFields,
  sessionProjectionFields,
  createSessionOperations,
  resolveSessionCoverPath,
  isSessionArchiveValidationError: (error) => error?.publicValidation === true,
};
