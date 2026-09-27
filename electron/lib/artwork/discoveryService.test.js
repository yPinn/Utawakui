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

describe('artwork discovery service', () => {
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

  it('reports provider unavailable when CAA fails after MusicBrainz succeeds', async () => {
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
    });

    await expect(service.search(track)).resolves.toEqual({
      status: 'error',
      reason: 'provider-unavailable',
    });
  });

  it('stops fallback variants when both MusicBrainz endpoints fail', async () => {
    const searchReleaseGroups = vi
      .fn()
      .mockResolvedValue({ status: 'error', reason: 'timeout' });
    const searchRecordings = vi
      .fn()
      .mockResolvedValue({ status: 'error', reason: 'timeout' });
    const lookupFront = vi.fn();
    const service = createArtworkDiscoveryService({
      musicBrainzClient: { searchReleaseGroups, searchRecordings },
      coverArtClient: { lookupFront },
    });

    await expect(service.search(track)).resolves.toEqual({
      status: 'error',
      reason: 'provider-unavailable',
    });
    expect(searchReleaseGroups).toHaveBeenCalledOnce();
    expect(searchRecordings).toHaveBeenCalledOnce();
    expect(lookupFront).not.toHaveBeenCalled();
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
