'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseFile } = require('music-metadata');
const { AUDIO_EXTENSIONS } = require('../library/constants');
const {
  isBoundedTrackId,
  isStructuredAudioFilename,
  trackIdFromFilename,
} = require('../library/paths');
const { loadCatalogCollections } = require('../playlists');
const {
  validateTrackBinding,
  hashAudioFile,
  bindingsEqual,
} = require('../works/trackBinding');
const { slotIdentity } = require('../releases/catalog');
const { resolveReleaseInfo } = require('../releases/schema');
const { hasControlCharacters } = require('../textGuards');
const { readTrackInfoMaintenanceFields } = require('../downloader');
const { failure, readSnapshot, digest } = require('./documents');
const { METADATA_FIELDS, validDate } = require('./metadata');

function cancelled(signal) {
  if (signal?.aborted) throw failure('RECONCILIATION_CANCELLED');
}
function stamp(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
}
function discoverAudio(dir) {
  const result = new Map();
  const add = (id, file) => {
    if (
      !isBoundedTrackId(id) ||
      ['__proto__', 'prototype', 'constructor'].includes(id)
    )
      throw failure('RECONCILIATION_UNAVAILABLE');
    if (result.has(id)) throw failure('RECONCILIATION_AMBIGUOUS_AUDIO');
    result.set(id, file);
  };
  const list = (root) => {
    try {
      return fs.readdirSync(root, { withFileTypes: true });
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  };
  for (const folder of list(path.join(dir, 'tracks'))) {
    if (!folder.isDirectory() || !isBoundedTrackId(folder.name)) continue;
    const files = list(path.join(dir, 'tracks', folder.name)).filter(
      (e) => e.isFile() && isStructuredAudioFilename(e.name),
    );
    if (files.length > 1) throw failure('RECONCILIATION_AMBIGUOUS_AUDIO');
    if (files.length)
      add(folder.name, path.join(dir, 'tracks', folder.name, files[0].name));
  }
  for (const file of list(dir))
    if (
      file.isFile() &&
      AUDIO_EXTENSIONS.has(path.extname(file.name).toLowerCase())
    ) {
      const id = trackIdFromFilename(file.name);
      if (!result.has(id)) add(id, path.join(dir, file.name));
    }
  return result;
}
async function inspectAudio(file, root, signal) {
  cancelled(signal);
  const realRoot = fs.realpathSync(root),
    realFile = fs.realpathSync(file);
  const relative = path.relative(realRoot, realFile);
  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    fs.lstatSync(file).isSymbolicLink()
  )
    throw failure('RECONCILIATION_UNAVAILABLE');
  const before = stamp(fs.statSync(file));
  const binding = validateTrackBinding(await hashAudioFile(file));
  cancelled(signal);
  if (before !== stamp(fs.statSync(file)))
    throw failure('RECONCILIATION_CONFLICT');
  return { status: 'present', binding, stamp: before };
}
async function readFileTags(file) {
  const { common } = await parseFile(file, {
    skipCovers: true,
    duration: false,
  });
  const values = {
    title: common.title,
    artist: common.artist,
    album: common.album,
    albumArtist: common.albumartist,
    releaseYear: common.year,
    trackNumber: common.track?.no,
    trackTotal: common.track?.of,
    discNumber: common.disk?.no,
    discTotal: common.disk?.of,
  };
  if (typeof common.date === 'string' && validDate(common.date))
    values.releaseDate = common.date;
  return cleanMetadata(values);
}
function cleanMetadata(values) {
  return Object.fromEntries(
    METADATA_FIELDS.filter((field) => {
      const value = values[field];
      return typeof value === 'string'
        ? value.length <= 200 &&
            !hasControlCharacters(value) &&
            (field !== 'releaseDate' || !value || validDate(value))
        : Number.isSafeInteger(value) &&
            value > 0 &&
            value <= (field === 'releaseYear' ? 9999 : 5000);
    }).map((field) => [field, values[field]]),
  );
}
function sourceIdentity(collection) {
  const source = collection.source;
  if (!source) return null;
  return JSON.stringify([
    ['youtube', 'yt-music'].includes(source.platform)
      ? 'youtube'
      : source.platform,
    source.id,
  ]);
}
function acceptedBinding(collection, id) {
  return (
    collection.releaseInfo?.catalog?.bindings[id] ??
    collection.releaseInfo?.localMemberBindings?.[id] ??
    null
  );
}
function verified(collection, media) {
  return (
    collection.trackIds.length > 0 &&
    collection.trackIds.every((id) => {
      const saved = acceptedBinding(collection, id),
        fresh = media.get(id);
      return (
        saved &&
        fresh?.status === 'present' &&
        bindingsEqual(saved, fresh.binding)
      );
    })
  );
}
function completePositions(collection) {
  const catalog = collection.releaseInfo?.catalog;
  return (
    catalog?.manifest.completeness === 'complete' &&
    catalog.manifest.reportedTotal === catalog.manifest.slots.length &&
    catalog.manifest.slots.length === collection.trackIds.length &&
    catalog.manifest.slots.every((slot) => {
      const link = catalog.links[`slot-${slot.position}`];
      return (
        link &&
        link.slotIdentity === slotIdentity(slot) &&
        !catalog.rejected.includes(link.trackId)
      );
    }) &&
    new Set(Object.values(catalog.links).map((link) => link.trackId)).size ===
      collection.trackIds.length
  );
}
function classifyReleasePairs(collections, media) {
  const albums = collections.filter((e) => e.kind === 'album');
  const pairs = [];
  for (let i = 0; i < albums.length; i++)
    for (let j = i + 1; j < albums.length; j++) {
      const left = albums[i],
        right = albums[j];
      const sameSource =
        sourceIdentity(left) && sourceIdentity(left) === sourceIdentity(right);
      if (
        !sameSource &&
        !left.trackIds.some((id) => right.trackIds.includes(id))
      )
        continue;
      const sameMembers =
        left.trackIds.length === right.trackIds.length &&
        left.trackIds.every((id) => right.trackIds.includes(id));
      const local = !left.source ? left : !right.source ? right : null;
      const source = left.source ? left : right.source ? right : null;
      const kind = sameSource
        ? 'same-source'
        : local && source
          ? 'local-source'
          : 'different-release';
      const localType = local && resolveReleaseInfo(local).type;
      const sourceType = source?.releaseInfo?.catalog?.manifest.type;
      const positionsMatch = sameSource
        ? completePositions(left) &&
          completePositions(right) &&
          digest(left.releaseInfo.catalog.manifest.slots) ===
            digest(right.releaseInfo.catalog.manifest.slots) &&
          digest(
            Object.entries(left.releaseInfo.catalog.links).sort(([a], [b]) =>
              a.localeCompare(b),
            ),
          ) ===
            digest(
              Object.entries(right.releaseInfo.catalog.links).sort(([a], [b]) =>
                a.localeCompare(b),
              ),
            )
        : Boolean(
            local &&
            source &&
            completePositions(source) &&
            ['single', 'ep', 'album'].includes(localType) &&
            localType === sourceType,
          );
      const mediaVerified = verified(left, media) && verified(right, media);
      const mergeable = Boolean(
        kind !== 'different-release' &&
        sameMembers &&
        positionsMatch &&
        mediaVerified,
      );
      pairs.push({
        leftId: left.id,
        rightId: right.id,
        kind,
        mergeable,
        reason: mergeable
          ? 'verified-release-members'
          : !mediaVerified
            ? 'unverified-media'
            : kind === 'different-release'
              ? 'different-source'
              : !sameMembers || !positionsMatch
                ? 'different-tracklist'
                : 'needs-review',
        evidence: digest(
          [left, right]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((collection) => {
              const resolved = resolveReleaseInfo(collection),
                catalog = collection.releaseInfo?.catalog;
              return {
                id: collection.id,
                source: sourceIdentity(collection),
                name: collection.name,
                description: collection.description ?? '',
                coverImage: collection.coverImage ?? null,
                trackIds: collection.trackIds,
                type: resolved.type,
                date: resolved.date,
                totalTrackCount: resolved.totalTrackCount,
                overrides: Object.entries(
                  collection.releaseInfo?.overrides ?? {},
                ).sort(([a], [b]) => a.localeCompare(b)),
                leadTrackId: collection.releaseInfo?.leadTrackId ?? null,
                manifest: catalog
                  ? { ...catalog.manifest, artworkUrl: undefined }
                  : null,
                links: Object.entries(catalog?.links ?? {}).sort(([a], [b]) =>
                  a.localeCompare(b),
                ),
                rejected: [...(catalog?.rejected ?? [])].sort(),
                media: collection.trackIds.map(
                  (id) => media.get(id)?.binding ?? null,
                ),
              };
            }),
        ),
      });
    }
  return pairs;
}

async function scanLibrary(
  dir,
  {
    signal,
    readTags = readFileTags,
    onProgress = () => {},
    inspect = inspectAudio,
  } = {},
) {
  cancelled(signal);
  const documents = readSnapshot(dir);
  const collections = loadCatalogCollections(dir);
  const audio = discoverAudio(dir);
  const ids = [
    ...new Set([
      ...audio.keys(),
      ...Object.keys(documents.index.data.tracks),
      ...collections.flatMap((c) => c.trackIds),
    ]),
  ].sort();
  const tracks = [],
    media = new Map(),
    issues = [];
  for (const id of ids) {
    cancelled(signal);
    const file = audio.get(id);
    let inspection = { status: 'missing' },
      tags = {},
      tagStatus = 'missing';
    if (file) {
      inspection = await inspect(file, dir, signal);
      cancelled(signal);
      try {
        tags = cleanMetadata(await readTags(file));
        tagStatus = 'read';
      } catch {
        tagStatus = 'unavailable';
      }
      cancelled(signal);
      if (inspection.stamp && inspection.stamp !== stamp(fs.statSync(file)))
        throw failure('RECONCILIATION_CONFLICT');
    }
    media.set(id, inspection);
    const entry = documents.index.data.tracks[id] ?? {};
    const provider =
      file && path.dirname(file) !== dir
        ? (readTrackInfoMaintenanceFields(path.dirname(file))?.normalized ?? {})
        : {};
    const providerValues = cleanMetadata(provider);
    const observed = { ...tags, ...providerValues };
    const changedFields = METADATA_FIELDS.filter(
      (field) =>
        Object.hasOwn(observed, field) &&
        (entry[field] ?? null) !== observed[field],
    );
    const title = entry.title || tags.title || id;
    tracks.push({
      id,
      title,
      artist: entry.artist || tags.artist || '',
      status: inspection.status,
      tagStatus,
      tags,
      observed,
      providerValues,
      entry,
      file,
      media: inspection,
    });
    if (!file) issues.push({ kind: 'missing-file', trackIds: [id], title });
    else if (changedFields.length)
      issues.push({
        kind: 'metadata-difference',
        trackIds: [id],
        title,
        fields: changedFields,
      });
    if (file && tagStatus === 'unavailable')
      issues.push({ kind: 'tags-unavailable', trackIds: [id], title });
    if (
      file &&
      collections.some(
        (c) =>
          c.trackIds.includes(id) &&
          acceptedBinding(c, id) &&
          !bindingsEqual(acceptedBinding(c, id), inspection.binding),
      )
    )
      issues.push({ kind: 'changed-file', trackIds: [id], title });
    onProgress({ completed: tracks.length, total: ids.length });
  }
  const byHash = new Map();
  for (const track of tracks)
    if (track.media.binding) {
      const key = track.media.binding.value;
      if (!byHash.has(key)) byHash.set(key, []);
      byHash.get(key).push(track.id);
    }
  for (const duplicates of byHash.values())
    if (duplicates.length > 1)
      issues.push({
        kind: 'duplicate-file',
        trackIds: duplicates,
        title: tracks.find((t) => t.id === duplicates[0]).title,
      });
  const pairs = classifyReleasePairs(collections, media);
  const latest = readSnapshot(dir);
  if (
    latest.playlists.fingerprint !== documents.playlists.fingerprint ||
    latest.index.fingerprint !== documents.index.fingerprint
  )
    throw failure('RECONCILIATION_CONFLICT');
  return { documents, collections, tracks, issues, pairs };
}

module.exports = {
  scanLibrary,
  classifyReleasePairs,
  discoverAudio,
  inspectAudio,
  readFileTags,
  cleanMetadata,
  acceptedBinding,
  sourceIdentity,
  stamp,
};
