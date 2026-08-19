'use strict';

const youtubedl = require('youtube-dl-exec');
const { identityArtistKeys, splitArtistNames } = require('./trackIdentity');
const {
  extractTitleDerivedSearchParts,
  looksLikeChannelArtist,
  normalizeForCompare,
  normalizeText,
  stripParenthesizedDecorations,
  stripTrackDecorations,
} = require('./musicTitle');
const { applyYoutubeRuntimeOptions } = require('./youtubeAttempts');
const { VIDEO_ID_RE } = require('./youtube');
const { extractMetadataFields } = require('./ytdlpInfo');

const PLAYBACK_SEARCH_LIMIT_PER_SOURCE = 5;
const MAX_PLAYBACK_SEARCH_CANDIDATES = 8;
const MAX_PLAYBACK_SEARCH_QUERIES = 4;
const MAX_CROSS_SEARCH_QUERIES = 2;
const LIVE_OR_MEDLEY_TITLE_RE =
  /(?:\b4k\b|\bfull\s+(?:show|concert|performance)\b|校唱|校園演唱|演唱會|全程|完整(?:版|場)|合集|串燒)/iu;
// No legitimate karaoke song runs this long; ytsearch results routinely
// include "full album"/"1 hour mix" uploads that would otherwise eat a slot.
const MAX_SONG_SEARCH_DURATION = 12 * 60;

function normalizeSearchQuery(value) {
  return stripParenthesizedDecorations(stripTrackDecorations(value))
    .replace(/["'`]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pushUnique(values, value) {
  const normalized = normalizeSearchQuery(value);
  const key = normalizeForCompare(normalized);
  if (!key || values.some((existing) => existing.key === key)) return;
  values.push({ key, value: normalized });
}

function pushUniqueArtistKey(keys, value) {
  const key = normalizeForCompare(value);
  if (!key || key.length < 2 || keys.includes(key)) return;
  keys.push(key);
}

function pushSplitArtistKeys(keys, value) {
  for (const artistName of splitArtistNames(value)) {
    pushUniqueArtistKey(keys, artistName);
  }
  pushUniqueArtistKey(keys, value);
}

function shouldUseSourceTitleParts(canonical = {}) {
  return (
    canonical.sourcePlatform !== 'yt-music' && canonical.sourceType !== 'track'
  );
}

function titlePartsFor(canonical, sourceMetadata) {
  return shouldUseSourceTitleParts(canonical)
    ? extractTitleDerivedSearchParts(sourceMetadata.title)
    : [];
}

function buildExpectedArtistKeys(
  canonical = {},
  sourceMetadata = {},
  titleParts = titlePartsFor(canonical, sourceMetadata),
) {
  const keys = [...new Set(identityArtistKeys(canonical))];
  if (!looksLikeChannelArtist(canonical.artist)) {
    pushSplitArtistKeys(keys, canonical.artist);
  }

  for (const part of titleParts) {
    for (const artistName of part.artistNames || []) {
      pushSplitArtistKeys(keys, artistName);
    }
  }

  if (!looksLikeChannelArtist(sourceMetadata.artist)) {
    pushSplitArtistKeys(keys, sourceMetadata.artist);
  }

  return keys;
}

function buildCandidateArtistKeys(entry) {
  const keys = [];
  pushSplitArtistKeys(keys, entry?.artist);
  if (Array.isArray(entry?.artists)) {
    for (const artistName of entry.artists) {
      pushSplitArtistKeys(keys, artistName);
    }
  }
  return keys;
}

function candidateArtistMatchesExpected(entry, expectedArtistKeys = []) {
  if (expectedArtistKeys.length === 0) return true;
  const candidateKeys = buildCandidateArtistKeys(entry);
  if (
    candidateKeys.some((candidateKey) =>
      expectedArtistKeys.some(
        (expectedKey) =>
          candidateKey === expectedKey ||
          candidateKey.includes(expectedKey) ||
          expectedKey.includes(candidateKey),
      ),
    )
  ) {
    return true;
  }
  // A label/official-channel upload names the performer in the title, not
  // the channel field — fall back to checking there instead of rejecting.
  if (candidateKeys.length === 0 || looksLikeChannelArtist(entry?.artist)) {
    const titleKey = normalizeForCompare(entry?.title);
    return expectedArtistKeys.some((expectedKey) =>
      titleKey.includes(expectedKey),
    );
  }
  return false;
}

function buildSearchParts(
  canonical = {},
  sourceMetadata = {},
  titleParts = titlePartsFor(canonical, sourceMetadata),
) {
  const titles = [];
  const artists = [];

  pushUnique(titles, canonical.title);
  pushUnique(titles, sourceMetadata.track);
  pushUnique(titles, sourceMetadata.title);
  for (const part of titleParts) {
    pushUnique(titles, part.trackName);
  }

  pushUnique(artists, canonical.artist);
  for (const artistName of canonical.artists || []) {
    pushUnique(artists, artistName);
  }
  pushUnique(artists, sourceMetadata.artist);
  for (const part of titleParts) {
    for (const artistName of part.artistNames || []) {
      pushUnique(artists, artistName);
    }
  }

  const expandedArtists = [];
  for (const artist of artists) {
    for (const splitArtist of splitArtistNames(artist.value)) {
      pushUnique(expandedArtists, splitArtist);
    }
    pushUnique(expandedArtists, artist.value);
  }

  return {
    titles: titles.map((entry) => entry.value),
    artists: expandedArtists.map((entry) => entry.value),
  };
}

function buildPlaybackSearchQueries(
  canonical = {},
  sourceMetadata = {},
  titleParts = titlePartsFor(canonical, sourceMetadata),
) {
  const queries = [];
  const { titles, artists } = buildSearchParts(
    canonical,
    sourceMetadata,
    titleParts,
  );
  const primaryTitle = titles[0];
  const primaryArtist = artists[0];

  if (primaryTitle && primaryArtist) {
    pushUnique(queries, `${primaryArtist} ${primaryTitle}`);
    pushUnique(queries, `${primaryTitle} ${primaryArtist}`);
  }
  if (artists[1] && primaryTitle) {
    pushUnique(queries, `${artists[1]} ${primaryTitle}`);
  }
  pushUnique(queries, primaryTitle);
  for (const artist of artists.slice(2)) {
    if (primaryTitle) pushUnique(queries, `${artist} ${primaryTitle}`);
  }
  for (const title of titles.slice(1)) {
    pushUnique(queries, title);
    if (primaryArtist) pushUnique(queries, `${primaryArtist} ${title}`);
  }

  return queries
    .slice(0, MAX_PLAYBACK_SEARCH_QUERIES)
    .map((entry) => entry.value);
}

function isCloseDuration(first, second) {
  if (!Number.isFinite(first) || !Number.isFinite(second)) return false;
  return Math.abs(Math.round(first) - Math.round(second)) <= 15;
}

function buildPlaybackCrossSearchQueries(candidates, canonical = {}) {
  const queries = [];
  for (const candidate of candidates) {
    if (!isCloseDuration(candidate.duration, canonical.duration)) continue;
    const title = normalizeSearchQuery(candidate.title);
    const artist = normalizeSearchQuery(candidate.artist);
    if (!title || !artist) continue;
    pushUnique(queries, `${artist} ${title}`);
    pushUnique(queries, `${title} ${artist}`);
    if (queries.length >= MAX_CROSS_SEARCH_QUERIES) break;
  }

  return queries.slice(0, MAX_CROSS_SEARCH_QUERIES).map((entry) => entry.value);
}

function extractSearchEntries(info) {
  if (Array.isArray(info?.entries)) return info.entries;
  return [];
}

// Duration/title-only rejects, not an MV reject — candidates are truncated
// before importResolver.js scores them, so a bad-fit result must not eat a
// slot, but an MV may be the only candidate a plain YouTube search finds.
function isUsableSearchCandidate(candidate, context = {}) {
  if (
    Number.isFinite(candidate?.duration) &&
    candidate.duration > MAX_SONG_SEARCH_DURATION
  ) {
    return false;
  }
  if (LIVE_OR_MEDLEY_TITLE_RE.test(normalizeText(candidate?.title))) {
    return false;
  }
  return candidateArtistMatchesExpected(candidate, context.expectedArtistKeys);
}

function normalizePlaybackSearchCandidate(entry, context = {}) {
  if (!entry || typeof entry.id !== 'string' || !VIDEO_ID_RE.test(entry.id)) {
    return null;
  }
  const fields = extractMetadataFields(entry);
  // Filter on the normalized fields: raw ytsearch entries carry `uploader`,
  // not `artist`, and fields is what applies the fallback.
  if (!isUsableSearchCandidate({ ...entry, ...fields }, context)) return null;

  return {
    id: entry.id,
    playbackVideoId: entry.id,
    ...fields,
    searchProvider: 'youtube',
    availableProviders: ['youtube'],
    reason: 'youtube-search',
  };
}

async function fetchPlaybackSearchEntries(input, runner = youtubedl) {
  const info = await runner(
    input,
    applyYoutubeRuntimeOptions({
      flatPlaylist: true,
      skipDownload: true,
      dumpSingleJson: true,
      quiet: true,
      noWarnings: true,
      playlistEnd: PLAYBACK_SEARCH_LIMIT_PER_SOURCE,
    }),
  );
  return extractSearchEntries(info);
}

// Same-platform only, by design — cross-platform identity between a YT
// video and a YT Music track can't be proven (confirmed by probing YT
// Music's "counterpart" API anonymously and getting no hits), so widening
// the search used to be recommending a guess, not confirming a match.
function buildPlaybackSearchSources(queries) {
  return queries.map(
    (query) => `ytsearch${PLAYBACK_SEARCH_LIMIT_PER_SOURCE}:${query}`,
  );
}

async function fetchSettledPlaybackSearches(searchInputs, runner) {
  const settled = await Promise.allSettled(
    searchInputs.map(async (input) => ({
      entries: await fetchPlaybackSearchEntries(input, runner),
    })),
  );

  return settled.filter((result) => result.status === 'fulfilled');
}

// Two ytsearch5: queries can return the same video id; whichever side
// already has an artist wins the merge.
function mergeSearchCandidates(existing, incoming) {
  const availableProviders = [
    ...new Set(
      [
        ...(existing.availableProviders || [existing.searchProvider]),
        ...(incoming.availableProviders || [incoming.searchProvider]),
      ].filter(Boolean),
    ),
  ];
  const preferIncoming = !existing.artist && Boolean(incoming.artist);
  const primary = preferIncoming ? incoming : existing;
  const secondary = preferIncoming ? existing : incoming;

  return {
    ...secondary,
    ...primary,
    title: primary.title || secondary.title,
    artist: primary.artist || secondary.artist,
    duration: primary.duration || secondary.duration,
    thumbnailUrl: primary.thumbnailUrl || secondary.thumbnailUrl,
    availableProviders,
  };
}

function addSearchResults(candidatesById, settledResults, context = {}) {
  for (const result of settledResults) {
    for (const entry of result.value.entries) {
      const candidate = normalizePlaybackSearchCandidate(entry, context);
      if (!candidate) continue;
      const existing = candidatesById.get(candidate.id);
      if (existing) {
        candidatesById.set(
          candidate.id,
          mergeSearchCandidates(existing, candidate),
        );
        continue;
      }
      candidatesById.set(candidate.id, candidate);
    }
  }
}

async function searchPlaybackCandidates(
  canonical,
  sourceMetadata,
  options = {},
) {
  // A YT Music source is already the audio-native version of the song —
  // nothing to search for.
  if (options.sourcePlatform === 'yt-music') return [];

  const runner = options.runner || youtubedl;
  const titleParts = titlePartsFor(canonical, sourceMetadata);
  const queries = buildPlaybackSearchQueries(
    canonical,
    sourceMetadata,
    titleParts,
  );
  const candidatesById = new Map();
  const searchContext = {
    expectedArtistKeys: buildExpectedArtistKeys(
      canonical,
      sourceMetadata,
      titleParts,
    ),
  };
  const searchSources = buildPlaybackSearchSources(queries);
  const searchedInputs = new Set(searchSources);

  addSearchResults(
    candidatesById,
    await fetchSettledPlaybackSearches(searchSources, runner),
    searchContext,
  );

  const crossQueries = buildPlaybackCrossSearchQueries(
    [...candidatesById.values()],
    canonical,
  );
  const crossSources = buildPlaybackSearchSources(crossQueries).filter(
    (input) => !searchedInputs.has(input),
  );
  if (crossSources.length > 0) {
    addSearchResults(
      candidatesById,
      await fetchSettledPlaybackSearches(crossSources, runner),
      searchContext,
    );
  }

  return [...candidatesById.values()].slice(0, MAX_PLAYBACK_SEARCH_CANDIDATES);
}

module.exports = {
  buildPlaybackCrossSearchQueries,
  buildPlaybackSearchQueries,
  searchPlaybackCandidates,
};
