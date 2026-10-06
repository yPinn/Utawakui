'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeForCompare } = require('../musicIdentity/text');
const { resolveTrackDir } = require('../library/paths');
const { extractPerformerCredits } = require('../ytdlpInfo');
const { listArtistPhotoUrls } = require('./artistPhotos');
const { isChannelId, isTopicChannelName } = require('./channelAvatar');

const READ_CONCURRENCY = 8;

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

// Tier A grouping from ADR 0022: identical provider-neutral keys share one
// artist. The display name is the most frequent credited form.
function buildArtistIndex(tracks, sidecarPartsByTrackId = new Map()) {
  const groups = new Map();
  const trackArtistIds = {};

  for (const track of Array.isArray(tracks) ? tracks : []) {
    if (!track?.id) continue;
    const parts = creditPartsFor(track, sidecarPartsByTrackId.get(track.id));
    const ids = [];
    for (const part of parts) {
      const key = creditKey(part);
      if (!key) continue;
      let group = groups.get(key);
      if (!group) {
        group = { id: artistIdForKey(key), forms: new Map(), trackIds: [] };
        groups.set(key, group);
      }
      group.forms.set(part, (group.forms.get(part) || 0) + 1);
      if (!ids.includes(group.id)) {
        ids.push(group.id);
        group.trackIds.push(track.id);
      }
    }
    if (ids.length > 0) trackArtistIds[track.id] = ids;
  }

  const artists = [...groups.values()].map((group) => {
    let name = '';
    let best = 0;
    for (const [form, count] of group.forms) {
      if (count > best) {
        name = form;
        best = count;
      }
    }
    return { id: group.id, name, trackIds: group.trackIds };
  });
  return { artists, trackArtistIds };
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

// Lazy, in-memory only. Sidecar facts are cached per (track id, artist scalar),
// so a library change re-reads only new or re-credited tracks.
function createArtistIndexCache({
  readFacts = readSidecarTrackFacts,
  listPhotoUrls = listArtistPhotoUrls,
} = {}) {
  let cachedDir = null;
  let factsByCacheKey = new Map();

  async function loadFacts(dir, tracks) {
    if (dir !== cachedDir) {
      cachedDir = dir;
      factsByCacheKey = new Map();
    }
    const list = Array.isArray(tracks) ? tracks : [];
    const cacheKeyFor = (track) => `${track.id}\u0000${track.artist ?? ''}`;
    const missing = list.filter(
      (track) =>
        track?.id && track.artist && !factsByCacheKey.has(cacheKeyFor(track)),
    );
    for (let start = 0; start < missing.length; start += READ_CONCURRENCY) {
      const batch = missing.slice(start, start + READ_CONCURRENCY);
      const results = await Promise.all(
        batch.map((track) => readFacts(dir, track.id)),
      );
      batch.forEach((track, index) => {
        factsByCacheKey.set(cacheKeyFor(track), results[index]);
      });
    }

    const live = new Set(list.map(cacheKeyFor));
    for (const key of factsByCacheKey.keys()) {
      if (!live.has(key)) factsByCacheKey.delete(key);
    }
    const factsByTrackId = new Map(
      list.map((track) => [track.id, factsByCacheKey.get(cacheKeyFor(track))]),
    );
    const index = buildArtistIndex(
      list,
      new Map(
        [...factsByTrackId].map(([trackId, facts]) => [trackId, facts?.parts]),
      ),
    );
    return { index, factsByTrackId };
  }

  async function getIndex(dir, tracks) {
    const { index } = await loadFacts(dir, tracks);
    const photoUrls = listPhotoUrls(dir);
    return {
      ...index,
      artists: index.artists.map((artist) => ({
        ...artist,
        photoUrl: photoUrls.get(artist.id) ?? '',
      })),
    };
  }

  async function getPhotoChannel(dir, tracks, artistId) {
    const { index, factsByTrackId } = await loadFacts(dir, tracks);
    if (!index.artists.some((artist) => artist.id === artistId)) return null;
    return photoChannelFor(artistId, index, factsByTrackId);
  }

  return { getIndex, getPhotoChannel };
}

module.exports = {
  buildArtistIndex,
  createArtistIndexCache,
  readSidecarTrackFacts,
};
