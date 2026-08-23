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
const EAST_ASIAN_SCRIPT_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const LATIN_SCRIPT_RE = /\p{Script=Latin}/u;

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

function validProviderDuration(value) {
  return Number.isFinite(value) && value >= 1 && value <= 3600;
}

function hasCrossScriptIdentity(first, second) {
  const firstHasEastAsian = EAST_ASIAN_SCRIPT_RE.test(first);
  const secondHasEastAsian = EAST_ASIAN_SCRIPT_RE.test(second);
  const firstHasLatin = LATIN_SCRIPT_RE.test(first);
  const secondHasLatin = LATIN_SCRIPT_RE.test(second);
  return (
    (firstHasEastAsian && secondHasLatin && !secondHasEastAsian) ||
    (secondHasEastAsian && firstHasLatin && !firstHasEastAsian)
  );
}

function addUniqueText(values, value) {
  const text = normalizeText(value);
  const key = normalizeForCompare(text);
  if (
    !key ||
    values.some((existing) => normalizeForCompare(existing) === key)
  ) {
    return;
  }
  values.push(text);
}

function crossScriptTitleVariants(value) {
  const title = normalizeText(value);
  const variants = [];
  const dashMatch = /^(.+?)\s[-\u2013\u2014]\s(.+)$/u.exec(title);
  if (dashMatch && hasCrossScriptIdentity(dashMatch[1], dashMatch[2])) {
    addUniqueText(variants, dashMatch[1]);
    addUniqueText(variants, dashMatch[2]);
  }

  const parentheticalMatch =
    /^(.+?)\s*[(\uFF08]([^()\uFF08\uFF09]+)[)\uFF09]\s*$/u.exec(title);
  if (
    parentheticalMatch &&
    hasCrossScriptIdentity(parentheticalMatch[1], parentheticalMatch[2])
  ) {
    addUniqueText(variants, parentheticalMatch[1]);
    addUniqueText(variants, parentheticalMatch[2]);
  }
  return variants;
}

function pushStructuredQuery(queries, trackName, artistName) {
  const normalizedTrackName = normalizeText(trackName);
  const normalizedArtistName = normalizeText(artistName);
  if (!normalizedTrackName) return;
  const key = `${normalizeForCompare(normalizedTrackName)}|${normalizeForCompare(normalizedArtistName)}`;
  if (queries.some((query) => query.key === key)) return;
  queries.push({
    key,
    value: {
      trackName: normalizedTrackName,
      ...(normalizedArtistName ? { artistName: normalizedArtistName } : {}),
    },
  });
}

function buildStructuredQueries(trackName, artistName, profiles) {
  const titleVariants = crossScriptTitleVariants(trackName);
  const queries = [];
  pushStructuredQuery(queries, trackName, artistName);
  titleVariants.forEach((title) =>
    pushStructuredQuery(queries, title, artistName),
  );

  if (artistName) {
    for (const profile of profiles) {
      if (
        !normalizeText(profile.artist) ||
        normalizeForCompare(profile.artist) === normalizeForCompare(artistName)
      ) {
        continue;
      }
      const profileTitleKey = normalizeForCompare(profile.title);
      const matchesKnownTitle = [trackName, ...titleVariants].some(
        (title) => normalizeForCompare(title) === profileTitleKey,
      );
      if (!matchesKnownTitle) continue;
      pushStructuredQuery(queries, profile.title, profile.artist);
    }
  }

  return queries.slice(0, MAX_SEARCH_QUERIES).map((query) => query.value);
}

function buildRecoveryQueries(trackName, structuredQueryCount) {
  const remaining = Math.max(0, MAX_SEARCH_QUERIES - structuredQueryCount);
  const titles = [];
  addUniqueText(titles, trackName);
  crossScriptTitleVariants(trackName).forEach((title) =>
    addUniqueText(titles, title),
  );
  return titles.slice(0, remaining).map((title) => ({ trackName: title }));
}

function buildLrclibQueryPlan(track, edits = {}) {
  const hasManualTitle = Object.prototype.hasOwnProperty.call(edits, 'title');
  const hasManualArtist = Object.prototype.hasOwnProperty.call(edits, 'artist');
  const manual = hasManualTitle || hasManualArtist;
  const profiles = buildLyricsMetadataProfiles(track, [], {
    includeTrackFallback: true,
  });
  const plannedQueries = buildLrclibSearchQueries(track);
  const highConfidenceQueries = plannedQueries.filter(
    (candidate) =>
      candidate.artistConfidence === 'high' && candidate.params.artist_name,
  );
  const trustedMetadataQuery = highConfidenceQueries.find(
    (candidate) => candidate.source !== 'title-derived',
  );
  const trackMetadataArtist = normalizeText(track?.artist);
  const crossScriptMetadataQuery =
    crossScriptTitleVariants(stripTrackDecorations(track?.title)).length > 0 &&
    trackMetadataArtist &&
    !looksLikeChannelArtist(trackMetadataArtist)
      ? {
          params: {
            track_name: stripTrackDecorations(track.title),
            artist_name: trackMetadataArtist,
          },
          source: 'track-metadata',
          artistConfidence: 'medium',
        }
      : null;
  const preferredQuery =
    trustedMetadataQuery ||
    crossScriptMetadataQuery ||
    highConfidenceQueries.find(
      (candidate) => !/[()[\]]/u.test(candidate.params.artist_name),
    ) ||
    highConfidenceQueries[0] ||
    plannedQueries.find(
      (candidate) =>
        candidate.params.artist_name && candidate.artistConfidence !== 'low',
    );
  const matchedProfile = profiles.find(
    (candidate) =>
      normalizeForCompare(candidate.title) ===
        normalizeForCompare(preferredQuery?.params.track_name) &&
      normalizeForCompare(candidate.artist) ===
        normalizeForCompare(preferredQuery?.params.artist_name),
  );
  const profile =
    (preferredQuery
      ? {
          ...matchedProfile,
          title: preferredQuery.params.track_name,
          artist: preferredQuery.params.artist_name,
          album: matchedProfile?.album || track?.album,
          duration: matchedProfile?.duration ?? track?.duration,
          source: preferredQuery.source,
        }
      : null) ||
    profiles.find(
      (candidate) =>
        normalizeText(candidate.title) && normalizeText(candidate.artist),
    );

  const trackName = normalizeText(
    hasManualTitle
      ? edits.title
      : profile?.title || stripTrackDecorations(track?.title),
  );
  const artistName = normalizeText(
    hasManualArtist ? edits.artist : profile?.artist || track?.artist,
  );
  const albumName = normalizeText(profile?.album || track?.album) || null;
  const rawDuration = manual
    ? track?.duration
    : (profile?.duration ?? track?.duration);
  const duration = validProviderDuration(rawDuration) ? rawDuration : null;
  const titleAliases = crossScriptTitleVariants(trackName);
  const identity = {
    trackName,
    artistName,
    albumName,
    duration,
    source: manual ? 'manual' : profile?.source || 'track-metadata',
    ...(titleAliases.length > 0 ? { titleAliases } : {}),
  };

  const exact =
    trackName && artistName
      ? {
          trackName,
          artistName,
          ...(albumName ? { albumName } : {}),
          ...(duration !== null ? { duration } : {}),
        }
      : null;
  const structuredQueries = buildStructuredQueries(
    trackName,
    artistName,
    profiles,
  );
  const structured = structuredQueries[0] || null;
  const recoveryQueries = artistName
    ? buildRecoveryQueries(trackName, structuredQueries.length)
    : [];
  const broadenText = normalizeText(`${trackName} ${artistName}`);

  return {
    identity,
    exact,
    structured,
    structuredQueries,
    recoveryQueries,
    broaden: broadenText ? { q: broadenText } : null,
  };
}

module.exports = {
  artistConfidenceFor,
  buildLrclibQueryPlan,
  buildLrclibSearchQueries,
  buildLrclibUrl,
  buildSearchParams,
};
