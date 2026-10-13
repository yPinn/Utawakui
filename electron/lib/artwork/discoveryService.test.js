import { describe, expect, it, vi } from 'vitest';
import { createArtworkDiscoveryService } from './discoveryService.js';

const track = {
  id: 'track-1',
  title: '後來',
  artist: '劉若英',
  album: '我等你',
  duration: 341,
  releaseYear: 1999,
};

const releaseGroup = {
  entityType: 'release-group',
  id: '11111111-1111-4111-8111-111111111111',
  title: '後來',
  artistCredit: '劉若英',
  firstReleaseDate: '1999-11-01',
  primaryType: 'Single',
  secondaryTypes: [],
  score: 100,
};

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function recordingReleases(count = 6) {
  return Array.from({ length: count }, (_, index) => ({
    id: `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title: `我等你 ${index + 1}`,
    artistCredit: '劉若英',
    status: 'Official',
    date: '1999-11-01',
    releaseGroup: {
      id: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      firstReleaseDate: '1999-11-01',
      primaryType: 'Album',
      secondaryTypes: [],
    },
  }));
}

function frontFor(entityId) {
  return {
    status: 'ok',
    front: {
      imageUrl: `https://coverartarchive.org/release/${entityId}/front.jpg`,
      previewUrl: `https://coverartarchive.org/release/${entityId}/front-250.jpg`,
      applyUrl: `https://coverartarchive.org/release/${entityId}/front-1200.jpg`,
    },
  };
}

function trackedDeferredCoverLookups() {
  const pending = [];
  let active = 0;
  let maxActive = 0;
  return {
    pending,
    lookupFront: vi.fn((_entityType, entityId) => {
      const lookup = deferred();
      active += 1;
      maxActive = Math.max(maxActive, active);
      pending.push({ entityId, lookup });
      return lookup.promise.finally(() => {
        active -= 1;
      });
    }),
    active: () => active,
    maxActive: () => maxActive,
  };
}

function recordingSearchService({
  lookupFront,
  onProviderFailure,
  releaseCount = 6,
} = {}) {
  const searchRecordings = vi.fn().mockResolvedValue({
    status: 'ok',
    records: [
      {
        entityType: 'recording',
        id: '33333333-3333-4333-8333-333333333333',
        title: '後來',
        artistCredit: '劉若英',
        duration: 341,
        releases: recordingReleases(releaseCount),
        score: 100,
      },
    ],
  });
  const searchReleaseGroups = vi
    .fn()
    .mockResolvedValue({ status: 'ok', records: [] });
  return {
    searchRecordings,
    searchReleaseGroups,
    service: createArtworkDiscoveryService({
      musicBrainzClient: { searchRecordings, searchReleaseGroups },
      coverArtClient: { lookupFront },
      onProviderFailure,
    }),
  };
}

describe('artwork discovery service', () => {
  it('stops after the original recording search yields four unique covers', async () => {
    const lookupFront = vi.fn(async (_entityType, entityId) =>
      frontFor(entityId),
    );
    const { searchRecordings, searchReleaseGroups, service } =
      recordingSearchService({ lookupFront });

    const result = await service.search(track);

    expect(result.status).toBe('ok');
    expect(result.candidates).toHaveLength(4);
    expect(searchRecordings).toHaveBeenCalledOnce();
    expect(searchReleaseGroups).not.toHaveBeenCalled();
    expect(lookupFront).toHaveBeenCalledTimes(4);
  });

  it('starts all four required cover lookups before the first one settles', async () => {
    const lookups = trackedDeferredCoverLookups();
    const { service } = recordingSearchService({
      lookupFront: lookups.lookupFront,
    });

    const resultPromise = service.search(track);

    await vi.waitFor(() =>
      expect(lookups.lookupFront).toHaveBeenCalledTimes(4),
    );
    expect(lookups.active()).toBe(4);
    for (const { entityId, lookup } of lookups.pending) {
      lookup.resolve(frontFor(entityId));
    }

    const result = await resultPromise;
    expect(result.status).toBe('ok');
    expect(result.candidates).toHaveLength(4);
    expect(lookups.lookupFront).toHaveBeenCalledTimes(4);
    expect(lookups.maxActive()).toBe(4);
  });

  it('fills only a missing cover slot without scanning the rest of the stage', async () => {
    const lookups = trackedDeferredCoverLookups();
    const { service } = recordingSearchService({
      lookupFront: lookups.lookupFront,
      releaseCount: 8,
    });

    const resultPromise = service.search(track);
    await vi.waitFor(() =>
      expect(lookups.lookupFront).toHaveBeenCalledTimes(4),
    );

    lookups.pending[0].lookup.resolve({
      status: 'unavailable',
      reason: 'no-front',
    });
    await vi.waitFor(() =>
      expect(lookups.lookupFront).toHaveBeenCalledTimes(5),
    );
    expect(lookups.active()).toBe(4);

    for (const { entityId, lookup } of lookups.pending.slice(1, 5)) {
      lookup.resolve(frontFor(entityId));
    }

    const result = await resultPromise;
    expect(result.status).toBe('ok');
    expect(result.candidates).toHaveLength(4);
    expect(lookups.lookupFront).toHaveBeenCalledTimes(5);
    expect(lookups.maxActive()).toBe(4);
  });

  it('does not refill the cover pool after cancellation', async () => {
    const controller = new AbortController();
    const lookupFront = vi.fn(
      (_entityType, _entityId, { signal }) =>
        new Promise((resolve) => {
          signal.addEventListener(
            'abort',
            () => resolve({ status: 'error', reason: 'timeout' }),
            { once: true },
          );
        }),
    );
    const onProviderFailure = vi.fn();
    const { service } = recordingSearchService({
      lookupFront,
      onProviderFailure,
      releaseCount: 8,
    });

    const resultPromise = service.search(
      track,
      {},
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(lookupFront).toHaveBeenCalledTimes(4));

    controller.abort();

    await expect(resultPromise).resolves.toEqual({
      status: 'error',
      reason: 'cancelled',
    });
    expect(lookupFront).toHaveBeenCalledTimes(4);
    expect(onProviderFailure).not.toHaveBeenCalled();
  });

  it('falls back to release-group search only when recording candidates are insufficient', async () => {
    const searchRecordings = vi
      .fn()
      .mockResolvedValue({ status: 'ok', records: [] });
    const searchReleaseGroups = vi
      .fn()
      .mockResolvedValue({ status: 'ok', records: [releaseGroup] });
    const service = createArtworkDiscoveryService({
      musicBrainzClient: { searchRecordings, searchReleaseGroups },
      coverArtClient: {
        lookupFront: vi.fn().mockResolvedValue({
          status: 'ok',
          front: {
            imageUrl: 'https://coverartarchive.org/release-group/x/front.jpg',
            previewUrl:
              'https://coverartarchive.org/release-group/x/front-250.jpg',
            applyUrl:
              'https://coverartarchive.org/release-group/x/front-1200.jpg',
          },
        }),
      },
    });

    const result = await service.search(track);

    expect(result.candidates).toHaveLength(1);
    expect(searchRecordings).toHaveBeenCalledOnce();
    expect(searchReleaseGroups).toHaveBeenCalledOnce();
    expect(searchRecordings.mock.invocationCallOrder[0]).toBeLessThan(
      searchReleaseGroups.mock.invocationCallOrder[0],
    );
  });

  it('runs bounded staged identity queries, hydrates CAA fronts, and exposes no remote URL', async () => {
    const searchReleaseGroups = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', records: [] })
      .mockResolvedValueOnce({ status: 'ok', records: [releaseGroup] });
    const searchRecordings = vi
      .fn()
      .mockResolvedValue({ status: 'ok', records: [] });
    const lookupFront = vi.fn().mockResolvedValue({
      status: 'ok',
      front: {
        previewUrl: 'https://coverartarchive.org/release-group/x/front-250',
        applyUrl: 'https://archive.org/download/x/front.jpg',
        imageUrl: 'https://archive.org/download/x/front.jpg',
      },
    });
    const service = createArtworkDiscoveryService({
      musicBrainzClient: { searchReleaseGroups, searchRecordings },
      coverArtClient: { lookupFront },
    });

    const result = await service.search(track, {
      title: '後來',
      artist: '劉若英',
      album: '我等你',
    });

    expect(result.status).toBe('ok');
    expect(searchReleaseGroups.mock.calls).toHaveLength(2);
    expect(searchReleaseGroups.mock.calls[0][0].title).toBe('後來');
    expect(searchReleaseGroups.mock.calls[1][0].title).toBe('后来');
    expect(searchRecordings).toHaveBeenCalledTimes(2);
    expect(lookupFront).toHaveBeenCalledWith(
      'release-group',
      releaseGroup.id,
      expect.any(Object),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      id: expect.any(String),
      releaseTitle: '後來',
      artistCredit: '劉若英',
      confidence: 'high',
      automatic: false,
      source: { provider: 'musicbrainz', artwork: 'cover-art-archive' },
    });
    expect(JSON.stringify(result)).not.toMatch(/https?:\/\//u);
    expect(result.candidates[0]).not.toHaveProperty('score');
    expect(result.candidates[0]).not.toHaveProperty('evidence');
  });

  it('caps cover-art lookups by raw proposals even when no candidate has a front image', async () => {
    const recordings = Array.from({ length: 8 }, (_, recordingIndex) => ({
      entityType: 'recording',
      id: `00000000-0000-4000-8000-${String(recordingIndex).padStart(12, '0')}`,
      title: 'Song',
      artistCredit: 'Artist',
      duration: 180,
      score: 100,
      releases: Array.from({ length: 16 }, (_, releaseIndex) => ({
        id: `10000000-0000-4000-8000-${String(
          recordingIndex * 16 + releaseIndex,
        ).padStart(12, '0')}`,
        title: `Release ${releaseIndex}`,
        artistCredit: 'Artist',
        status: 'Official',
        releaseGroup: {
          id: `20000000-0000-4000-8000-${String(
            recordingIndex * 16 + releaseIndex,
          ).padStart(12, '0')}`,
        },
      })),
    }));
    const lookupFront = vi
      .fn()
      .mockResolvedValue({ status: 'unavailable', reason: 'no-front' });
    const service = createArtworkDiscoveryService({
      musicBrainzClient: {
        searchReleaseGroups: vi
          .fn()
          .mockResolvedValue({ status: 'ok', records: [] }),
        searchRecordings: vi
          .fn()
          .mockResolvedValue({ status: 'ok', records: recordings }),
      },
      coverArtClient: { lookupFront },
    });

    await expect(
      service.search({
        id: 'track-1',
        title: 'Song',
        artist: 'Artist',
        duration: 180,
      }),
    ).resolves.toEqual({ status: 'ok', candidates: [] });
    expect(lookupFront.mock.calls.length).toBeLessThanOrEqual(24);
  });

  it('stops querying and stays silent when the search is aborted mid-flight', async () => {
    const controller = new AbortController();
    const onProviderFailure = vi.fn();
    const searchRecordings = vi.fn(async () => {
      controller.abort();
      return { status: 'error', reason: 'timeout' };
    });
    const searchReleaseGroups = vi.fn();
    const service = createArtworkDiscoveryService({
      musicBrainzClient: { searchRecordings, searchReleaseGroups },
      coverArtClient: { lookupFront: vi.fn() },
      onProviderFailure,
    });

    await expect(
      service.search(track, {}, { signal: controller.signal }),
    ).resolves.toEqual({ status: 'error', reason: 'cancelled' });
    expect(searchRecordings).toHaveBeenCalledOnce();
    expect(searchReleaseGroups).not.toHaveBeenCalled();
    expect(onProviderFailure).not.toHaveBeenCalled();
  });

  it('reports provider unavailable when CAA fails after MusicBrainz succeeds', async () => {
    const onProviderFailure = vi.fn();
    const service = createArtworkDiscoveryService({
      musicBrainzClient: {
        searchReleaseGroups: vi
          .fn()
          .mockResolvedValue({ status: 'ok', records: [releaseGroup] }),
        searchRecordings: vi
          .fn()
          .mockResolvedValue({ status: 'ok', records: [] }),
      },
      coverArtClient: {
        lookupFront: vi
          .fn()
          .mockResolvedValue({ status: 'error', reason: 'timeout' }),
      },
      onProviderFailure,
    });

    const result = await service.search(track);

    expect(result).toEqual({
      status: 'error',
      reason: 'provider-unavailable',
    });
    expect(onProviderFailure).toHaveBeenCalledOnce();
    expect(onProviderFailure).toHaveBeenCalledWith({
      stage: 'cover-art-lookup',
      reason: 'timeout',
      failureCount: 1,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /cover-art-lookup|timeout|httpStatus/iu,
    );
  });

  it('stops fallback variants when both MusicBrainz endpoints fail', async () => {
    const onProviderFailure = vi.fn();
    const searchReleaseGroups = vi.fn().mockResolvedValue({
      status: 'error',
      reason: 'service-unavailable',
      httpStatus: 503,
    });
    const searchRecordings = vi.fn().mockResolvedValue({
      status: 'error',
      reason: 'service-unavailable',
      httpStatus: 503,
    });
    const lookupFront = vi.fn();
    const service = createArtworkDiscoveryService({
      musicBrainzClient: { searchReleaseGroups, searchRecordings },
      coverArtClient: { lookupFront },
      onProviderFailure,
    });

    await expect(service.search(track)).resolves.toEqual({
      status: 'error',
      reason: 'provider-unavailable',
    });
    expect(searchReleaseGroups).toHaveBeenCalledOnce();
    expect(searchRecordings).toHaveBeenCalledOnce();
    expect(lookupFront).not.toHaveBeenCalled();
    expect(onProviderFailure).toHaveBeenCalledWith({
      stage: 'musicbrainz-recording-search',
      reason: 'service-unavailable',
      httpStatus: 503,
      failureCount: 2,
    });
  });

  it('keeps a provider failure public result stable when diagnostics fail', async () => {
    const service = createArtworkDiscoveryService({
      musicBrainzClient: {
        searchRecordings: vi.fn().mockResolvedValue({
          status: 'error',
          reason: 'offline',
        }),
        searchReleaseGroups: vi.fn().mockResolvedValue({
          status: 'error',
          reason: 'offline',
        }),
      },
      coverArtClient: { lookupFront: vi.fn() },
      onProviderFailure: vi.fn(() => {
        throw new Error('diagnostics unavailable');
      }),
    });

    await expect(service.search(track)).resolves.toEqual({
      status: 'error',
      reason: 'provider-unavailable',
    });
  });

  it('matches any MusicBrainz recording ISRC instead of only the first', async () => {
    const recording = {
      entityType: 'recording',
      id: '33333333-3333-4333-8333-333333333333',
      title: '後來',
      artistCredit: '劉若英',
      duration: 341,
      isrcs: ['USAAA2100001', 'TWBBB9900002'],
      score: 100,
      releases: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          title: '我等你',
          artistCredit: '劉若英',
          status: 'Official',
          date: '1999-11-01',
          releaseGroup: {
            id: '55555555-5555-4555-8555-555555555555',
            firstReleaseDate: '1999-11-01',
            primaryType: 'Album',
            secondaryTypes: [],
          },
        },
      ],
    };
    const service = createArtworkDiscoveryService({
      musicBrainzClient: {
        searchReleaseGroups: vi
          .fn()
          .mockResolvedValue({ status: 'ok', records: [] }),
        searchRecordings: vi
          .fn()
          .mockResolvedValue({ status: 'ok', records: [recording] }),
      },
      coverArtClient: {
        lookupFront: vi.fn().mockResolvedValue({
          status: 'ok',
          front: {
            previewUrl: 'https://coverartarchive.org/x',
            applyUrl: 'https://archive.org/x',
          },
        }),
      },
    });

    const result = await service.search({
      ...track,
      isrc: 'TWBBB9900002',
    });
    expect(result.candidates[0].reasons).toContain('isrc-exact');
    expect(result.candidates[0].reasons).not.toContain('isrc-conflict');
  });

  it('keeps preview, apply, and source navigation behind opaque candidate ids', async () => {
    const front = {
      previewUrl: 'https://coverartarchive.org/release-group/x/front-250',
      applyUrl: 'https://archive.org/download/x/front.jpg',
      imageUrl: 'https://archive.org/download/x/front.jpg',
    };
    const downloadArtwork = vi.fn().mockResolvedValue({
      status: 'ok',
      image: {
        mimeType: 'image/jpeg',
        extension: '.jpg',
        width: 500,
        height: 500,
        buffer: Buffer.from('image'),
      },
    });
    const writeArtwork = vi.fn().mockReturnValue('thumbnail.jpg');
    const service = createArtworkDiscoveryService({
      musicBrainzClient: {
        searchReleaseGroups: vi.fn().mockResolvedValue({
          status: 'ok',
          records: [releaseGroup],
        }),
        searchRecordings: vi.fn().mockResolvedValue({
          status: 'ok',
          records: [],
        }),
      },
      coverArtClient: {
        lookupFront: vi.fn().mockResolvedValue({ status: 'ok', front }),
      },
      downloadArtwork,
      writeArtwork,
      now: () => Date.parse('2026-09-27T00:00:00.000Z'),
      randomId: () => 'candidate-1',
    });
    const search = await service.search(track, {});
    expect(search.candidates[0].id).toBe('candidate-1');

    await expect(service.loadPreview(track.id, 'candidate-1')).resolves.toEqual(
      {
        status: 'ok',
        mimeType: 'image/jpeg',
        bytes: expect.any(Uint8Array),
      },
    );
    await expect(
      service.apply('library-dir', track.id, 'candidate-1'),
    ).resolves.toEqual({ status: 'ok', filename: 'thumbnail.jpg' });
    expect(downloadArtwork.mock.calls.map(([url]) => url)).toEqual([
      front.previewUrl,
      front.applyUrl,
    ]);
    expect(downloadArtwork.mock.calls[0][1]).toMatchObject({
      maxBytes: 2 * 1024 * 1024,
      maxPixels: 4 * 1024 * 1024,
    });
    expect(writeArtwork).toHaveBeenCalledWith(
      'library-dir',
      track.id,
      expect.any(Buffer),
      '.jpg',
      expect.objectContaining({
        schemaVersion: 1,
        source: 'cover-art-archive',
        releaseGroupMbid: releaseGroup.id,
        selectedAt: '2026-09-27T00:00:00.000Z',
      }),
    );
    expect(service.sourcePage(track.id, 'candidate-1')).toBe(
      `https://musicbrainz.org/release-group/${releaseGroup.id}`,
    );
    expect(service.sourcePage('other-track', 'candidate-1')).toBe(null);
  });

  it('rejects invalid edits and expires candidate capabilities', async () => {
    let now = 0;
    const service = createArtworkDiscoveryService({
      musicBrainzClient: {
        searchReleaseGroups: vi.fn().mockResolvedValue({
          status: 'ok',
          records: [releaseGroup],
        }),
        searchRecordings: vi.fn().mockResolvedValue({
          status: 'ok',
          records: [],
        }),
      },
      coverArtClient: {
        lookupFront: vi.fn().mockResolvedValue({
          status: 'ok',
          front: {
            previewUrl: 'https://coverartarchive.org/x',
            applyUrl: 'https://archive.org/x',
          },
        }),
      },
      now: () => now,
      sessionTtlMs: 100,
      randomId: () => 'candidate-1',
    });

    await expect(
      service.search(track, { title: 'x'.repeat(201) }),
    ).resolves.toEqual({ status: 'error', reason: 'invalid-query' });
    const search = await service.search(track, {});
    expect(search.status).toBe('ok');
    now = 101;
    await expect(service.loadPreview(track.id, 'candidate-1')).resolves.toEqual(
      { status: 'error', reason: 'candidate-expired' },
    );
  });
});
