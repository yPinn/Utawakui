'use strict';

const { isBoundedTrackId } = require('../../lib/library/paths');
const {
  hasControlCharacters,
  hasControlCharactersExceptLineBreaks,
} = require('../../lib/textGuards');
const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');

const relationships = new Set(['unknown', 'original', 'cover']);
const enums = {
  arrangement: new Set(['unspecified', 'acoustic', 'remix', 'other']),
  performance: new Set(['unspecified', 'studio', 'live', 'demo']),
  vocal: new Set(['unspecified', 'vocal', 'instrumental']),
};
const fields = Object.keys(enums).concat(['label', 'note']);
const workIdPattern =
  /^work-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const safeRecord = (value, allowed) =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Object.keys(value).every((key) => allowed.includes(key)),
  );
const safeText = (value, max, required = false) =>
  typeof value === 'string' &&
  value.length <= max &&
  !hasControlCharacters(value) &&
  (!required || value.trim().length > 0);
const safeTrack = (id) =>
  isBoundedTrackId(id) &&
  id.length <= 255 &&
  !['__proto__', 'constructor', 'prototype'].includes(id);
const safeRevision = (value) => Number.isSafeInteger(value) && value >= 0;
const safeScope = safeRevision;
const safeWorkId = (value) =>
  typeof value === 'string' && workIdPattern.test(value);

function validVersion(value) {
  return (
    safeRecord(value, fields) &&
    Object.entries(value).every(([field, entry]) =>
      enums[field]
        ? enums[field].has(entry)
        : field === 'note'
          ? typeof entry === 'string' &&
            entry.length <= 500 &&
            !hasControlCharactersExceptLineBreaks(entry)
          : safeText(entry, 120),
    )
  );
}

function validSelection(value) {
  if (!safeRecord(value, ['kind', 'workId', 'title', 'targetTrackId']))
    return false;
  if (value.kind === 'keep' || value.kind === 'none')
    return Object.keys(value).length === 1;
  if (value.kind === 'existing')
    return Object.keys(value).length === 2 && safeWorkId(value.workId);
  if (value.kind === 'track')
    return Object.keys(value).length === 2 && safeTrack(value.targetTrackId);
  return (
    value.kind === 'new' &&
    !Object.hasOwn(value, 'workId') &&
    safeText(value.title, 200, true) &&
    (value.targetTrackId === undefined || safeTrack(value.targetTrackId))
  );
}

function validGet(value) {
  return (
    safeRecord(value, ['trackId', 'offset', 'limit']) &&
    safeTrack(value.trackId) &&
    (value.offset === undefined ||
      (safeRevision(value.offset) && value.offset <= 100000)) &&
    (value.limit === undefined ||
      (Number.isSafeInteger(value.limit) &&
        value.limit > 0 &&
        value.limit <= 100))
  );
}

function validSearch(value) {
  return (
    safeRecord(value, ['trackId', 'query', 'limit']) &&
    safeTrack(value.trackId) &&
    safeText(value.query, 200) &&
    (value.limit === undefined ||
      (Number.isSafeInteger(value.limit) &&
        value.limit > 0 &&
        value.limit <= 50))
  );
}

function validSave(value) {
  return (
    safeRecord(value, [
      'trackId',
      'expectedRevision',
      'libraryEpoch',
      'selection',
      'relationship',
      'versionInfo',
      'reconfirm',
    ]) &&
    safeTrack(value.trackId) &&
    safeRevision(value.expectedRevision) &&
    safeScope(value.libraryEpoch) &&
    validSelection(value.selection) &&
    relationships.has(value.relationship) &&
    validVersion(value.versionInfo) &&
    (value.reconfirm === undefined || typeof value.reconfirm === 'boolean')
  );
}

function validRename(value) {
  return (
    safeRecord(value, [
      'workId',
      'title',
      'expectedRevision',
      'libraryEpoch',
    ]) &&
    safeWorkId(value.workId) &&
    safeText(value.title, 200, true) &&
    safeRevision(value.expectedRevision) &&
    safeScope(value.libraryEpoch)
  );
}

const expectedStates = Object.freeze({
  WORKS_STALE: 'conflict',
  WORKS_CONFLICT: 'conflict',
  WORKS_TARGET_LINKED: 'conflict',
  WORKS_TARGET_CHANGED: 'target-changed',
  WORKS_SCOPE_STALE: 'stale',
  WORKS_BINDING_MISMATCH: 'binding-mismatch',
  WORKS_NOT_FOUND: 'not-found',
  WORKS_INVALID: 'invalid-intent',
  WORKS_PENDING_DELETION: 'recovery-pending',
});

function projectVersion(version) {
  return Object.fromEntries(
    fields
      .filter((field) => Object.hasOwn(version ?? {}, field))
      .map((field) => [field, version[field]]),
  );
}

function projectResult(result, operation) {
  if (result?.status !== 'ok') {
    const status = Object.values(expectedStates).includes(result?.status)
      ? result.status
      : 'invalid-intent';
    return { status };
  }
  const base = {
    status: 'ok',
    libraryEpoch: result.libraryEpoch,
    revision: result.revision,
  };
  if (operation === 'rename') return base;
  if (operation === 'search')
    return {
      ...base,
      works: (result.works ?? [])
        .slice(0, 50)
        .map(({ id, title, memberCount }) => ({ id, title, memberCount })),
      tracks: (result.tracks ?? [])
        .slice(0, 50)
        .map(({ id, title, artist, workId }) => ({
          id,
          title,
          artist,
          workId,
        })),
    };
  return {
    ...base,
    trackId: result.trackId,
    bindingStatus: result.bindingStatus,
    work: result.work
      ? {
          id: result.work.id,
          title: result.work.title,
          aliases: result.work.aliases,
          note: result.work.note,
        }
      : null,
    relationship: result.relationship,
    versionInfo: projectVersion(result.versionInfo),
    relatedVersions: (result.relatedVersions ?? [])
      .slice(0, 100)
      .map(({ trackId, relationship, versionInfo }) => ({
        trackId,
        relationship,
        versionInfo: projectVersion(versionInfo),
      })),
    relatedCandidateTotal:
      result.relatedCandidateTotal ?? result.relatedTotal ?? 0,
    hasMore: result.hasMore === true,
    nextOffset: result.nextOffset ?? null,
  };
}

function registerLibraryWorkOrganizationHandlers({
  ipcMain,
  runtime,
  recordDiagnostic,
}) {
  for (const [operation, channel, valid] of [
    ['get', 'library:get-work-organization', validGet],
    ['search', 'library:search-work-organization', validSearch],
    ['save', 'library:save-work-organization', validSave],
    ['rename', 'library:rename-work', validRename],
  ]) {
    ipcMain.handle(channel, async (_event, intent) => {
      if (!valid(intent)) return { status: 'invalid-intent' };
      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'work-organization',
            operation,
            code: 'WORK_ORGANIZATION_FAILED',
          },
          publicError: {
            code: 'WORK_ORGANIZATION_FAILED',
            title: '歌曲整理未完成',
            message: '目前無法讀取或儲存歌曲資料，請再試一次。',
            context: { retryable: true },
          },
        },
        async () => {
          try {
            return projectResult(await runtime[operation](intent), operation);
          } catch (error) {
            if (Object.hasOwn(expectedStates, error?.code))
              return { status: expectedStates[error.code] };
            throw error;
          }
        },
      );
    });
  }
}

module.exports = { registerLibraryWorkOrganizationHandlers };
