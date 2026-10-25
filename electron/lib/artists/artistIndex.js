'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeForCompare } = require('../musicIdentity/text');
const { resolveTrackDir } = require('../library/paths');
const { extractPerformerCredits } = require('../ytdlpInfo');
const { VIDEO_ID_RE } = require('../youtube');
const {
  applyArtistCatalog,
  creditIdForKey,
  emptyOrganization,
  loadArtistOrganization,
  mergeArtistOrganizations,
  setArtistDisplayName,
  splitArtistOrganization,
  undoArtistOrganization,
} = require('./artistOrganization');
const {
  isArtistPhotoRemoved,
  listArtistPhotoUrls,
  promoteArtistPhotoState,
} = require('./artistPhotos');
const { isChannelId, isTopicChannelName } = require('./channelAvatar');

const READ_CONCURRENCY = 8;
const MAX_PHOTO_SEARCH_RECORDINGS = 3;

function creditKey(part) {
  return (
    normalizeForCompare(part) ||
    part.normalize('NFKC').trim().toLocaleLowerCase()
  );
}

function artistIdForKey(key) {
  return `artist-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}

// Sidecar parts are trusted only while they still reproduce the stored scalar;
// a manual or legacy artist value stays one credit instead of being re-split.
function creditPartsFor(track, sidecarParts) {
  const artist = typeof track.artist === 'string' ? track.artist.trim() : '';
  if (!artist) return [];
  if (sidecarParts?.length && sidecarParts.join(', ') === artist) {
    return sidecarParts;
  }
  return [artist];
}

function mostFrequentForm(forms) {
  let name = '';
  let best = 0;
  for (const [form, count] of forms) {
    if (count > best) {
      name = form;
      best = count;
    }
  }
  return name;
}

// Tier A grouping from ADR 0022: identical provider-neutral keys share one
// derived artist. Persisted organization then links those credit keys to one
// stable entity without rewriting any track's scalar artist credit.
function buildArtistIndex(
  tracks,
  sidecarPartsByTrackId = new Map(),
  organization = emptyOrganization(),
) {
  const groups = new Map();
  const derivedTrackArtistIds = {};

  for (const track of Array.isArray(tracks) ? tracks : []) {
    if (!track?.id) continue;
    const parts = creditPartsFor(track, sidecarPartsByTrackId.get(track.id));
    const ids = [];
    for (const part of parts) {
      const key = creditKey(part);
      if (!key) continue;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          id: artistIdForKey(key),
          forms: new Map(),
          trackIds: [],
        };
        groups.set(key, group);
      }
      group.forms.set(part, (group.forms.get(part) || 0) + 1);
      if (!ids.includes(group.id)) {
        ids.push(group.id);
        group.trackIds.push(track.id);
      }
    }
    if (ids.length > 0) derivedTrackArtistIds[track.id] = ids;
  }

  const entityByCreditKey = new Map();
  for (const entity of organization?.artists ?? []) {
    for (const credit of entity.credits ?? []) {
      if (!entityByCreditKey.has(credit.key)) {
        entityByCreditKey.set(credit.key, entity);
      }
    }
  }

  const projectedGroups = new Map();
  const derivedIdTargets = new Map();
  const artistRedirects = Object.fromEntries(
    (organization?.redirects ?? [])
      .filter(
        (entry) =>
          typeof entry?.from === 'string' && typeof entry?.to === 'string',
      )
      .map((entry) => [entry.from, entry.to]),
  );
  for (const group of groups.values()) {
    const entity = entityByCreditKey.get(group.key);
    const targetId = entity?.id ?? group.id;
    derivedIdTargets.set(group.id, targetId);
    if (targetId !== group.id) artistRedirects[group.id] = targetId;
    let projected = projectedGroups.get(targetId);
    if (!projected) {
      projected = {
        id: targetId,
        entity,
        forms: new Map(),
        trackIds: [],
        credits: [],
        sourceArtistIds: [],
      };
      projectedGroups.set(targetId, projected);
    }
    for (const [form, count] of group.forms) {
      projected.forms.set(form, (projected.forms.get(form) || 0) + count);
    }
    for (const trackId of group.trackIds) {
      if (!projected.trackIds.includes(trackId))
        projected.trackIds.push(trackId);
    }
    const storedCredit = entity?.credits?.find(
      (credit) => credit.key === group.key,
    );
    projected.credits.push({
      id: storedCredit?.id ?? creditIdForKey(group.key),
      name: mostFrequentForm(group.forms),
      trackCount: group.trackIds.length,
    });
    projected.sourceArtistIds.push(group.id);
  }

  const artists = [...projectedGroups.values()].map((group) => ({
    id: group.id,
    name:
      group.entity?.displayNameOverride ||
      group.entity?.catalog?.name ||
      mostFrequentForm(group.forms),
    identityResolved: Boolean(group.entity?.catalog?.mbid),
    trackIds: group.trackIds,
    credits: group.credits,
    sourceArtistIds: group.sourceArtistIds,
  }));
  const trackArtistIds = Object.fromEntries(
    Object.entries(derivedTrackArtistIds).map(([trackId, ids]) => [
      trackId,
      [...new Set(ids.map((id) => derivedIdTargets.get(id) ?? id))],
    ]),
  );
  return {
    artists,
    trackArtistIds,
    artistRedirects,
    organizationRevision: organization?.revision ?? 0,
    canUndoOrganization: Boolean(organization?.history?.length),
  };
}

// Performer parts plus the uploading channel, which photo resolution uses.
async function readSidecarTrackFacts(dir, trackId) {
  const trackDir = resolveTrackDir(dir, trackId);
  if (!trackDir) return null;
  try {
    const info = JSON.parse(
      await fs.readFile(path.join(trackDir, 'info.json'), 'utf8'),
    );
    if (!info || typeof info !== 'object') return null;
    return {
      parts: extractPerformerCredits(info),
      videoId:
        typeof info.id === 'string' && VIDEO_ID_RE.test(info.id)
          ? info.id
          : null,
      channelId: isChannelId(info.channel_id) ? info.channel_id : null,
      channelName: typeof info.channel === 'string' ? info.channel : '',
    };
  } catch {
    return null;
  }
}

// An artist's photo channel is the majority non-Topic channel among tracks
// where the artist is the first credited part (ADR 0022).
function photoChannelFor(artistId, index, factsByTrackId) {
  const firstCreditTrackIds = Object.entries(index.trackArtistIds)
    .filter(([, ids]) => ids[0] === artistId)
    .map(([trackId]) => trackId);
  const counts = new Map();
  for (const trackId of firstCreditTrackIds) {
    const facts = factsByTrackId.get(trackId);
    if (!facts?.channelId || isTopicChannelName(facts.channelName)) continue;
    counts.set(facts.channelId, (counts.get(facts.channelId) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [channelId, count] of counts) {
    if (count > bestCount) {
      best = channelId;
      bestCount = count;
    }
  }
  return best && bestCount * 2 >= firstCreditTrackIds.length ? best : null;
}

async function readSidecarTrackStamp(dir, trackId) {
  const trackDir = resolveTrackDir(dir, trackId);
  if (!trackDir) return 'missing';
  try {
    const stat = await fs.stat(path.join(trackDir, 'info.json'), {
      bigint: true,
    });
    return `${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
  } catch {
    return 'missing';
  }
}

// Stat sidecars without parsing unchanged files. A missing sidecar can arrive
// after the first library projection without changing the artist scalar.
function createArtistIndexCache({
  readFacts = readSidecarTrackFacts,
  readStamp = readSidecarTrackStamp,
  listPhotoUrls = listArtistPhotoUrls,
  loadOrganization = loadArtistOrganization,
  isPhotoRemoved = isArtistPhotoRemoved,
  promotePhotoState = promoteArtistPhotoState,
} = {}) {
  let cachedDir = null;
  let factsByCacheKey = new Map();

  async function loadFacts(dir, tracks, options = {}) {
    if (dir !== cachedDir) {
      cachedDir = dir;
      factsByCacheKey = new Map();
    }
    // Keep this read attached to its library even if another caller switches
    // directories while the asynchronous filesystem work is pending.
    const cache = factsByCacheKey;
    const list = Array.isArray(tracks) ? tracks : [];
    const factsByTrackId = new Map();
    const live = new Set();
    for (let start = 0; start < list.length; start += READ_CONCURRENCY) {
      await Promise.all(
        list.slice(start, start + READ_CONCURRENCY).map(async (track) => {
          if (!track?.id || !track.artist) return;
          const stamp = await readStamp(dir, track.id);
          const key = `${track.id}\u0000${track.artist}\u0000${stamp}`;
          live.add(key);
          if (options.fresh === true || !cache.has(key)) {
            cache.set(key, await readFacts(dir, track.id));
          }
          factsByTrackId.set(track.id, cache.get(key));
        }),
      );
    }
    for (const key of cache.keys()) {
      if (!live.has(key)) cache.delete(key);
    }
    const index = buildArtistIndex(
      list,
      new Map(
        [...factsByTrackId].map(([trackId, facts]) => [trackId, facts?.parts]),
      ),
      loadOrganization(dir),
    );
    return { index, factsByTrackId };
  }

  async function getIndex(dir, tracks) {
    const { index } = await loadFacts(dir, tracks);
    const photoUrls = listPhotoUrls(dir);
    return {
      ...index,
      artists: index.artists.map(({ sourceArtistIds, ...artist }) => {
        const legacyPhotoUrl = isPhotoRemoved(dir, artist.id)
          ? ''
          : (sourceArtistIds
              .map((sourceId) => photoUrls.get(sourceId))
              .find(Boolean) ?? '');
        return {
          ...artist,
          photoUrl: photoUrls.get(artist.id) ?? legacyPhotoUrl,
        };
      }),
    };
  }

  async function getPhotoChannel(dir, tracks, artistId) {
    const { index, factsByTrackId } = await loadFacts(dir, tracks);
    if (!index.artists.some((artist) => artist.id === artistId)) return null;
    return photoChannelFor(artistId, index, factsByTrackId);
  }

  async function getPhotoSearchContext(dir, tracks, artistId, options = {}) {
    const { index, factsByTrackId } = await loadFacts(dir, tracks, options);
    const artist = index.artists.find((entry) => entry.id === artistId);
    if (!artist) return null;
    const recordings = [];
    for (const trackId of artist.trackIds) {
      const facts = factsByTrackId.get(trackId);
      if (!facts?.videoId) continue;
      recordings.push({
        videoId: facts.videoId,
        channelId:
          index.trackArtistIds[trackId]?.[0] === artistId
            ? (facts.channelId ?? null)
            : null,
      });
      if (recordings.length >= MAX_PHOTO_SEARCH_RECORDINGS) break;
    }
    return { artistName: artist.name, recordings };
  }

  async function mergeArtists(dir, tracks, artistIds, options = {}) {
    const { index } = await loadFacts(dir, tracks);
    const sourceArtistIds = [
      ...new Set(
        index.artists
          .filter((artist) => artistIds.includes(artist.id))
          .flatMap((artist) => [artist.id, ...artist.sourceArtistIds]),
      ),
    ];
    const result = mergeArtistOrganizations(dir, index, artistIds, options);
    if (result.status === 'ok' && result.artistId) {
      promotePhotoState(dir, sourceArtistIds, result.artistId);
    }
    return result;
  }

  async function splitArtistCredit(
    dir,
    tracks,
    artistId,
    creditId,
    options = {},
  ) {
    const { index } = await loadFacts(dir, tracks);
    return splitArtistOrganization(dir, index, artistId, creditId, options);
  }

  async function setDisplayName(
    dir,
    tracks,
    artistId,
    displayName,
    options = {},
  ) {
    const { index } = await loadFacts(dir, tracks);
    const current = index.artists.find((artist) => artist.id === artistId);
    const result = setArtistDisplayName(
      dir,
      index,
      artistId,
      displayName,
      options,
    );
    if (result.status === 'ok' && result.artistId) {
      promotePhotoState(
        dir,
        current ? [current.id, ...current.sourceArtistIds] : [],
        result.artistId,
      );
    }
    return result;
  }

  async function applyCatalog(dir, tracks, artistId, catalog, options = {}) {
    const { index } = await loadFacts(dir, tracks);
    const current = index.artists.find((artist) => artist.id === artistId);
    const result = applyArtistCatalog(dir, index, artistId, catalog, options);
    if (result.status === 'ok' && result.artistId) {
      promotePhotoState(
        dir,
        current ? [current.id, ...current.sourceArtistIds] : [],
        result.artistId,
      );
    }
    return result;
  }

  function undoOrganization(dir, options = {}) {
    return undoArtistOrganization(dir, options);
  }

  return {
    getIndex,
    getPhotoChannel,
    getPhotoSearchContext,
    applyCatalog,
    mergeArtists,
    setDisplayName,
    splitArtistCredit,
    undoOrganization,
  };
}

module.exports = {
  buildArtistIndex,
  createArtistIndexCache,
  readSidecarTrackFacts,
};
