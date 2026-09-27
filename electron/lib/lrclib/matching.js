'use strict';

const {
  durationDelta,
  signedDurationDelta,
} = require('../musicIdentity/recordingEvidence.js');
const {
  compareLyricsRecordingIdentity,
  lyricsTextMatchScore,
} = require('../lyricsProviders/recordingPolicy.js');
const { normalizeText } = require('../musicIdentity/text.js');
const { parseLrcLines } = require('./lrc.js');
const {
  artistConfidenceFor,
  buildLrclibSearchQueries,
  buildSearchParams,
} = require('./query.js');

const AUTO_CONFIDENCE_THRESHOLD = 0.82;
const VERSION_MISMATCH_PENALTY = 0.18;

function textMatchScore(expected, actual) {
  return lyricsTextMatchScore(expected, actual);
}

function versionMismatchPenalty(trackTitle, candidate) {
  return compareLyricsRecordingIdentity({ title: trackTitle }, candidate)
    .versionMismatch
    ? VERSION_MISMATCH_PENALTY
    : 0;
}

function durationMatchScore(delta) {
  if (delta === null) return 0.35;
  if (delta <= 4) return 1;
  if (delta <= 15) return 0.85;
  if (delta <= 45) return 0.55;
  if (delta <= 90) return 0.25;
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
