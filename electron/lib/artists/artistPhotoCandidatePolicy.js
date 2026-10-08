'use strict';

function hasValidEvidence(candidate) {
  const evidence = candidate?.evidence;
  return Boolean(
    Number.isSafeInteger(candidate?.rank) &&
    candidate.rank > 0 &&
    evidence &&
    typeof evidence.exactName === 'boolean' &&
    Number.isSafeInteger(evidence.matchedChannelCount) &&
    evidence.matchedChannelCount >= 0 &&
    Number.isSafeInteger(evidence.matchedVideoCount) &&
    evidence.matchedVideoCount >= 0,
  );
}

function hasRunnerUpEvidence(candidates, candidate) {
  return candidates.some(
    (other) =>
      other.rank !== candidate.rank &&
      (other.evidence.exactName ||
        other.evidence.matchedChannelCount > 0 ||
        other.evidence.matchedVideoCount > 0),
  );
}

function selectAutomaticArtistPhotoCandidateRank(
  observation,
  { currentPhotoPresent = false, photoRemoved = false } = {},
) {
  if (
    currentPhotoPresent ||
    photoRemoved ||
    observation?.status !== 'ok' ||
    !Array.isArray(observation.candidates) ||
    !observation.candidates.every(hasValidEvidence)
  ) {
    return null;
  }
  const eligible = observation.candidates.filter((candidate) => {
    const { evidence } = candidate;
    return (
      evidence.matchedChannelCount >= 2 ||
      evidence.matchedVideoCount >= 2 ||
      (evidence.exactName &&
        evidence.matchedVideoCount >= 1 &&
        !hasRunnerUpEvidence(observation.candidates, candidate))
    );
  });
  return eligible.length === 1 ? eligible[0].rank : null;
}

module.exports = { selectAutomaticArtistPhotoCandidateRank };
