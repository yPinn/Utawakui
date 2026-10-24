'use strict';

const { createHash } = require('node:crypto');
const { isBoundedTrackId } = require('../library/paths');
const { validateTrackBinding } = require('../works/trackBinding');
const { hasControlCharacters } = require('../textGuards');
const { isReleaseArtworkUrl } = require('./artwork');
const VIDEO = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST = /^OLAK5uy_[A-Za-z0-9_-]{1,120}$/;
const BROWSE = /^MPRE[A-Za-z0-9_-]{1,120}$/;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function invalid() {
  throw Object.assign(new Error('Invalid release catalog.'), {
    code: 'RELEASE_CATALOG_INVALID',
  });
}
function record(value, fields) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some(
      (key) => forbidden.has(key) || (fields && !fields.includes(key)),
    )
  )
    invalid();
}
function text(value, limit = 200) {
  if (
    typeof value !== 'string' ||
    value.length > limit ||
    hasControlCharacters(value)
  )
    invalid();
  return value;
}
function localId(value) {
  if (!isBoundedTrackId(value) || forbidden.has(value)) invalid();
  return value;
}
function slotKey(position) {
  return `slot-${position}`;
}
function slotIdentity(slot) {
  return JSON.stringify([slot.videoId, slot.title, slot.artist]);
}
function catalogMemberMatches(collection, trackId) {
  const catalog = collection.releaseInfo?.catalog;
  if (!catalog) return true;
  const links = Object.entries(catalog.links).filter(
    ([, link]) => link.trackId === trackId,
  );
  return (
    !links.length ||
    links.some(([key, link]) => {
      const slot = catalog.manifest.slots[Number(key.slice(5)) - 1];
      return slot && link.slotIdentity === slotIdentity(slot);
    })
  );
}
function validateManifest(value) {
  record(value, [
    'playlistId',
    'browseId',
    'title',
    'artist',
    'type',
    'year',
    'reportedTotal',
    'completeness',
    'slots',
    'artworkUrl',
  ]);
  if (
    !PLAYLIST.test(value.playlistId) ||
    !BROWSE.test(value.browseId) ||
    !text(value.title) ||
    !['unknown', 'single', 'ep', 'album'].includes(value.type) ||
    (value.year !== null &&
      (typeof value.year !== 'string' ||
        !/^[1-9][0-9]{3}$/.test(value.year))) ||
    !['complete', 'partial'].includes(value.completeness)
  )
    invalid();
  text(value.artist);
  if (
    value.artworkUrl !== undefined &&
    value.artworkUrl !== null &&
    !isReleaseArtworkUrl(value.artworkUrl)
  )
    invalid();
  if (
    value.reportedTotal !== null &&
    (!Number.isSafeInteger(value.reportedTotal) ||
      value.reportedTotal < 1 ||
      value.reportedTotal > 5000)
  )
    invalid();
  if (
    !Array.isArray(value.slots) ||
    !value.slots.length ||
    value.slots.length > 5000 ||
    (value.completeness === 'complete' &&
      value.reportedTotal !== value.slots.length)
  )
    invalid();
  const slots = value.slots.map((slot, index) => {
    record(slot, [
      'position',
      'videoId',
      'title',
      'artist',
      'duration',
      'available',
    ]);
    if (
      slot.position !== index + 1 ||
      (slot.videoId !== null &&
        (typeof slot.videoId !== 'string' || !VIDEO.test(slot.videoId))) ||
      typeof slot.available !== 'boolean' ||
      (slot.available && slot.videoId === null) ||
      (slot.duration !== null &&
        (!Number.isFinite(slot.duration) ||
          slot.duration <= 0 ||
          slot.duration >= 86400))
    )
      invalid();
    return {
      position: slot.position,
      videoId: slot.videoId,
      title: text(slot.title),
      artist: text(slot.artist),
      duration: slot.duration,
      available: slot.available,
    };
  });
  return { ...value, slots };
}
function validateCatalog(value, collection) {
  record(value, ['manifest', 'links', 'bindings', 'rejected', 'fetchedAt']);
  const manifest = validateManifest(value.manifest);
  if (
    !['youtube', 'yt-music'].includes(collection.source?.platform) ||
    collection.source.id !== manifest.playlistId ||
    !Number.isFinite(Date.parse(text(value.fetchedAt, 40)))
  )
    invalid();
  record(value.links);
  record(value.bindings);
  const members = new Set(collection.trackIds);
  const bindings = {};
  for (const [id, binding] of Object.entries(value.bindings)) {
    localId(id);
    if (!members.has(id)) invalid();
    bindings[id] = binding === null ? null : validateTrackBinding(binding);
  }
  const links = {};
  for (const [key, link] of Object.entries(value.links)) {
    if (!/^slot-[1-9][0-9]{0,3}$/.test(key) || Number(key.slice(5)) > 5000)
      invalid();
    record(link, ['trackId', 'evidence', 'slotIdentity']);
    if (
      !members.has(localId(link.trackId)) ||
      !['exact-source', 'manual'].includes(link.evidence)
    )
      invalid();
    links[key] = {
      trackId: link.trackId,
      evidence: link.evidence,
      slotIdentity: text(link.slotIdentity, 1000),
    };
  }
  if (
    Object.keys(links).length > 5000 ||
    !Array.isArray(value.rejected) ||
    value.rejected.length > 5000 ||
    new Set(value.rejected).size !== value.rejected.length
  )
    invalid();
  value.rejected.forEach(localId);
  return {
    manifest,
    links,
    bindings,
    rejected: [...value.rejected],
    fetchedAt: value.fetchedAt,
  };
}

// Pure reconciliation. Network, scope, private binding acquisition and CAS
// remain in the Main coordinator. Existing accepted bindings never rebind here.
function reconcileCatalog(collection, input, localBindings, fetchedAt) {
  let manifest = validateManifest(input);
  if (
    collection.source?.id !== manifest.playlistId ||
    !['youtube', 'yt-music'].includes(collection.source?.platform)
  )
    invalid();
  const info = collection.releaseInfo ?? {
    revision: 0,
    observed: {},
    overrides: {},
  };
  const previous = info.catalog;
  if (
    previous?.manifest.completeness === 'complete' &&
    manifest.completeness !== 'complete'
  ) {
    manifest = previous.manifest;
    fetchedAt = previous.fetchedAt;
  }
  const rejected = [...(previous?.rejected ?? [])];
  const links = { ...(previous?.links ?? {}) };
  const bindings = { ...(previous?.bindings ?? {}) };
  const ids = new Set(collection.trackIds);
  for (const [id, binding] of Object.entries(localBindings)) {
    localId(id);
    if (binding !== null) validateTrackBinding(binding);
    if (ids.has(id) && !bindings[id]) bindings[id] = binding;
  }
  for (const slot of manifest.slots) {
    const id = slot.videoId;
    if (
      !id ||
      !slot.available ||
      rejected.includes(id) ||
      links[slotKey(slot.position)] ||
      !localBindings[id]
    )
      continue;
    ids.add(id);
    if (!bindings[id]) bindings[id] = localBindings[id];
    links[slotKey(slot.position)] = {
      trackId: id,
      evidence: 'exact-source',
      slotIdentity: slotIdentity(slot),
    };
  }
  const ordered = [
    ...new Set(
      manifest.slots
        .map((slot) => links[slotKey(slot.position)]?.trackId)
        .filter((id) => ids.has(id)),
    ),
  ];
  const trackIds = [
    ...ordered,
    ...[...ids].filter((id) => !ordered.includes(id)),
  ];
  const catalog = { manifest, links, bindings, rejected, fetchedAt };
  if (
    JSON.stringify(catalog) === JSON.stringify(previous) &&
    JSON.stringify(trackIds) === JSON.stringify(collection.trackIds)
  )
    return collection;
  const next = {
    ...collection,
    trackIds,
    addedAt: Object.fromEntries(
      trackIds.map((id) => [id, collection.addedAt?.[id] ?? fetchedAt]),
    ),
    releaseInfo: { ...info, revision: info.revision + 1, catalog },
  };
  validateCatalog(catalog, next);
  return next;
}

function publicCatalogPage(
  collection,
  memberStates,
  { offset = 0, limit = 100, availabilityOnly = false } = {},
  localCandidates = new Set(),
) {
  const catalog = collection.releaseInfo?.catalog;
  if (!catalog) return null;
  const { manifest } = catalog;
  const rows = manifest.slots.map((slot) => {
    const key = slotKey(slot.position);
    const link = catalog.links[key];
    const matches = link?.slotIdentity === slotIdentity(slot);
    const status = link && memberStates.get(link.trackId);
    const localCandidate = localCandidates.has(slot.videoId);
    const state = !link
      ? catalog.rejected.includes(slot.videoId)
        ? 'excluded'
        : localCandidate
          ? 'unlinked'
          : 'not-imported'
      : !matches
        ? 'needs-confirmation'
        : status === 'current'
          ? 'available'
          : status === 'missing'
            ? 'missing'
            : 'needs-confirmation';
    return {
      key,
      position: slot.position,
      title: slot.title,
      artist: slot.artist,
      duration: slot.duration,
      sourceAvailable: slot.available,
      localTrackId: state === 'available' ? link.trackId : null,
      localCandidateTrackId: !link && localCandidate ? slot.videoId : null,
      linkedTrackId: link?.trackId ?? null,
      state,
    };
  });
  const linked = new Set(
    Object.values(catalog.links).map((link) => link.trackId),
  );
  return {
    availabilityOnly,
    structureVersion: createHash('sha256')
      .update(JSON.stringify(manifest))
      .digest('hex'),
    rows: rows.slice(offset, offset + limit).map((row) =>
      availabilityOnly
        ? {
            key: row.key,
            position: row.position,
            state: row.state,
            localTrackId: row.localTrackId,
            localCandidateTrackId: row.localCandidateTrackId,
            linkedTrackId: row.linkedTrackId,
          }
        : row,
    ),
    detachedLinks: Object.entries(catalog.links)
      .filter(([key]) => Number(key.slice(5)) > manifest.slots.length)
      .map(([key, link]) => ({
        key,
        linkedTrackId: link.trackId,
        position: Number(key.slice(5)),
      })),
    unmatchedTrackIds: collection.trackIds.filter(
      (id) => !linked.has(id) && memberStates.get(id) === 'current',
    ),
    availableCount: rows.filter((row) => row.state === 'available').length,
    totalTrackCount:
      manifest.completeness === 'complete' ? manifest.reportedTotal : null,
    slotCount: rows.length,
    completeness: manifest.completeness,
    fetchedAt: catalog.fetchedAt,
    hasMore: offset + limit < rows.length,
    nextOffset: offset + limit < rows.length ? offset + limit : null,
  };
}

module.exports = {
  validateManifest,
  validateCatalog,
  reconcileCatalog,
  slotKey,
  slotIdentity,
  catalogMemberMatches,
  publicCatalogPage,
};
