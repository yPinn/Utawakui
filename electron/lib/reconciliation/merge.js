'use strict';

const { failure, record } = require('./documents');
const {
  resolveReleaseInfo,
  validateReleaseInfo,
} = require('../releases/schema');

const MERGE_FIELDS = ['name', 'description', 'type', 'date', 'totalTrackCount'];
function chooseSurvivor(left, right) {
  return !left.source
    ? [left, right]
    : !right.source
      ? [right, left]
      : [left, right];
}
function mergedCollection(kept, retired, choices = {}) {
  record(choices, MERGE_FIELDS);
  for (const value of Object.values(choices))
    if (!['keep', 'other'].includes(value)) throw failure();
  const source = kept.releaseInfo?.catalog ? kept : retired;
  if (!source.releaseInfo?.catalog) throw failure();
  const sourceInfo = source.releaseInfo;
  const info = {
    revision:
      Math.max(
        kept.releaseInfo?.revision ?? 0,
        retired.releaseInfo?.revision ?? 0,
      ) + 1,
    observed: structuredClone(sourceInfo.observed),
    overrides: {
      ...retired.releaseInfo?.overrides,
      ...kept.releaseInfo?.overrides,
    },
    catalog: structuredClone(sourceInfo.catalog),
  };
  for (const field of ['type', 'date', 'totalTrackCount'])
    if (Object.hasOwn(choices, field))
      info.overrides[field] = structuredClone(
        resolveReleaseInfo(choices[field] === 'other' ? retired : kept)[field],
      );
  const lead =
    kept.releaseInfo?.leadTrackId ?? retired.releaseInfo?.leadTrackId;
  if (lead) info.leadTrackId = lead;
  const merged = {
    ...retired,
    ...kept,
    name: choices.name === 'other' ? retired.name : kept.name,
    description:
      (choices.description === 'other'
        ? retired.description
        : kept.description) ?? '',
    source: { ...source.source },
    trackIds: [...source.trackIds],
    addedAt: { ...retired.addedAt, ...kept.addedAt },
    releaseInfo: info,
  };
  // Existing local artwork is authoritative; retiring assets stay available to
  // undo, and are never deleted by this operation.
  if (!kept.coverImage) delete merged.coverImage;
  delete merged.redirectedIds;
  validateReleaseInfo(info, merged);
  return merged;
}
function mergeFields(kept, retired, merged) {
  const left = resolveReleaseInfo(kept),
    right = resolveReleaseInfo(retired),
    result = resolveReleaseInfo(merged);
  return MERGE_FIELDS.map((field) => ({
    field,
    kept: ['name', 'description'].includes(field)
      ? (kept[field] ?? '')
      : left[field],
    other: ['name', 'description'].includes(field)
      ? (retired[field] ?? '')
      : right[field],
    proposed: ['name', 'description'].includes(field)
      ? merged[field]
      : result[field],
  }));
}
function mergeFolderDocument(document, keptId, retiredId) {
  if (document.raw === null) return { raw: null, moved: 0 };
  const data = document.data;
  if (data.version !== 4 || !Array.isArray(data.objects))
    throw failure('RECONCILIATION_ASSET_CONFLICT');
  const isPage = (object, id) =>
    object.page?.kind === 'album' && object.page.id === id;
  const kept = data.objects.filter((o) => isPage(o, keptId));
  const retired = data.objects.filter((o) => isPage(o, retiredId));
  if (!retired.length) return { raw: document.raw, moved: 0 };
  const keys = new Set(kept.map((o) => o.key));
  const moving = [];
  for (const object of retired) {
    if (keys.has(object.key)) {
      if (object.source === 'user')
        throw failure('RECONCILIATION_ASSET_CONFLICT');
      continue;
    }
    keys.add(object.key);
    moving.push(object);
  }
  if ([...kept, ...moving].filter((o) => o.source === 'user').length > 12)
    throw failure('RECONCILIATION_ASSET_LIMIT');
  const ordered = [...kept, ...moving].map((o, index) => ({
    ...o,
    page: { kind: 'album', id: keptId },
    order: index + 1,
  }));
  const objects = [
    ...data.objects.filter((o) => !isPage(o, keptId) && !isPage(o, retiredId)),
    ...ordered,
  ];
  return {
    raw: JSON.stringify({ ...data, objects }, null, 2),
    moved: moving.length,
  };
}

module.exports = {
  mergedCollection,
  chooseSurvivor,
  mergeFields,
  mergeFolderDocument,
};
