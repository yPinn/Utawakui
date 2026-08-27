import { createHash } from 'node:crypto';

import { LYRICS_CORPUS_STRATA } from './lyrics-provider-corpus-strata.mjs';

function recordingId(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

export function createLegacyV2CandidateSet() {
  let sequence = 1;
  const candidates = LYRICS_CORPUS_STRATA.flatMap(
    ({ id: stratum, languageTag }) =>
      Array.from({ length: 20 }, (_, index) => {
        const recordingMbid = recordingId(sequence);
        const hash = createHash('sha256')
          .update(`lyrics-provider-candidates-v2\0${stratum}\0${recordingMbid}`)
          .digest('hex');
        const chinese = stratum.startsWith('chinese-');
        const candidate = {
          id: `candidate-${hash.slice(0, 16)}`,
          stratum,
          languageTag,
          catalogReach: index < 16 ? 'mainstream' : 'long-tail',
          reviewStatus: 'needs-review',
          reference: {
            title: `Legacy private title ${sequence}`,
            artist: `Legacy private artist ${sequence}`,
            album: null,
            durationSeconds: 180 + index,
            firstReleaseDate: index === 0 ? '2000' : '2024-01-02',
          },
          source: {
            recordingMbid,
            primaryArtistMbid: recordingId(100_000 + sequence),
            workQid: chinese ? null : `Q${100_000 + sequence}`,
            workMbid: chinese ? null : recordingId(200_000 + sequence),
            listenCount: 100_000 - sequence,
            userCount: 10_000 - sequence,
          },
        };
        sequence += 1;
        return { candidate, hash };
      }),
  )
    .sort((left, right) => left.hash.localeCompare(right.hash))
    .map(({ candidate }) => candidate);

  return {
    schemaVersion: 1,
    candidateSetId: 'lyrics-provider-private-candidates-v2',
    status: 'needs-review',
    policy: {
      targetCount: 100,
      casesPerStratum: 20,
      mainstreamCasesPerStratum: 16,
      longTailCasesPerStratum: 4,
      minimumFirstReleaseYear: 2000,
      mainstreamSelection: 'highest-user-count-then-listen-count',
      popularityBasis: 'listenbrainz-users-within-stratum',
      middlePopularityBand: 'excluded',
      maxPrimaryArtistPerStratum: 2,
    },
    candidates,
  };
}
