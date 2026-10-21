import { describe, expect, it } from 'vitest';
import { buildObservedTrack } from './observedTrack.js';
import { buildIdentityProfile } from './profiles.js';
import { buildIdentityQueryVariants } from './queryVariants.js';
import { candidateIntroducesVersion } from './recordingSignals.js';
import {
  compareRecordingIdentity,
  compareTextEvidence,
  durationDelta,
} from './recordingEvidence.js';
import { normalizeForCompare } from './text.js';

describe('music identity primitives integration', () => {
  it('combines identity evidence and query primitives without feature policy', () => {
    const identity = buildObservedTrack({
      title: 'Artist - Song (Official Music Video)',
      artistCredit: 'Label Music',
      durationSeconds: 211,
    });

    expect(identity).toMatchObject({
      title: 'Artist - Song (Official Music Video)',
      artistCredit: 'Label Music',
      duration: 211,
    });
    expect(normalizeForCompare('Song (Official Video)')).toBe(
      'song official video',
    );
    expect(compareTextEvidence('Song', 'Song')).toMatchObject({ exact: true });
    expect(durationDelta(211, 215)).toBe(4);
    const candidate = buildObservedTrack({
      title: 'Song Live',
      durationSeconds: 211,
    });
    expect(
      candidateIntroducesVersion(
        [identity.title, identity.album],
        [candidate.title, candidate.album],
      ),
    ).toBe(true);

    const profile = buildIdentityProfile({
      title: '後來 Later',
      artistCredit: '劉若英 René Liu',
      titleAliases: [
        {
          value: 'Later',
          kind: 'catalog-alias',
          source: 'catalog',
          confidence: 'high',
        },
      ],
    });
    expect(buildIdentityQueryVariants(profile, { maxQueries: 2 })).toHaveLength(
      2,
    );
    expect(
      compareRecordingIdentity(profile, {
        title: '後來 Later',
        artistCredit: '劉若英 René Liu',
      }),
    ).toMatchObject({
      title: { exact: true },
      artist: { exact: true },
    });
  });
});
