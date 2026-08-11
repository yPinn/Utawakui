'use strict';

const {
  extractTitleDerivedSearchParts,
  looksLikeChannelArtist,
  normalizeForCompare,
  normalizeText,
  stripParenthesizedDecorations,
  stripTrackDecorations,
} = require('./musicTitle.js');
const { buildLyricsMetadataProfiles } = require('./metadataEnrichment.js');

const LRCLIB_API_BASE_URL = 'https://lrclib.net';
const LRCLIB_PROVIDER = 'lrclib';
const AUTO_CONFIDENCE_THRESHOLD = 0.82;
const MAX_SEARCH_QUERIES = 6;
const REQUEST_TIMEOUT_MS = 8000;
const VERSION_MISMATCH_PENALTY = 0.18;
const VERSION_WORD_PATTERN = String.raw`\b(?:live|remix|acoustic|cover|karaoke|instrumental|sped|slowed|demo|edit|version|session)\b`;

function buildLrclibUrl(endpoint, params, baseUrl = LRCLIB_API_BASE_URL) {
  const url = new URL(`${String(baseUrl).replace(/\/+$/, '')}${endpoint}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url;
}

function buildSearchParams(track) {
  return (
    buildLrclibSearchQueries(track)[0]?.params || {
      track_name: stripTrackDecorations(track?.title),
      artist_name: normalizeText(track?.artist),
    }
  );
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

function parseLrcTimestamp(value) {
  const match = /^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/.exec(
    String(value || '').trim(),
  );
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = match[3] || '';
  const millis = fraction ? Number(fraction.padEnd(3, '0').slice(0, 3)) : 0;
  return minutes * 60 + seconds + millis / 1000;
}

function parseLrcLines(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return [];
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      const matches = [...line.matchAll(/\[([^\]]+)\]/g)];
      if (matches.length === 0) return [];
      const lyricText = line.replace(/\[[^\]]+\]/g, '').trim();
      if (!lyricText) return [];
      return matches
        .map((match) => parseLrcTimestamp(match[1]))
        .filter((start) => start !== null)
        .map((start) => ({ start, text: lyricText }));
    })
    .sort((a, b) => a.start - b.start);
}

function tokenSet(value) {
  return new Set(normalizeForCompare(value).split(/\s+/).filter(Boolean));
}

function tokenOverlap(first, second) {
  const firstTokens = tokenSet(first);
  const secondTokens = tokenSet(second);
  if (firstTokens.size === 0 || secondTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of firstTokens) {
    if (secondTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(firstTokens.size, secondTokens.size);
}

function textMatchScore(expected, actual) {
  const expectedText = normalizeForCompare(expected);
  const actualText = normalizeForCompare(actual);
  if (!expectedText || !actualText) return 0;
  if (expectedText === actualText) return 1;
  if (expectedText.includes(actualText) || actualText.includes(expectedText)) {
    return 0.82;
  }
  const overlap = tokenOverlap(expectedText, actualText);
  return overlap >= 0.75 ? overlap : 0;
}

function durationDelta(trackDuration, candidateDuration) {
  if (!Number.isFinite(trackDuration) || !Number.isFinite(candidateDuration)) {
    return null;
  }
  return Math.abs(Math.round(trackDuration) - Math.round(candidateDuration));
}

function durationMatchScore(delta) {
  if (delta === null) return 0.35;
  if (delta <= 4) return 1;
  if (delta <= 15) return 0.85;
  if (delta <= 45) return 0.55;
  if (delta <= 90) return 0.25;
  return 0;
}

function versionTerms(value) {
  const normalized = normalizeText(value).normalize('NFKC');
  return new Set(
    [...normalized.matchAll(new RegExp(VERSION_WORD_PATTERN, 'giu'))].map(
      (match) => match[0].toLocaleLowerCase(),
    ),
  );
}

function versionMismatchPenalty(trackTitle, candidate) {
  const sourceTerms = versionTerms(trackTitle);
  const candidateTerms = new Set([
    ...versionTerms(candidate?.trackName),
    ...versionTerms(candidate?.albumName),
  ]);
  for (const term of candidateTerms) {
    if (!sourceTerms.has(term)) return VERSION_MISMATCH_PENALTY;
  }
  return 0;
}

function scoreCandidate(track, candidate, query) {
  const syncedLineCount = parseLrcLines(candidate?.syncedLyrics).length;
  if (candidate?.instrumental || syncedLineCount === 0) return null;

  const queryParams = query?.params || buildSearchParams(track);
  const titleScore = textMatchScore(
    queryParams.track_name,
    candidate?.trackName,
  );
  const artistScore = textMatchScore(
    queryParams.artist_name,
    candidate?.artistName,
  );
  const delta = durationDelta(track?.duration, candidate?.duration);
  const durationScore = durationMatchScore(delta);
  const artistConfidence =
    query?.artistConfidence ||
    artistConfidenceFor(queryParams.artist_name, query?.source);
  const artistWeight =
    artistConfidence === 'high'
      ? 0.2
      : artistConfidence === 'medium'
        ? 0.12
        : 0.05;
  const penalty = versionMismatchPenalty(track?.title, candidate);
  const hasArtistHint = normalizeText(queryParams.artist_name).length > 0;

  if (titleScore < 0.75) return null;
  if (artistConfidence === 'high' && artistScore < 0.5) return null;
  if (artistConfidence === 'medium' && artistScore < 0.35) return null;
  if (!hasArtistHint && titleScore < 1) return null;
  if (durationScore === 0) return null;

  const score =
    titleScore * 0.55 +
    artistScore * artistWeight +
    durationScore * 0.25 -
    penalty;
  const confidence =
    score >= AUTO_CONFIDENCE_THRESHOLD &&
    titleScore >= 0.82 &&
    (durationScore >= 0.55 || artistScore >= 0.8)
      ? 'auto'
      : 'candidate';

  return {
    candidate,
    confidence,
    lineCount: syncedLineCount,
    score,
    durationDelta: delta,
    durationScore,
    titleScore,
    artistScore,
    query: query || null,
  };
}

function rankSyncedCandidates(
  track,
  candidates,
  queries = buildLrclibSearchQueries(track),
) {
  const searchQueries =
    Array.isArray(queries) && queries.length > 0 ? queries : [null];
  return (Array.isArray(candidates) ? candidates : [])
    .flatMap((candidate) =>
      searchQueries.map((query) => scoreCandidate(track, candidate, query)),
    )
    .filter(Boolean)
    .sort(
      (first, second) =>
        second.score - first.score ||
        (first.durationDelta ?? Number.MAX_SAFE_INTEGER) -
          (second.durationDelta ?? Number.MAX_SAFE_INTEGER) ||
        first.candidate.id - second.candidate.id,
    );
}

function pickBestSyncedCandidate(track, candidates, queries) {
  return rankSyncedCandidates(track, candidates, queries).find(
    (match) => match.confidence === 'auto',
  );
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildAvailableResult(best) {
  return {
    provider: LRCLIB_PROVIDER,
    status: 'available',
    source: {
      filename: `lrclib-${best.candidate.id}.lrc`,
      language: 'und',
      kind: LRCLIB_PROVIDER,
    },
    text: best.candidate.syncedLyrics,
    lineCount: best.lineCount,
    match: {
      confidence: best.confidence,
      score: best.score,
      durationDelta: best.durationDelta,
      querySource: best.query?.source,
    },
    record: {
      id: best.candidate.id,
      trackName: best.candidate.trackName,
      artistName: best.candidate.artistName,
      albumName: best.candidate.albumName,
      duration: best.candidate.duration,
    },
  };
}

async function findLrclibSyncedLyrics(track, options = {}) {
  const queries = buildLrclibSearchQueries(track);
  if (queries.length === 0) {
    return {
      provider: LRCLIB_PROVIDER,
      status: 'unavailable',
      reason: 'missing-track-title',
    };
  }

  const fetchFn = options.fetch || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return {
      provider: LRCLIB_PROVIDER,
      status: 'unavailable',
      reason: 'fetch-unavailable',
    };
  }

  const candidatesByKey = new Map();
  for (const query of queries) {
    const url = buildLrclibUrl('/api/search', query.params, options.baseUrl);
    let response;
    try {
      response = await fetchFn(url, {
        headers: { 'User-Agent': 'Utawakui/0.1' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return {
        provider: LRCLIB_PROVIDER,
        status: 'error',
        reason: 'network-error',
      };
    }

    const payload = await readJsonResponse(response);
    if (!response.ok) {
      if (response.status === 404) continue;
      return {
        provider: LRCLIB_PROVIDER,
        status: 'error',
        reason: 'http-error',
        httpStatus: response.status,
      };
    }
    if (!Array.isArray(payload)) {
      return {
        provider: LRCLIB_PROVIDER,
        status: 'error',
        reason: 'invalid-json',
      };
    }

    payload.forEach((candidate, index) => {
      const key =
        candidate?.id ??
        `${normalizeForCompare(candidate?.trackName)}|${normalizeForCompare(
          candidate?.artistName,
        )}|${candidate?.duration ?? ''}|${index}`;
      if (!candidatesByKey.has(key)) candidatesByKey.set(key, candidate);
    });

    const bestSoFar = pickBestSyncedCandidate(
      track,
      [...candidatesByKey.values()],
      queries,
    );
    if (bestSoFar) return buildAvailableResult(bestSoFar);
  }

  const best = pickBestSyncedCandidate(
    track,
    [...candidatesByKey.values()],
    queries,
  );
  if (!best) {
    return {
      provider: LRCLIB_PROVIDER,
      status: 'unavailable',
      reason: 'no-safe-synced-match',
    };
  }

  return buildAvailableResult(best);
}

module.exports = {
  buildLrclibSearchQueries,
  buildLrclibUrl,
  buildSearchParams,
  findLrclibSyncedLyrics,
  looksLikeChannelArtist,
  parseLrcLines,
  pickBestSyncedCandidate,
  rankSyncedCandidates,
  readJsonResponse,
  stripTrackDecorations,
};
