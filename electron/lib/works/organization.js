'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  hasControlCharacters,
  hasControlCharactersExceptLineBreaks,
} = require('../textGuards');
const { validateTrackBinding, bindingsEqual } = require('./trackBinding');

const WORKS_FILENAME = 'works.json';
const WORKS_VERSION = 1;
const MAX_WORKS_BYTES = 16 * 1024 * 1024;
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);

function fail(code = 'WORKS_INVALID') {
  throw Object.assign(new Error('Work organization operation failed'), {
    code,
  });
}

function record(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail();
  for (const key of Object.keys(value)) {
    if (RESERVED.has(key) || (allowed && !allowed.includes(key))) fail();
  }
  return value;
}

function text(value, max, required = false) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    hasControlCharacters(value)
  )
    fail();
  const result = value.trim();
  if (required && !result) fail();
  return result;
}

function identifier(value, max = 200, allowReserved = false) {
  const result = text(value, max, true);
  if (
    result !== value ||
    (!allowReserved && RESERVED.has(result)) ||
    /[/\\]/.test(result)
  )
    fail();
  return result;
}

function trackIdentifier(value, allowReserved = false) {
  return identifier(value, 255, allowReserved);
}

function timestamp(value) {
  if (
    typeof value !== 'string' ||
    value.length !== 24 ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    fail();
  return value;
}

function revision(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value === Number.MAX_SAFE_INTEGER
  )
    fail();
  return value;
}

function enumeration(value, values) {
  if (!values.includes(value)) fail();
  return value;
}

function versionNote(value) {
  if (
    typeof value !== 'string' ||
    value.length > 500 ||
    hasControlCharactersExceptLineBreaks(value)
  )
    fail();
  return value.replace(/\r\n/g, '\n').trim();
}

function versionInfo(value = {}) {
  record(value, ['arrangement', 'performance', 'vocal', 'label', 'note']);
  const {
    arrangement = 'unspecified',
    performance = 'unspecified',
    vocal = 'unspecified',
    label = '',
    note = '',
  } = value;
  return {
    arrangement: enumeration(arrangement, [
      'unspecified',
      'acoustic',
      'remix',
      'other',
    ]),
    performance: enumeration(performance, [
      'unspecified',
      'studio',
      'live',
      'demo',
    ]),
    vocal: enumeration(vocal, ['unspecified', 'vocal', 'instrumental']),
    label: text(label, 120),
    note: versionNote(note),
  };
}

function workLink(value, works) {
  record(value, ['workId', 'relationship']);
  const workId = identifier(value.workId);
  if (!Object.hasOwn(works, workId)) fail('WORKS_NOT_FOUND');
  return {
    workId,
    relationship: enumeration(value.relationship, [
      'unknown',
      'original',
      'cover',
    ]),
  };
}

function workFields(value) {
  const { aliases = [], note = '' } = value;
  if (!Array.isArray(aliases) || aliases.length > 16) fail();
  return {
    title: text(value.title, 200, true),
    aliases: aliases.map((alias) => text(alias, 200, true)),
    note: text(note, 500),
  };
}

function emptyWorksDocument() {
  return {
    version: WORKS_VERSION,
    revision: 0,
    works: {},
    trackProfiles: {},
    pendingTrackDeletions: {},
  };
}

function validateWorksDocument(value) {
  record(value, [
    'version',
    'revision',
    'works',
    'trackProfiles',
    'pendingTrackDeletions',
  ]);
  if (value.version !== WORKS_VERSION) fail('WORKS_UNSUPPORTED_VERSION');
  const result = {
    ...emptyWorksDocument(),
    revision: revision(value.revision),
  };
  for (const [key, max] of [
    ['works', 25000],
    ['trackProfiles', 100000],
    ['pendingTrackDeletions', 1000],
  ]) {
    record(value[key]);
    if (Object.keys(value[key]).length > max) fail();
  }
  for (const [id, work] of Object.entries(value.works)) {
    identifier(id);
    record(work, ['title', 'aliases', 'note', 'createdAt', 'updatedAt']);
    result.works[id] = {
      ...workFields(work),
      createdAt: timestamp(work.createdAt),
      updatedAt: timestamp(work.updatedAt),
    };
  }
  for (const [id, profile] of Object.entries(value.trackProfiles)) {
    trackIdentifier(id);
    record(profile, ['binding', 'workLink', 'versionInfo']);
    result.trackProfiles[id] = {
      binding: validateTrackBinding(profile.binding),
      ...(Object.hasOwn(profile, 'workLink')
        ? { workLink: workLink(profile.workLink, result.works) }
        : {}),
      versionInfo: versionInfo(profile.versionInfo),
    };
  }
  const pendingIds = new Set();
  for (const [id, receipt] of Object.entries(value.pendingTrackDeletions)) {
    identifier(id);
    record(receipt, ['trackId', 'binding', 'phase', 'createdAt']);
    const trackId = trackIdentifier(receipt.trackId, true);
    if (pendingIds.has(trackId)) fail();
    pendingIds.add(trackId);
    result.pendingTrackDeletions[id] = {
      trackId,
      binding: validateTrackBinding(receipt.binding),
      phase: enumeration(receipt.phase, ['prepared', 'media-deleted']),
      createdAt: timestamp(receipt.createdAt),
    };
  }
  return result;
}

// Invalid files remain at their original path, so a later mutation cannot replace
// unreadable user data with an empty document. Only ENOENT means a fresh library.
function loadWorks(dir) {
  const file = path.join(dir, WORKS_FILENAME);
  try {
    if (fs.statSync(file).size > MAX_WORKS_BYTES) fail();
    return validateWorksDocument(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return emptyWorksDocument();
    throw error;
  }
}

function writeDocument(dir, document) {
  const normalized = validateWorksDocument(document);
  const bytes = JSON.stringify(normalized, null, 2);
  if (Buffer.byteLength(bytes) > MAX_WORKS_BYTES) fail();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, WORKS_FILENAME);
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx');
    fs.writeFileSync(fd, bytes, 'utf8');
    // Deletion receipts must reach durable storage before media can be deleted.
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return normalized;
}

// Internal persistence boundary, never an IPC intent. Existing data must read
// successfully even if callers already hold a document in memory.
function saveWorks(dir, document, expectedRevision) {
  revision(expectedRevision);
  const current = loadWorks(dir);
  if (
    current.revision !== expectedRevision ||
    document.revision !== expectedRevision + 1
  )
    fail('WORKS_STALE');
  return writeDocument(dir, document);
}

function commitWorks(dir, expectedRevision, mutate) {
  revision(expectedRevision);
  const document = loadWorks(dir);
  if (document.revision !== expectedRevision) fail('WORKS_STALE');
  if (mutate(document) === false) return document;
  document.revision++;
  return writeDocument(dir, document);
}

function assertNoPending(document, trackId) {
  if (
    Object.values(document.pendingTrackDeletions).some(
      (receipt) => receipt.trackId === trackId,
    )
  )
    fail('WORKS_PENDING_DELETION');
}

function applyProfile(document, input) {
  const trackId = trackIdentifier(input.trackId);
  assertNoPending(document, trackId);
  const binding = validateTrackBinding(input.binding);
  const existing = document.trackProfiles[trackId];
  if (input.reconfirm !== undefined && typeof input.reconfirm !== 'boolean')
    fail();
  if (existing && !bindingsEqual(binding, existing.binding) && !input.reconfirm)
    fail('WORKS_BINDING_MISMATCH');
  const profile = {
    binding,
    versionInfo: existing?.versionInfo ?? versionInfo(),
    ...(existing?.workLink ? { workLink: existing.workLink } : {}),
  };
  if (Object.hasOwn(input, 'versionInfo'))
    profile.versionInfo = versionInfo(input.versionInfo);
  if (Object.hasOwn(input, 'workLink')) {
    if (input.workLink === null) delete profile.workLink;
    else profile.workLink = workLink(input.workLink, document.works);
  }
  document.trackProfiles[trackId] = profile;
}

function createAndLinkWork(dir, input) {
  record(input, ['expectedRevision', 'title', 'aliases', 'note', 'tracks']);
  const fields = workFields(input);
  if (
    !Array.isArray(input.tracks) ||
    input.tracks.length < 1 ||
    input.tracks.length > 2 ||
    new Set(input.tracks.map((track) => track?.trackId)).size !==
      input.tracks.length
  )
    fail();
  return commitWorks(dir, input.expectedRevision, (document) => {
    const id = `work-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    document.works[id] = { ...fields, createdAt: now, updatedAt: now };
    for (const track of input.tracks) {
      record(track, [
        'trackId',
        'binding',
        'relationship',
        'versionInfo',
        'reconfirm',
      ]);
      applyProfile(document, {
        ...track,
        workLink: { workId: id, relationship: track.relationship ?? 'unknown' },
      });
    }
  });
}

function saveTrackProfile(dir, input) {
  record(input, [
    'expectedRevision',
    'trackId',
    'binding',
    'versionInfo',
    'workLink',
    'reconfirm',
  ]);
  return commitWorks(dir, input.expectedRevision, (document) =>
    applyProfile(document, input),
  );
}

function unlinkTrack(dir, input) {
  record(input, ['expectedRevision', 'trackId', 'binding']);
  return commitWorks(dir, input.expectedRevision, (document) => {
    trackIdentifier(input.trackId);
    assertNoPending(document, input.trackId);
    const profile = document.trackProfiles[input.trackId];
    if (!profile) fail('WORKS_NOT_FOUND');
    if (!bindingsEqual(profile.binding, input.binding))
      fail('WORKS_BINDING_MISMATCH');
    if (!profile.workLink) return false;
    delete profile.workLink;
  });
}

function renameWork(dir, input) {
  record(input, ['expectedRevision', 'workId', 'title', 'aliases', 'note']);
  return commitWorks(dir, input.expectedRevision, (document) => {
    const id = identifier(input.workId);
    if (!Object.hasOwn(document.works, id)) fail('WORKS_NOT_FOUND');
    const fields = workFields({ ...document.works[id], ...input });
    document.works[id] = {
      ...document.works[id],
      ...fields,
      updatedAt: new Date().toISOString(),
    };
  });
}

function getBoundTrackProfile(document, trackId, binding) {
  trackIdentifier(trackId);
  if (
    Object.values(document.pendingTrackDeletions).some(
      (receipt) =>
        receipt.trackId === trackId &&
        receipt.phase === 'media-deleted' &&
        bindingsEqual(receipt.binding, binding),
    )
  )
    return null;
  const profile = document.trackProfiles[trackId];
  return profile && bindingsEqual(profile.binding, binding)
    ? structuredClone(profile)
    : null;
}

function prepareTrackDeletion(dir, input) {
  record(input, ['expectedRevision', 'trackId', 'binding']);
  const trackId = trackIdentifier(input.trackId, true);
  const binding = validateTrackBinding(input.binding);
  return commitWorks(dir, input.expectedRevision, (document) => {
    assertNoPending(document, trackId);
    document.pendingTrackDeletions[`delete-${crypto.randomUUID()}`] = {
      trackId,
      binding,
      phase: 'prepared',
      createdAt: new Date().toISOString(),
    };
  });
}

function markTrackMediaDeleted(dir, input) {
  record(input, ['expectedRevision', 'operationId']);
  return commitWorks(dir, input.expectedRevision, (document) => {
    const receipt =
      document.pendingTrackDeletions[identifier(input.operationId)];
    if (!receipt) fail('WORKS_NOT_FOUND');
    if (receipt.phase === 'media-deleted') return false;
    receipt.phase = 'media-deleted';
  });
}

function finishTrackDeletion(dir, input) {
  record(input, ['expectedRevision', 'operationId', 'cancel']);
  if (input.cancel !== undefined && typeof input.cancel !== 'boolean') fail();
  return commitWorks(dir, input.expectedRevision, (document) => {
    const receipt =
      document.pendingTrackDeletions[identifier(input.operationId)];
    if (!receipt) return false;
    if (
      !input.cancel &&
      Object.hasOwn(document.trackProfiles, receipt.trackId) &&
      bindingsEqual(
        document.trackProfiles[receipt.trackId]?.binding,
        receipt.binding,
      )
    )
      delete document.trackProfiles[receipt.trackId];
    delete document.pendingTrackDeletions[input.operationId];
  });
}

module.exports = {
  WORKS_FILENAME,
  WORKS_VERSION,
  MAX_WORKS_BYTES,
  emptyWorksDocument,
  validateWorksDocument,
  loadWorks,
  saveWorks,
  commitWorks,
  createAndLinkWork,
  saveTrackProfile,
  unlinkTrack,
  renameWork,
  getBoundTrackProfile,
  prepareTrackDeletion,
  markTrackMediaDeleted,
  finishTrackDeletion,
};
