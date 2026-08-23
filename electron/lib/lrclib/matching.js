'use strict';

const { normalizeForCompare, normalizeText } = require('../musicTitle.js');
const { parseLrcLines } = require('./lrc.js');
const {
  artistConfidenceFor,
  buildLrclibSearchQueries,
  buildSearchParams,
} = require('./query.js');

const AUTO_CONFIDENCE_THRESHOLD = 0.82;
const VERSION_MISMATCH_PENALTY = 0.18;
const VERSION_WORD_PATTERN = String.raw`\b(?:live|remix|acoustic|cover|karaoke|instrumental|sped|slowed|demo|edit|version|session)\b`;

function tokenSet(value) {
  return new Set(normalizeForCompare(value).split(/\s+/u).filter(Boolean));
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

function signedDurationDelta(trackDuration, candidateDuration) {
  if (!Number.isFinite(trackDuration) || !Number.isFinite(candidateDuration)) {
    return null;
  }
  return Math.round(candidateDuration) - Math.round(trackDuration);
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
    durationDeltaSigned: signedDurationDelta(
      track?.duration,
      candidate?.duration,
    ),
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

module.exports = {
  durationDelta,
  pickBestSyncedCandidate,
  rankSyncedCandidates,
  scoreCandidate,
  signedDurationDelta,
  textMatchScore,
  versionMismatchPenalty,
};
