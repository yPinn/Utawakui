'use strict';

const {
  extractTitleDerivedSearchParts,
  looksLikeChannelArtist,
  normalizeForCompare,
  normalizeText,
  stripParenthesizedDecorations,
  stripTrackDecorations,
} = require('../musicTitle.js');
const { buildLyricsMetadataProfiles } = require('../metadataEnrichment.js');
const { LRCLIB_API_BASE_URL } = require('./client.js');

const MAX_SEARCH_QUERIES = 6;

function buildLrclibUrl(endpoint, params, baseUrl = LRCLIB_API_BASE_URL) {
  const url = new URL(`${String(baseUrl).replace(/\/+$/u, '')}${endpoint}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url;
}

function artistConfidenceFor(
  value,
  source = 'metadata',
  confidence = 'medium',
) {
  const artistName = normalizeText(value);
  if (!artistName) return 'none';
  if (source === 'title-derived' || confidence === 'high') return 'high';
  return looksLikeChannelArtist(artistName) ? 'low' : 'medium';
}

function pushSearchQuery(queries, query) {
  const trackName = normalizeText(query.trackName);
  const artistName = normalizeText(query.artistName);
  if (!trackName) return;

  const params = { track_name: trackName };
  if (artistName) params.artist_name = artistName;
  const key = `${normalizeForCompare(trackName)}|${normalizeForCompare(artistName)}`;
  if (queries.some((existing) => existing.key === key)) return;

  queries.push({
    key,
    params,
    source: query.source,
    artistConfidence: artistConfidenceFor(
      artistName,
      query.source,
      query.confidence,
    ),
  });
}

function buildLrclibSearchQueries(track) {
  const title = normalizeText(track?.title);
  const cleanedTitle = stripTrackDecorations(title);
  const metadataArtist = normalizeText(track?.artist);
  const queries = [];

  for (const profile of buildLyricsMetadataProfiles(track, [], {
    includeTrackFallback: false,
  })) {
    pushSearchQuery(queries, {
      trackName: profile.title,
      artistName: profile.artist,
      source: profile.source,
      confidence: profile.confidence,
    });
    pushSearchQuery(queries, {
      trackName: profile.title,
      source: profile.source,
      confidence: profile.confidence,
    });
  }

  for (const part of extractTitleDerivedSearchParts(title)) {
    for (const artistName of part.artistNames) {
      pushSearchQuery(queries, {
        trackName: part.trackName,
        artistName,
        source: 'title-derived',
      });
    }
    pushSearchQuery(queries, {
      trackName: part.trackName,
      source: 'title-derived',
    });
  }

  pushSearchQuery(queries, {
    trackName: cleanedTitle,
    artistName: metadataArtist,
    source: 'metadata',
  });
  pushSearchQuery(queries, {
    trackName: stripParenthesizedDecorations(cleanedTitle),
    artistName: metadataArtist,
    source: 'metadata',
  });
  pushSearchQuery(queries, {
    trackName: cleanedTitle,
    source: 'title-only',
  });

  return queries.slice(0, MAX_SEARCH_QUERIES);
}

function buildSearchParams(track) {
  return (
    buildLrclibSearchQueries(track)[0]?.params || {
      track_name: stripTrackDecorations(track?.title),
      artist_name: normalizeText(track?.artist),
    }
  );
}

module.exports = {
  artistConfidenceFor,
  buildLrclibSearchQueries,
  buildLrclibUrl,
  buildSearchParams,
};
