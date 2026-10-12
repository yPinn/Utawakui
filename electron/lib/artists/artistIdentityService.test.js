import { describe, expect, it, vi } from 'vitest';
import { createArtistIdentityService } from './artistIdentityService.js';

const ARTIST_ID = 'artist-68d52f69a4a24a1a';
const MBID = '11111111-1111-4111-8111-111111111111';
const TRACKS = [
  {
    id: 'track-1',
    title: 'Always Online',
    artist: 'JJ Lin',
    duration: 225,
  },
];

function artistRecord(overrides = {}) {
  return {
    entityType: 'artist',
    id: MBID,
    name: '林俊傑',
    sortName: 'Lin, JJ',
    type: 'Person',
    disambiguation: 'Singaporean singer-songwriter',
    aliases: [{ name: 'JJ Lin', locale: 'en', primary: true }],
    score: 100,
    ...overrides,
  };
}

function createHarness(clientOverrides = {}, cacheOverrides = {}) {
  let candidateIndex = 0;
  const artistIndexCache = {
    getIndex: vi.fn(async () => ({
      artists: [
        {
          id: ARTIST_ID,
          name: 'JJ Lin',
          trackIds: ['track-1'],
          credits: [{ id: 'credit-jj', name: 'JJ Lin', trackCount: 1 }],
        },
      ],
      organizationRevision: 0,
    })),
    applyCatalog: vi.fn(async () => ({
      status: 'ok',
      changed: true,
      artistId: 'artist-stable',
      revision: 1,
    })),
    ...cacheOverrides,
  };
  const musicBrainzClient = {
    searchArtists: vi.fn(async () => ({
      status: 'ok',
      records: [artistRecord()],
    })),
    searchRecordings: vi.fn(async () => ({
      status: 'ok',
      records: [
        {
          title: 'Always Online',
          duration: 225,
          artistCredits: [{ id: MBID, name: '林俊傑', joinPhrase: '' }],
        },
      ],
    })),
    ...clientOverrides,
  };
  const service = createArtistIdentityService({
    artistIndexCache,
    musicBrainzClient,
    createCandidateId: () =>
      `candidate_${String(candidateIndex++).padStart(24, '0')}`,
    now: () => new Date('2026-10-12T03:00:00.000Z'),
  });
  return { artistIndexCache, musicBrainzClient, service };
}

describe('artist identity service', () => {
  it('returns an opaque exact-alias candidate after recording corroboration', async () => {
    const { musicBrainzClient, service } = createHarness();

    const result = await service.search('/library', TRACKS, ARTIST_ID);

    expect(musicBrainzClient.searchArtists).toHaveBeenCalledWith(
      { artist: 'JJ Lin' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(musicBrainzClient.searchRecordings).toHaveBeenCalledWith(
      { title: 'Always Online', artist: 'JJ Lin' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toEqual({
      status: 'ok',
      artistId: ARTIST_ID,
      candidates: [
        {
          candidateId: 'candidate_000000000000000000000000',
          name: '林俊傑',
          sortName: 'Lin, JJ',
          type: 'Person',
          disambiguation: 'Singaporean singer-songwriter',
          aliases: ['JJ Lin'],
          evidence: 'exact-recording',
          canAutoLink: true,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(MBID);
  });

  it('keeps ambiguous exact-name matches as confirmation-only candidates', async () => {
    const otherMbid = '22222222-2222-4222-8222-222222222222';
    const { musicBrainzClient, service } = createHarness({
      searchArtists: vi.fn(async () => ({
        status: 'ok',
        records: [
          artistRecord(),
          artistRecord({ id: otherMbid, name: 'JJ Lin', aliases: [] }),
        ],
      })),
    });

    const result = await service.search('/library', TRACKS, ARTIST_ID);

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((candidate) => !candidate.canAutoLink)).toBe(
      true,
    );
    expect(
      result.candidates.every((candidate) => candidate.evidence === 'exact'),
    ).toBe(true);
    expect(musicBrainzClient.searchRecordings).not.toHaveBeenCalled();
  });

  it('checks every bounded search result for exact-name ambiguity before truncating the candidate list', async () => {
    const records = [
      ...Array.from({ length: 4 }, (_, index) =>
        artistRecord({
          id: `${index + 2}2222222-2222-4222-8222-222222222222`,
          name: `Weak result ${index}`,
          aliases: [],
          score: 90 - index,
        }),
      ),
      artistRecord(),
      artistRecord({
        id: '77777777-7777-4777-8777-777777777777',
        name: 'JJ Lin',
        aliases: [],
        score: 40,
      }),
    ];
    const { musicBrainzClient, service } = createHarness({
      searchArtists: vi.fn(async () => ({ status: 'ok', records })),
    });

    const result = await service.search('/library', TRACKS, ARTIST_ID);

    expect(result.candidates).toHaveLength(5);
    expect(result.candidates.every((candidate) => !candidate.canAutoLink)).toBe(
      true,
    );
    expect(musicBrainzClient.searchRecordings).not.toHaveBeenCalled();
  });

  it('applies only a session-scoped candidate id and persists bounded catalog facts', async () => {
    const { artistIndexCache, service } = createHarness();
    const search = await service.search('/library', TRACKS, ARTIST_ID);

    await expect(
      service.apply(
        '/library',
        TRACKS,
        ARTIST_ID,
        search.candidates[0].candidateId,
        0,
      ),
    ).resolves.toMatchObject({ status: 'ok', artistId: 'artist-stable' });
    expect(artistIndexCache.applyCatalog).toHaveBeenCalledWith(
      '/library',
      TRACKS,
      ARTIST_ID,
      {
        mbid: MBID,
        name: '林俊傑',
        sortName: 'Lin, JJ',
        type: 'Person',
        disambiguation: 'Singaporean singer-songwriter',
        aliases: [{ name: 'JJ Lin', locale: 'en', primary: true }],
        fetchedAt: '2026-10-12T03:00:00.000Z',
      },
      { expectedRevision: 0 },
    );
    await expect(
      service.apply('/library', TRACKS, ARTIST_ID, 'candidate_missing', 0),
    ).resolves.toEqual({ status: 'error', reason: 'candidate-unavailable' });
  });

  it('keeps offline and provider errors bounded without changing local grouping', async () => {
    const { service } = createHarness({
      searchArtists: vi.fn(async () => ({
        status: 'error',
        reason: 'offline',
      })),
    });

    await expect(
      service.search('/library', TRACKS, ARTIST_ID),
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'offline',
      candidates: [],
    });
  });

  it('invalidates the previous candidate session when a new search starts', async () => {
    const searchArtists = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', records: [artistRecord()] })
      .mockResolvedValueOnce({ status: 'error', reason: 'offline' });
    const { service } = createHarness({ searchArtists });
    const first = await service.search('/library', TRACKS, ARTIST_ID);

    await expect(
      service.search('/library', TRACKS, ARTIST_ID),
    ).resolves.toMatchObject({ status: 'unavailable' });
    await expect(
      service.apply(
        '/library',
        TRACKS,
        ARTIST_ID,
        first.candidates[0].candidateId,
        0,
      ),
    ).resolves.toEqual({ status: 'error', reason: 'candidate-unavailable' });
  });

  it('automatically applies only a corroborated candidate with the current revision', async () => {
    const onApplied = vi.fn();
    const { artistIndexCache, service } = createHarness();

    await expect(
      service.reconcile('/library', TRACKS, { onApplied }),
    ).resolves.toEqual({
      status: 'ok',
      attempted: 1,
      changed: 1,
    });
    expect(artistIndexCache.applyCatalog).toHaveBeenCalledWith(
      '/library',
      TRACKS,
      ARTIST_ID,
      expect.objectContaining({ mbid: MBID }),
      { automatic: true, expectedRevision: 0 },
    );
    expect(onApplied).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', changed: true }),
    );
  });

  it('keeps automatic reconciliation single-flight', async () => {
    let resolveSearch;
    const searchArtists = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );
    const { service } = createHarness({ searchArtists });

    const first = service.reconcile('/library', TRACKS);
    await vi.waitFor(() => expect(searchArtists).toHaveBeenCalledOnce());
    await expect(service.reconcile('/library', TRACKS)).resolves.toEqual({
      status: 'running',
    });
    resolveSearch({ status: 'ok', records: [artistRecord()] });

    await expect(first).resolves.toMatchObject({ status: 'ok', attempted: 1 });
    expect(searchArtists).toHaveBeenCalledOnce();
  });

  it('does not auto-apply ambiguous candidates or already resolved artists', async () => {
    const otherMbid = '22222222-2222-4222-8222-222222222222';
    const ambiguous = createHarness({
      searchArtists: vi.fn(async () => ({
        status: 'ok',
        records: [artistRecord(), artistRecord({ id: otherMbid })],
      })),
    });

    await expect(
      ambiguous.service.reconcile('/library', TRACKS),
    ).resolves.toEqual({ status: 'ok', attempted: 1, changed: 0 });
    expect(ambiguous.artistIndexCache.applyCatalog).not.toHaveBeenCalled();

    const resolved = createHarness(
      {},
      {
        getIndex: vi.fn(async () => ({
          artists: [
            {
              id: ARTIST_ID,
              name: '林俊傑',
              identityResolved: true,
              trackIds: ['track-1'],
              credits: [{ id: 'credit-jj', name: 'JJ Lin', trackCount: 1 }],
            },
          ],
          organizationRevision: 1,
        })),
      },
    );
    await expect(
      resolved.service.reconcile('/library', TRACKS),
    ).resolves.toEqual({ status: 'ok', attempted: 0, changed: 0 });
    expect(resolved.musicBrainzClient.searchArtists).not.toHaveBeenCalled();
  });

  it('stops the current automatic run on provider failure without mutating', async () => {
    const { artistIndexCache, service } = createHarness({
      searchArtists: vi.fn(async () => ({
        status: 'error',
        reason: 'offline',
      })),
    });

    await expect(service.reconcile('/library', TRACKS)).resolves.toEqual({
      status: 'unavailable',
      reason: 'offline',
      attempted: 1,
      changed: 0,
    });
    expect(artistIndexCache.applyCatalog).not.toHaveBeenCalled();
  });

  it('rebuilds the index after each automatic mutation and respects dismissed applies', async () => {
    const secondArtistId = 'artist-882cd3bcbb49699f';
    let revision = 0;
    const getIndex = vi.fn(async () => ({
      artists:
        revision === 0
          ? [
              {
                id: ARTIST_ID,
                name: 'JJ Lin',
                trackIds: ['track-1'],
                credits: [{ id: 'credit-jj', name: 'JJ Lin', trackCount: 1 }],
              },
              {
                id: secondArtistId,
                name: '林俊傑',
                trackIds: ['track-2'],
                credits: [{ id: 'credit-lin', name: '林俊傑', trackCount: 1 }],
              },
            ]
          : [
              {
                id: secondArtistId,
                name: '林俊傑',
                trackIds: ['track-2'],
                credits: [{ id: 'credit-lin', name: '林俊傑', trackCount: 1 }],
              },
            ],
      organizationRevision: revision,
    }));
    const applyCatalog = vi.fn(async () => {
      revision += 1;
      return revision === 1
        ? {
            status: 'ok',
            changed: true,
            artistId: 'artist-stable',
            revision,
          }
        : { status: 'skipped', reason: 'user-dismissed', revision };
    });
    const tracks = [
      ...TRACKS,
      {
        id: 'track-2',
        title: '53 Dawns',
        artist: '林俊傑',
        duration: 292,
      },
    ];
    const { service } = createHarness(
      {
        searchRecordings: vi.fn(async ({ title }) => ({
          status: 'ok',
          records: [
            {
              title,
              duration: title === '53 Dawns' ? 292 : 225,
              artistCredits: [{ id: MBID, name: '林俊傑', joinPhrase: '' }],
            },
          ],
        })),
      },
      { getIndex, applyCatalog },
    );

    await expect(service.reconcile('/library', tracks)).resolves.toEqual({
      status: 'ok',
      attempted: 2,
      changed: 1,
    });
    expect(applyCatalog).toHaveBeenNthCalledWith(
      1,
      '/library',
      tracks,
      ARTIST_ID,
      expect.objectContaining({ mbid: MBID }),
      { automatic: true, expectedRevision: 0 },
    );
    expect(applyCatalog).toHaveBeenNthCalledWith(
      2,
      '/library',
      tracks,
      secondArtistId,
      expect.objectContaining({ mbid: MBID }),
      { automatic: true, expectedRevision: 1 },
    );
  });
});
