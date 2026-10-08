import { describe, expect, it } from 'vitest';
import { selectAutomaticArtistPhotoCandidateRank } from './artistPhotoCandidatePolicy.js';

function candidate(rank, evidence) {
  return { rank, evidence };
}

function observation(candidates, status = 'ok') {
  return { status, candidates };
}

describe('artist photo candidate automatic policy', () => {
  it('accepts exactly one candidate with multiple channel or video evidence', () => {
    expect(
      selectAutomaticArtistPhotoCandidateRank(
        observation([
          candidate(1, {
            exactName: false,
            matchedChannelCount: 2,
            matchedVideoCount: 0,
          }),
        ]),
        { currentPhotoPresent: false, photoRemoved: false },
      ),
    ).toBe(1);
    expect(
      selectAutomaticArtistPhotoCandidateRank(
        observation([
          candidate(2, {
            exactName: false,
            matchedChannelCount: 0,
            matchedVideoCount: 2,
          }),
        ]),
        { currentPhotoPresent: false, photoRemoved: false },
      ),
    ).toBe(2);
  });

  it('accepts one exact-name video match only without an evidence runner-up', () => {
    expect(
      selectAutomaticArtistPhotoCandidateRank(
        observation([
          candidate(1, {
            exactName: true,
            matchedChannelCount: 0,
            matchedVideoCount: 1,
          }),
          candidate(2, {
            exactName: false,
            matchedChannelCount: 0,
            matchedVideoCount: 0,
          }),
        ]),
        { currentPhotoPresent: false, photoRemoved: false },
      ),
    ).toBe(1);
  });

  it('abstains for weak, competing, partial, existing, or removed photos', () => {
    const oneWeakVideo = observation([
      candidate(1, {
        exactName: false,
        matchedChannelCount: 0,
        matchedVideoCount: 1,
      }),
    ]);
    const competingExact = observation([
      candidate(1, {
        exactName: true,
        matchedChannelCount: 0,
        matchedVideoCount: 1,
      }),
      candidate(2, {
        exactName: true,
        matchedChannelCount: 0,
        matchedVideoCount: 0,
      }),
    ]);
    const multipleEligible = observation([
      candidate(1, {
        exactName: true,
        matchedChannelCount: 2,
        matchedVideoCount: 0,
      }),
      candidate(2, {
        exactName: true,
        matchedChannelCount: 0,
        matchedVideoCount: 2,
      }),
    ]);

    expect(
      selectAutomaticArtistPhotoCandidateRank(oneWeakVideo, {
        currentPhotoPresent: false,
        photoRemoved: false,
      }),
    ).toBeNull();
    expect(
      selectAutomaticArtistPhotoCandidateRank(competingExact, {
        currentPhotoPresent: false,
        photoRemoved: false,
      }),
    ).toBeNull();
    expect(
      selectAutomaticArtistPhotoCandidateRank(multipleEligible, {
        currentPhotoPresent: false,
        photoRemoved: false,
      }),
    ).toBeNull();
    expect(
      selectAutomaticArtistPhotoCandidateRank(
        { ...oneWeakVideo, status: 'partial' },
        { currentPhotoPresent: false, photoRemoved: false },
      ),
    ).toBeNull();
    expect(
      selectAutomaticArtistPhotoCandidateRank(
        observation([
          candidate(1, {
            exactName: true,
            matchedChannelCount: 2,
            matchedVideoCount: 2,
          }),
        ]),
        { currentPhotoPresent: true, photoRemoved: false },
      ),
    ).toBeNull();
    expect(
      selectAutomaticArtistPhotoCandidateRank(
        observation([
          candidate(1, {
            exactName: true,
            matchedChannelCount: 2,
            matchedVideoCount: 2,
          }),
        ]),
        { currentPhotoPresent: false, photoRemoved: true },
      ),
    ).toBeNull();
  });

  it('fails closed for malformed observations', () => {
    expect(
      selectAutomaticArtistPhotoCandidateRank(null, {
        currentPhotoPresent: false,
        photoRemoved: false,
      }),
    ).toBeNull();
    expect(
      selectAutomaticArtistPhotoCandidateRank(
        observation([{ rank: 1, evidence: null }]),
        { currentPhotoPresent: false, photoRemoved: false },
      ),
    ).toBeNull();
  });
});
