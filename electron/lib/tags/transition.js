'use strict';

const { bindingsEqual } = require('../works/trackBinding');
const { resolveReleaseInfo } = require('../releases/schema');
const { slotIdentity } = require('../releases/catalog');
const { failure } = require('../reconciliation/documents');
const binding = (value) => ({ kind: 'audio-content-sha256', value });

function transitionReferences(documents, trackId, before, after) {
  const result = structuredClone(documents);
  if (
    Object.values(result.works?.pendingTrackDeletions ?? {}).some(
      (r) => r.trackId === trackId,
    )
  )
    throw failure('RECONCILIATION_CONFLICT');
  const profile = result.works?.trackProfiles?.[trackId];
  const becomesFresh = (value) =>
    !bindingsEqual(value, binding(before)) &&
    bindingsEqual(value, binding(after));
  if (profile && becomesFresh(profile.binding))
    throw failure('RECONCILIATION_CONFLICT');
  if (profile && bindingsEqual(profile.binding, binding(before))) {
    profile.binding = binding(after);
    result.works.revision++;
  }
  const collections = [
    ...result.playlists.playlists,
    ...(result.playlists.reconciliation?.pendingReleases ?? []),
  ];
  for (const collection of collections) {
    if (!collection.trackIds?.includes(trackId)) continue;
    const info = collection.releaseInfo;
    const owner = info?.catalog?.bindings ?? info?.localMemberBindings;
    if (owner && becomesFresh(owner[trackId]))
      throw failure('RECONCILIATION_CONFLICT');
    if (owner && bindingsEqual(owner[trackId], binding(before))) {
      owner[trackId] = binding(after);
      info.revision++;
    }
  }
  const entry = result.index.tracks[trackId];
  if (!entry) throw failure('RECONCILIATION_CONFLICT');
  entry.contentHash = after;
  return result;
}

function eligibleTagReleases(collections, trackId, hash) {
  const result = [];
  for (const collection of collections) {
    if (collection.kind !== 'album' || !collection.trackIds.includes(trackId))
      continue;
    const info = collection.releaseInfo;
    const saved =
      info?.catalog?.bindings?.[trackId] ??
      info?.localMemberBindings?.[trackId];
    if (!bindingsEqual(saved, binding(hash))) continue;
    const effective = resolveReleaseInfo(collection);
    let positions;
    if (info.catalog) {
      positions = Object.entries(info.catalog.links)
        .filter(([key, link]) => {
          const slot = info.catalog.manifest.slots[Number(key.slice(5)) - 1];
          return (
            link.trackId === trackId &&
            slot &&
            link.slotIdentity === slotIdentity(slot)
          );
        })
        .map(([key]) => Number(key.slice(5)));
    } else positions = [collection.trackIds.indexOf(trackId) + 1];
    for (const position of positions)
      result.push({
        collectionId: collection.id,
        position,
        name: collection.name,
        artist: collection.albumArtist || info.catalog?.manifest.artist || '',
        date: effective.date?.value ?? '',
        total:
          effective.totalTrackCount ??
          (info.catalog?.manifest.completeness === 'complete'
            ? info.catalog.manifest.slots.length
            : null),
      });
  }
  return result;
}
function tagValues(entry, release) {
  const result = {};
  for (const key of ['title', 'artist'])
    if (typeof entry[key] === 'string') result[key] = entry[key];
  if (release) {
    Object.assign(result, {
      album: release.name,
      albumArtist:
        entry.albumArtistOrigin === 'manual'
          ? (entry.albumArtist ?? '')
          : release.artist || entry.albumArtist || '',
      releaseDate: release.date,
      trackNumber: release.position,
    });
    if (release.total) result.trackTotal = release.total;
    // Catalog positions are flat; they do not establish disc membership.
    // Explicit App disc numbers remain user-owned, never inferred as disc 1.
    for (const key of ['discNumber', 'discTotal'])
      if (Number.isSafeInteger(entry[key]) && entry[key] > 0)
        result[key] = entry[key];
  }
  return result;
}
module.exports = { transitionReferences, eligibleTagReleases, tagValues };
