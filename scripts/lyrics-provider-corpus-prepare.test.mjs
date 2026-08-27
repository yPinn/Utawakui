import { describe, expect, it, vi } from 'vitest';

import { LYRICS_CORPUS_STRATA } from './lyrics-provider-corpus-strata.mjs';
import {
  excludeCrossStratumRecordingConflicts,
  preparePrivateLyricsCandidateSet,
  selectDeterministicDiscoverySeeds,
  selectDeterministicRecordingPool,
  smokeLyricsProviderCandidateSources,
} from './lyrics-provider-corpus-prepare.mjs';

function uuid(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function discoverySeeds(perStratum = 5) {
  let sequence = 1;
  return LYRICS_CORPUS_STRATA.flatMap(({ id }) =>
    Array.from({ length: perStratum }, () => {
      const value = {
        stratum: id,
        seedType: 'work',
        wikidataId: `Q${sequence}`,
        musicbrainzId: uuid(sequence),
      };
      sequence += 1;
      return value;
    }),
  );
}

function recordingMetadata(perStratum = 60) {
  let sequence = 1;
  return LYRICS_CORPUS_STRATA.flatMap(({ id, languageTag }) =>
    Array.from({ length: perStratum }, (_, index) => {
      const value = {
        stratum: id,
        languageTag,
        recordingMbid: uuid(sequence),
        primaryArtistMbid: uuid(100_000 + Math.floor(index / 2)),
        workQid: `Q${100_000 + sequence}`,
        workMbid: uuid(200_000 + sequence),
        title: `Private title ${sequence}`,
        artist: `Private artist ${Math.floor(index / 2)}`,
        album: null,
        durationMs: 180_000,
        firstReleaseDate: index % 2 === 0 ? '2012' : '2024-01-02',
      };
      sequence += 1;
      return value;
    }),
  );
}

describe('private lyrics candidate preparation', () => {
  it('selects bounded seeds deterministically without source-order bias', () => {
    const seeds = discoverySeeds(5);
    const first = selectDeterministicDiscoverySeeds(seeds, {
      version: 1,
      maximumPerStratum: 3,
    });
    const second = selectDeterministicDiscoverySeeds([...seeds].reverse(), {
      version: 1,
      maximumPerStratum: 3,
    });

    expect(second).toEqual(first);
    for (const { id } of LYRICS_CORPUS_STRATA) {
      expect(first.filter((seed) => seed.stratum === id)).toHaveLength(3);
    }
  });

  it('chooses the same representative for duplicate MusicBrainz seed ids', () => {
    const seeds = discoverySeeds(1);
    seeds.push({ ...seeds[0], wikidataId: 'Q999999' });
    const first = selectDeterministicDiscoverySeeds(seeds, {
      version: 1,
      maximumPerStratum: 3,
    });
    const second = selectDeterministicDiscoverySeeds([...seeds].reverse(), {
      version: 1,
      maximumPerStratum: 3,
    });

    expect(second).toEqual(first);
    expect(
      first.find((item) => item.musicbrainzId === seeds[0].musicbrainzId),
    ).toEqual(seeds[0]);
  });

  it('excludes recordings discovered in more than one language/genre stratum', () => {
    const recordings = recordingMetadata(2);
    recordings[2].recordingMbid = recordings[0].recordingMbid;

    const result = excludeCrossStratumRecordingConflicts(recordings);

    expect(
      result.some((item) => item.recordingMbid === recordings[0].recordingMbid),
    ).toBe(false);
    expect(result).toHaveLength(recordings.length - 2);
  });

  it('bounds the popularity recording pool deterministically per stratum', () => {
    const recordings = recordingMetadata(60);
    const first = selectDeterministicRecordingPool(recordings, {
      version: 1,
      maximumPerStratum: 50,
    });
    const second = selectDeterministicRecordingPool([...recordings].reverse(), {
      version: 1,
      maximumPerStratum: 50,
    });

    expect(second).toEqual(first);
    expect(first).toHaveLength(250);
    for (const { id } of LYRICS_CORPUS_STRATA) {
      expect(
        first.filter((recording) => recording.stratum === id),
      ).toHaveLength(50);
    }
  });

  it('orchestrates only open metadata sources and produces 40 needs-review candidates', async () => {
    const metadata = recordingMetadata();
    const fetchWikidataSeeds = vi.fn(async (stratum) =>
      discoverySeeds(1).filter((seed) => seed.stratum === stratum),
    );
    const collectMusicBrainz = vi.fn(async () => metadata);
    const fetchListenBrainz = vi.fn(async (mbids) =>
      mbids.map((recordingMbid, index) => ({
        recordingMbid,
        listenCount: 10_000 - index,
        userCount: 5_000 - index,
      })),
    );

    const result = await preparePrivateLyricsCandidateSet({
      version: 1,
      maximumSeedsPerStratum: 100,
      maxPagesPerSeed: 1,
      maximumRecordingsPerStratum: 50,
      fetchWikidataSeeds,
      collectMusicBrainz,
      fetchListenBrainz,
    });

    expect(result.status).toBe('needs-review');
    expect(result.candidates).toHaveLength(40);
    expect(fetchWikidataSeeds).toHaveBeenCalledTimes(5);
    expect(collectMusicBrainz).toHaveBeenCalledOnce();
    expect(fetchListenBrainz).toHaveBeenCalledOnce();
    expect(fetchListenBrainz.mock.calls[0][0]).toHaveLength(250);
  });

  it('fails explicitly when null popularity leaves a stratum undersized', async () => {
    const metadata = recordingMetadata();
    await expect(
      preparePrivateLyricsCandidateSet({
        version: 1,
        fetchWikidataSeeds: async (stratum) =>
          discoverySeeds(1).filter((seed) => seed.stratum === stratum),
        collectMusicBrainz: async () => metadata,
        fetchListenBrainz: async (mbids) =>
          mbids.map((recordingMbid, index) => ({
            recordingMbid,
            listenCount: index < 54 ? null : 1_000 - index,
            userCount: index < 54 ? null : 1_000 - index,
          })),
      }),
    ).rejects.toThrow(/eligible candidates.*chinese-rap/i);
  });

  it('smokes one seed per stratum without producing a candidate set', async () => {
    const metadata = recordingMetadata(2);
    const result = await smokeLyricsProviderCandidateSources({
      version: 1,
      fetchWikidataSeeds: async (stratum) =>
        discoverySeeds(2).filter((seed) => seed.stratum === stratum),
      collectMusicBrainz: async (seeds) =>
        metadata.filter((item) =>
          seeds.some((seed) => seed.stratum === item.stratum),
        ),
      fetchListenBrainz: async (mbids) =>
        mbids.map((recordingMbid, index) => ({
          recordingMbid,
          listenCount: index === 0 ? null : 100,
          userCount: index === 0 ? null : 10,
        })),
    });

    expect(result).toEqual({
      seedCount: 5,
      recordingCount: 10,
      popularityAvailableCount: 9,
      popularityUnavailableCount: 1,
    });
    expect(result).not.toHaveProperty('candidates');
  });

  it('fails smoke when any stratum lacks a seed or usable recording', async () => {
    await expect(
      smokeLyricsProviderCandidateSources({
        version: 1,
        fetchWikidataSeeds: async (stratum) =>
          stratum === 'korean-catalog'
            ? []
            : discoverySeeds(1).filter((seed) => seed.stratum === stratum),
        collectMusicBrainz: async () => recordingMetadata(1),
        fetchListenBrainz: vi.fn(),
      }),
    ).rejects.toThrow(/every stratum.*seed/i);

    await expect(
      smokeLyricsProviderCandidateSources({
        version: 1,
        fetchWikidataSeeds: async (stratum) =>
          discoverySeeds(1).filter((seed) => seed.stratum === stratum),
        collectMusicBrainz: async () =>
          recordingMetadata(1).filter(
            (recording) => recording.stratum !== 'korean-catalog',
          ),
        fetchListenBrainz: vi.fn(),
      }),
    ).rejects.toThrow(/every stratum.*recording/i);
  });
});
