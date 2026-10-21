'use strict';
const crypto = require('node:crypto');
const { hasControlCharacters } = require('./textGuards');

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
function invalid(message = '場次資料無效，請重新讀取。') {
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
    value.durationMs < 0
  )
    throw invalid();
  return { timecode: value.timecode, durationMs: value.durationMs };
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
    throw invalid('封存資料無法讀取；原檔已保留，請先修復資料。');
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
function sessionProjectionFields(document) {
  if (!document.sessionId) return {};
  return {
    sessionId: document.sessionId,
    sessionStartedAt: document.sessionStartedAt,
    archives: document.archives.map((a) => ({
      id: a.id,
      name: a.name,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
      itemCount: a.items.length,
      completedCount: a.items.filter((i) => i.progress === 'completed').length,
      completedManualCount: a.items.filter(
        (i) => i.progress === 'completed' && i.mode === 'manual',
      ).length,
      coverTrackIds: [
        ...new Set(
          a.items
            .filter((i) => i.mode === 'library-track' && i.trackId)
            .map((i) => i.trackId),
        ),
      ].slice(0, 4),
    })),
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
  function attachTimeline(draft, entry) {
    begin(draft);
    const clean = timelineEntry(entry);
    if (draft.timeline.some((e) => e.id === clean.id)) return false;
    if (draft.timeline.length >= TIMELINE_LIMIT)
      throw invalid('這場的時間軸已達保存上限，請先封存場次。');
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
        name: d.source?.name ?? '目前場次',
        startedAt: d.sessionStartedAt,
        endedAt: null,
        source: d.source,
        items: project(d, tracks).items,
        timeline: d.timeline,
      };
    const a = d.archives?.find((a) => a.id === id);
    if (!a) throw invalid('找不到這個場次，請重新讀取。');
    // The archive stays scalar-only; availability is always resolved afresh.
    return { ...a, items: project({ ...d, items: a.items }, tracks).items };
  }
  function archiveSession(intent, tracks) {
    if (
      !safeId(intent?.sessionId) ||
      !text(intent.name, 200) ||
      !intent.name.trim()
    )
      throw invalid('請輸入場次名稱（最多 200 字）。');
    const d = mutate((d) => {
      if (d.archives?.some((a) => a.id === intent.sessionId)) return false;
      if (d.sessionId !== intent.sessionId)
        throw invalid('目前場次已變更，請重新讀取。');
      assertNoCurrent(d);
      if (!d.items.length && !d.timeline.length)
        throw invalid('目前沒有可封存的演出紀錄。');
      if (d.archives.length >= ARCHIVE_LIMIT)
        throw invalid('封存場次已達保存上限；目前場次仍保留。');
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
      throw invalid('請選擇完整安排或完成曲目。');
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
      throw invalid('曲目或可用性已變更，請重新檢視合併與排除預覽。');
    if (!next.savedCount) throw invalid('沒有可保存的本機曲目。');
    return next;
  }
  return {
    ensureSession,
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
