'use strict';

const { isBoundedTrackId } = require('../../lib/library/paths');
const { validateReleaseInfo } = require('../../lib/releases/schema');
const { hasControlCharacters } = require('../../lib/textGuards');
const { runDiagnosticIpcOperation } = require('../ipcErrorBoundary');
const fields = ['type', 'date', 'totalTrackCount'];
const types = new Set(['unknown', 'single', 'ep', 'album']);
const statuses = new Set([
  'current',
  'changed',
  'unresolved',
  'missing',
  'unverified',
]);
const record = (value, keys) =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Object.keys(value).every((key) => keys.includes(key)),
  );
const id = (value) =>
  isBoundedTrackId(value) &&
  !['constructor', 'prototype', '__proto__'].includes(value);
const revision = (value) => Number.isSafeInteger(value) && value >= 0;
const page = (value) =>
  (value.offset === undefined ||
    (revision(value.offset) && value.offset <= 5000)) &&
  (value.limit === undefined ||
    (Number.isInteger(value.limit) && value.limit >= 1 && value.limit <= 100));
function validGet(value) {
  return (
    record(value, ['collectionId', 'offset', 'limit']) &&
    id(value.collectionId) &&
    page(value)
  );
}
function validSave(value) {
  if (
    !record(value, [
      'collectionId',
      'expectedRevision',
      'libraryEpoch',
      'set',
      'remove',
      'leadTrackId',
      'initializeBindings',
      'reconfirmTrackIds',
    ]) ||
    !id(value.collectionId) ||
    !revision(value.expectedRevision) ||
    !revision(value.libraryEpoch)
  )
    return false;
  if (
    value.initializeBindings !== undefined &&
    typeof value.initializeBindings !== 'boolean'
  )
    return false;
  if (
    value.leadTrackId !== undefined &&
    value.leadTrackId !== null &&
    !id(value.leadTrackId)
  )
    return false;
  if (
    value.reconfirmTrackIds !== undefined &&
    (!Array.isArray(value.reconfirmTrackIds) ||
      value.reconfirmTrackIds.length > 100 ||
      value.reconfirmTrackIds.some((entry) => !id(entry)) ||
      new Set(value.reconfirmTrackIds).size !== value.reconfirmTrackIds.length)
  )
    return false;
  const set = value.set === undefined ? {} : value.set;
  const remove = value.remove === undefined ? [] : value.remove;
  if (
    !record(set, fields) ||
    !Array.isArray(remove) ||
    remove.length > 3 ||
    new Set(remove).size !== remove.length ||
    remove.some((field) => !fields.includes(field) || Object.hasOwn(set, field))
  )
    return false;
  try {
    validateReleaseInfo(
      { revision: 0, observed: {}, overrides: set },
      { kind: 'album', trackIds: [] },
    );
    return true;
  } catch {
    return false;
  }
}
function validCreate(value) {
  return (
    record(value, ['trackId', 'name', 'libraryEpoch']) &&
    id(value.trackId) &&
    revision(value.libraryEpoch) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    value.name.length <= 200 &&
    !hasControlCharacters(value.name)
  );
}
function validForTrack(value) {
  return (
    record(value, ['trackId', 'offset', 'limit']) &&
    id(value.trackId) &&
    (value.offset === undefined ||
      (revision(value.offset) && value.offset <= 500)) &&
    (value.limit === undefined ||
      (Number.isInteger(value.limit) && value.limit >= 1 && value.limit <= 50))
  );
}
function validResolve(value) {
  return (
    record(value, [
      'collectionId',
      'expectedRevision',
      'libraryEpoch',
      'offset',
      'limit',
    ]) &&
    id(value.collectionId) &&
    revision(value.expectedRevision) &&
    revision(value.libraryEpoch) &&
    page(value)
  );
}
const expected = Object.freeze({
  RELEASE_INFO_CONFLICT: 'conflict',
  RELEASE_CONFLICT: 'conflict',
  RELEASE_SCOPE_STALE: 'stale',
  WORKS_SCOPE_STALE: 'stale',
  RELEASE_NOT_FOUND: 'not-found',
  RELEASE_INFO_INVALID: 'invalid-intent',
  RELEASE_INVALID: 'invalid-intent',
  RELEASE_BINDING_MISMATCH: 'binding-mismatch',
  RELEASE_PENDING_DELETION: 'recovery-pending',
  RELEASE_BINDINGS_REQUIRED: 'invalid-intent',
  RELEASE_SOURCE_OWNED: 'invalid-intent',
  RELEASE_LIMIT_REACHED: 'limit-reached',
});
function date(value) {
  return value &&
    typeof value.value === 'string' &&
    /^\d{4}(?:-\d{2}){0,2}$/.test(value.value) &&
    ['year', 'month', 'day'].includes(value.precision)
    ? { value: value.value, precision: value.precision }
    : null;
}
function values(value = {}) {
  const result = {};
  if (Object.hasOwn(value, 'type'))
    result.type = types.has(value.type) ? value.type : 'unknown';
  if (Object.hasOwn(value, 'date')) result.date = date(value.date);
  if (Object.hasOwn(value, 'totalTrackCount'))
    result.totalTrackCount =
      Number.isSafeInteger(value.totalTrackCount) && value.totalTrackCount > 0
        ? value.totalTrackCount
        : null;
  return result;
}
function effective(value = {}) {
  return {
    ...values(value),
    provenance: Object.fromEntries(
      fields
        .filter((key) =>
          ['manual', 'provider', 'unknown'].includes(value.provenance?.[key]),
        )
        .map((key) => [key, value.provenance[key]]),
    ),
    conflicts: (Array.isArray(value.conflicts) ? value.conflicts : []).filter(
      (field) => fields.includes(field),
    ),
  };
}
function members(value) {
  return (Array.isArray(value) ? value : [])
    .slice(0, 100)
    .filter((member) => id(member?.trackId))
    .map((member) => ({
      trackId: member.trackId,
      bindingStatus: statuses.has(member.bindingStatus)
        ? member.bindingStatus
        : 'unverified',
    }));
}
function project(result, operation) {
  if (result?.status !== 'ok')
    return {
      status: Object.values(expected).includes(result?.status)
        ? result.status
        : 'invalid-intent',
    };
  const base = { status: 'ok', libraryEpoch: result.libraryEpoch };
  if (operation === 'forTrack')
    return {
      ...base,
      releases: (result.releases ?? []).slice(0, 50).map((entry) => ({
        id: entry.id,
        name: entry.name,
        type: types.has(entry.type) ? entry.type : 'unknown',
        date: date(entry.date),
        revision: entry.revision,
      })),
      hasMore: result.hasMore === true,
      nextOffset: result.nextOffset ?? null,
    };
  if (operation === 'resolveMembers')
    return {
      ...base,
      collectionId: result.collectionId,
      revision: result.revision,
      members: members(result.members),
      playableTrackIds: (result.playableTrackIds ?? [])
        .filter(id)
        .slice(0, 100),
      hasMore: result.hasMore === true,
      nextOffset: result.nextOffset ?? null,
    };
  const release = result.release;
  return {
    ...base,
    release: {
      id: release.id,
      name: release.name,
      revision: release.revision,
      sourceBacked: release.sourceBacked === true,
      effective: effective(release.effective),
      overrides: values(release.overrides),
      sourceValues: values(release.sourceValues),
      leadTrackId: release.leadTrackId ?? null,
      memberTrackIds: (release.memberTrackIds ?? []).filter(id).slice(0, 5000),
      memberCount: release.memberCount,
      members: members(release.members),
      hasMore: release.hasMore === true,
      nextOffset: release.nextOffset ?? null,
      requiresMembershipVerification:
        release.requiresMembershipVerification === true,
      canInitializeBindings: release.canInitializeBindings === true,
    },
  };
}
function registerLibraryReleaseHandlers({
  ipcMain,
  runtime,
  recordDiagnostic,
}) {
  for (const [operation, channel, valid] of [
    ['get', 'library:get-release-info', validGet],
    ['save', 'library:save-release-info', validSave],
    ['create', 'library:create-local-release', validCreate],
    ['forTrack', 'library:get-track-releases', validForTrack],
    ['resolveMembers', 'library:resolve-release-members', validResolve],
  ]) {
    ipcMain.handle(channel, async (_event, intent) => {
      if (!valid(intent)) return { status: 'invalid-intent' };
      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'release-organization',
            operation,
            code: 'RELEASE_ORGANIZATION_FAILED',
          },
          publicError: {
            code: 'RELEASE_ORGANIZATION_FAILED',
            title: '發行資料未完成',
            message: '目前無法讀取或儲存發行資料，請再試一次。',
            context: { retryable: true },
          },
        },
        async () => {
          try {
            return project(await runtime[operation](intent), operation);
          } catch (error) {
            if (Object.hasOwn(expected, error?.code))
              return { status: expected[error.code] };
            throw error;
          }
        },
      );
    });
  }
}
module.exports = { registerLibraryReleaseHandlers };
