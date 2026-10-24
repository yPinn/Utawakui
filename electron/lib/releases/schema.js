'use strict';

const { isBoundedTrackId } = require('../library/paths');
const { hasControlCharacters } = require('../textGuards');

const FIELDS = ['type', 'date', 'totalTrackCount'];
const TYPES = new Set(['unknown', 'single', 'ep', 'album']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const owns = (value, key) => Object.hasOwn(value, key);

function invalid() {
  throw Object.assign(new Error('Invalid release information.'), {
    code: 'RELEASE_INFO_INVALID',
  });
}

function record(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some(
      (key) => FORBIDDEN_KEYS.has(key) || (allowed && !allowed.includes(key)),
    )
  )
    invalid();
}

function trackIds(value) {
  if (
    !Array.isArray(value) ||
    value.length > 5000 ||
    value.some((id) => !isBoundedTrackId(id) || FORBIDDEN_KEYS.has(id)) ||
    new Set(value).size !== value.length
  )
    invalid();
  return value;
}

function date(value) {
  record(value, ['value', 'precision']);
  const patterns = {
    year: /^([0-9]{4})$/,
    month: /^([0-9]{4})-([0-9]{2})$/,
    day: /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/,
  };
  const match =
    typeof value.value === 'string' &&
    patterns[value.precision]?.exec(value.value);
  if (!match) invalid();
  const year = Number(match[1]);
  const month = Number(match[2] || 1);
  const day = Number(match[3] || 1);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1])
    invalid();
  return { value: value.value, precision: value.precision };
}

function fieldValue(field, value, nullable) {
  if (nullable && field !== 'type' && value === null) return null;
  if (field === 'type') {
    if (!TYPES.has(value)) invalid();
    return value;
  }
  if (field === 'date') return date(value);
  if (!Number.isSafeInteger(value) || value < 1) invalid();
  return value;
}

function observed(value, collection) {
  record(value, FIELDS);
  const result = {};
  for (const [field, fact] of Object.entries(value)) {
    record(fact, ['value', 'provenance']);
    record(fact.provenance, ['provider', 'sourceId']);
    const { provider, sourceId } = fact.provenance;
    if (
      [provider, sourceId].some(
        (entry) =>
          typeof entry !== 'string' ||
          !entry ||
          entry.length > 200 ||
          hasControlCharacters(entry),
      ) ||
      collection.source?.platform !== provider ||
      collection.source?.id !== sourceId
    )
      invalid();
    result[field] = {
      value: fieldValue(field, fact.value, false),
      provenance: { provider, sourceId },
    };
  }
  return result;
}

function bindings(value, members, source) {
  if (source) invalid();
  record(value);
  const memberSet = new Set(members);
  const result = {};
  for (const [id, binding] of Object.entries(value)) {
    if (!isBoundedTrackId(id) || !memberSet.has(id)) invalid();
    if (binding === null) {
      result[id] = null;
      continue;
    }
    record(binding, ['kind', 'value']);
    if (
      binding.kind !== 'audio-content-sha256' ||
      typeof binding.value !== 'string' ||
      !/^[a-f0-9]{64}$/.test(binding.value)
    )
      invalid();
    result[id] = { kind: binding.kind, value: binding.value };
  }
  return Object.fromEntries(members.map((id) => [id, result[id] ?? null]));
}

// Strict on persisted unknown fields: the writer must fail closed rather than
// sanitize away newer user data and subsequently overwrite it.
function validateReleaseInfo(value, collection) {
  record(value, [
    'revision',
    'observed',
    'overrides',
    'leadTrackId',
    'localMemberBindings',
  ]);
  const members = trackIds(collection.trackIds);
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) invalid();
  record(value.overrides, FIELDS);
  const overrides = {};
  for (const [field, entry] of Object.entries(value.overrides)) {
    overrides[field] = fieldValue(field, entry, true);
  }
  const result = {
    revision: value.revision,
    observed: observed(value.observed, collection),
    overrides,
  };
  if (owns(value, 'leadTrackId')) {
    if (!members.includes(value.leadTrackId)) invalid();
    result.leadTrackId = value.leadTrackId;
  }
  if (owns(value, 'localMemberBindings')) {
    result.localMemberBindings = bindings(
      value.localMemberBindings,
      members,
      collection.source,
    );
  }
  return result;
}

function createReleaseInfo(collection, memberBindings) {
  const result = { revision: 0, observed: {}, overrides: {} };
  if (memberBindings !== undefined) {
    result.localMemberBindings = bindings(
      memberBindings,
      trackIds(collection.trackIds),
      collection.source,
    );
  }
  return result;
}

function currentInfo(collection) {
  return collection.releaseInfo === undefined
    ? createReleaseInfo(collection)
    : validateReleaseInfo(collection.releaseInfo, collection);
}

function resolveReleaseInfo(collection) {
  const info = currentInfo(collection);
  const result = {
    type: 'unknown',
    date: null,
    totalTrackCount: null,
    provenance: {},
    conflicts: [],
  };
  for (const field of FIELDS) {
    if (owns(info.overrides, field)) {
      result[field] = info.overrides[field];
      result.provenance[field] = 'manual';
    } else if (owns(info.observed, field)) {
      result[field] = info.observed[field].value;
      result.provenance[field] = 'provider';
    } else result.provenance[field] = 'unknown';
  }
  if (
    result.totalTrackCount !== null &&
    result.totalTrackCount < collection.trackIds.length
  ) {
    result.totalTrackCount = null;
    result.conflicts.push('totalTrackCount');
  }
  return result;
}

function nextRevision(revision) {
  if (revision === Number.MAX_SAFE_INTEGER) invalid();
  return revision + 1;
}

function equal(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object')
    return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => owns(right, key) && equal(left[key], right[key]))
  );
}

function updated(collection, previous, next) {
  if (equal(previous, next)) return collection;
  return {
    ...collection,
    releaseInfo: { ...next, revision: nextRevision(previous.revision) },
  };
}

function updateReleaseInfo(collection, intent, options = {}) {
  if (collection.kind !== 'album') invalid();
  record(intent, ['expectedRevision', 'set', 'remove', 'leadTrackId']);
  if (
    !Number.isSafeInteger(intent.expectedRevision) ||
    intent.expectedRevision < 0
  )
    invalid();
  const previous = currentInfo(collection);
  if (intent.expectedRevision !== previous.revision) {
    throw Object.assign(new Error('Release information has changed.'), {
      code: 'RELEASE_INFO_CONFLICT',
    });
  }
  const patch = owns(intent, 'set') ? intent.set : {};
  record(patch, FIELDS);
  const remove = owns(intent, 'remove') ? intent.remove : [];
  if (
    !Array.isArray(remove) ||
    remove.some((field) => !FIELDS.includes(field) || owns(patch, field))
  )
    invalid();
  const next = { ...previous, overrides: { ...previous.overrides } };
  for (const [field, value] of Object.entries(patch)) {
    next.overrides[field] = fieldValue(field, value, true);
    if (
      field === 'totalTrackCount' &&
      value !== null &&
      value < collection.trackIds.length
    )
      invalid();
  }
  for (const field of remove) delete next.overrides[field];
  if (owns(intent, 'leadTrackId')) {
    if (intent.leadTrackId === null) delete next.leadTrackId;
    else {
      if (!collection.trackIds.includes(intent.leadTrackId)) invalid();
      next.leadTrackId = intent.leadTrackId;
    }
  }
  const changed = !equal(previous, next);
  if (!collection.source && (changed || options.bindings !== undefined)) {
    next.localMemberBindings = bindings(
      options.bindings ?? previous.localMemberBindings ?? {},
      trackIds(collection.trackIds),
    );
  }
  return updated(collection, previous, next);
}

function observeReleaseInfo(collection, observations) {
  if (collection.kind !== 'album') invalid();
  const patch = observed(observations, collection);
  const previous = currentInfo(collection);
  const next = { ...previous, observed: { ...previous.observed, ...patch } };
  return updated(collection, previous, next);
}

function reconcileReleaseMembership(previous, nextTrackIds, options = {}) {
  const members = trackIds(nextTrackIds);
  const membershipChanged = !equal(previous.trackIds, members);
  const next = { ...previous, trackIds: [...members] };
  if (previous.releaseInfo === undefined) {
    if (!membershipChanged) return previous;
    return previous.kind === 'album'
      ? { ...next, releaseInfo: { ...createReleaseInfo(next), revision: 1 } }
      : next;
  }
  const info = currentInfo(previous);
  const nextInfo = { ...info };
  if (info.leadTrackId !== undefined && !members.includes(info.leadTrackId))
    delete nextInfo.leadTrackId;
  if (
    info.localMemberBindings !== undefined ||
    options.bindings !== undefined
  ) {
    const retained = Object.fromEntries(
      members
        .filter((id) => owns(info.localMemberBindings ?? {}, id))
        .map((id) => [id, info.localMemberBindings[id]]),
    );
    nextInfo.localMemberBindings = bindings(
      options.bindings ?? retained,
      members,
      previous.source,
    );
  }
  if (!membershipChanged && equal(info, nextInfo)) return previous;
  return {
    ...next,
    releaseInfo: { ...nextInfo, revision: nextRevision(info.revision) },
  };
}

module.exports = {
  createReleaseInfo,
  observeReleaseInfo,
  reconcileReleaseMembership,
  resolveReleaseInfo,
  updateReleaseInfo,
  validateReleaseInfo,
};
