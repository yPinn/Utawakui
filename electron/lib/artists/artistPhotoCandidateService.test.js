import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createArtistPhotoCandidateService,
  isAllowedYtMusicPortraitUrl,
} from './artistPhotoCandidateService.js';
import {
  clearArtistPhoto,
  isArtistPhotoRemoved,
  readArtistPhoto,
  writeArtistPhoto,
} from './artistPhotos.js';
import { createProviderRequestScheduler } from '../providerRequestScheduler.js';

const ARTIST_ID = 'artist-0123456789abcdef';
const OTHER_ARTIST_ID = 'artist-fedcba9876543210';
const PORTRAIT_URL = 'https://yt3.googleusercontent.com/avatar=s512';

function pngBuffer(width = 512, height = 512) {
  const buffer = Buffer.alloc(32);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function context(name = 'Artist') {
  return {
    artistName: name,
    recordings: [{ videoId: 'abcdefghijk', channelId: 'UC_channel_1' }],
  };
}

function observation(overrides = {}) {
  return {
    status: 'ok',
    candidates: [
      {
        rank: 1,
        name: 'Artist',
        browseId: 'UC_candidate_1',
        portrait: { url: PORTRAIT_URL, width: 512, height: 512 },
        evidence: {
          exactName: true,
          matchedChannelCount: 1,
          matchedVideoCount: 1,
        },
      },
    ],
    ...overrides,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-photo-candidates-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function createService(overrides = {}) {
  const artistIndexCache = {
    getPhotoSearchContext: vi.fn().mockResolvedValue(context()),
  };
  const runWorker = vi.fn().mockResolvedValue(observation());
  const downloadImage = vi.fn().mockResolvedValue({
    status: 'ok',
    image: {
      buffer: pngBuffer(),
      extension: '.png',
      mimeType: 'image/png',
      width: 512,
      height: 512,
    },
  });
  const deps = {
    artistIndexCache,
    runWorker,
    downloadImage,
    scheduler: createProviderRequestScheduler({
      intervalMs: 0,
      maxPending: 64,
    }),
    ...overrides,
  };
  return { ...deps, service: createArtistPhotoCandidateService(deps) };
}

async function searchOne(service, artistId = ARTIST_ID) {
  const result = await service.search(dir, [], artistId);
  expect(result.status).toBe('ok');
  expect(result.candidates).toHaveLength(1);
  return result.candidates[0];
}

describe('YT Music artist photo candidate service', () => {
  it('returns only opaque candidate ids and display names to the renderer boundary', async () => {
    const { service, runWorker, artistIndexCache } = createService();

    const result = await service.search(dir, [], ARTIST_ID);

    expect(artistIndexCache.getPhotoSearchContext).toHaveBeenCalledWith(
      dir,
      [],
      ARTIST_ID,
    );
    expect(runWorker).toHaveBeenCalledWith(context(), {
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({
      status: 'ok',
      candidates: [
        {
          candidateId: expect.stringMatching(/^[A-Za-z0-9_-]{20,64}$/),
          name: 'Artist',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /https|googleusercontent|browseId|matchedVideo|UC_candidate/,
    );
  });

  it('does not search when the artist is invalid, unknown, or already has a photo', async () => {
    const { service, runWorker, artistIndexCache } = createService();
    await expect(service.search(dir, [], '../escape')).resolves.toEqual({
      status: 'error',
      reason: 'invalid-artist',
    });
    artistIndexCache.getPhotoSearchContext.mockResolvedValueOnce(null);
    await expect(service.search(dir, [], ARTIST_ID)).resolves.toEqual({
      status: 'error',
      reason: 'invalid-artist',
    });
    artistIndexCache.getPhotoSearchContext.mockResolvedValueOnce({
      artistName: 'Artist',
      recordings: [{ videoId: '../unbounded', channelId: { raw: true } }],
    });
    await expect(service.search(dir, [], ARTIST_ID)).resolves.toEqual({
      status: 'error',
      reason: 'invalid-artist',
    });
    writeArtistPhoto(dir, ARTIST_ID, {
      buffer: pngBuffer(),
      extension: '.png',
      source: 'local-file',
    });
    await expect(service.search(dir, [], ARTIST_ID)).resolves.toEqual({
      status: 'error',
      reason: 'photo-present',
    });
    expect(runWorker).not.toHaveBeenCalled();
  });

  it('downloads previews through the exact allowlist and reuses validated bytes for apply', async () => {
    const { service, downloadImage } = createService();
    const candidate = await searchOne(service);

    const preview = await service.loadPreview(
      dir,
      ARTIST_ID,
      candidate.candidateId,
    );
    expect(preview).toEqual({
      status: 'ok',
      candidateId: candidate.candidateId,
      image: {
        mimeType: 'image/png',
        buffer: expect.any(Buffer),
      },
    });
    const [url, options] = downloadImage.mock.calls[0];
    expect(url).toBe(PORTRAIT_URL);
    expect(options.isAllowedUrl(PORTRAIT_URL)).toBe(true);
    expect(
      options.isAllowedUrl('https://yt3.googleusercontent.com.evil.test/a'),
    ).toBe(false);
    expect(options.isAllowedUrl('https://example.test/a')).toBe(false);
    expect(options).toMatchObject({
      maxBytes: 2 * 1024 * 1024,
      maxPixels: 2048 * 2048,
    });

    await expect(
      service.apply(dir, [], ARTIST_ID, candidate.candidateId),
    ).resolves.toEqual({ status: 'ok', changed: true });
    expect(downloadImage).toHaveBeenCalledTimes(1);
    expect(readArtistPhoto(dir, ARTIST_ID)).toMatchObject({
      source: 'youtube-music',
    });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(dir, 'artists', ARTIST_ID, 'photo.json'),
          'utf8',
        ),
      ),
    ).toMatchObject({ selection: 'user-confirmed' });
  });

  it('single-flights concurrent preview and apply image loads', async () => {
    const pendingDownload = deferred();
    const downloadImage = vi.fn(() => pendingDownload.promise);
    const { service } = createService({ downloadImage });
    const candidate = await searchOne(service);

    const previews = Array.from({ length: 3 }, () =>
      service.loadPreview(dir, ARTIST_ID, candidate.candidateId),
    );
    const apply = service.apply(dir, [], ARTIST_ID, candidate.candidateId);
    await vi.waitFor(() => expect(downloadImage).toHaveBeenCalledOnce());
    pendingDownload.resolve({
      status: 'ok',
      image: {
        buffer: pngBuffer(),
        extension: '.png',
        mimeType: 'image/png',
        width: 512,
        height: 512,
      },
    });

    await expect(Promise.all(previews)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'ok' })]),
    );
    await expect(apply).resolves.toEqual({ status: 'ok', changed: true });
    expect(downloadImage).toHaveBeenCalledOnce();
  });

  it('bounds concurrent preview consumers before copying cached image bytes', async () => {
    const pendingDownload = deferred();
    const result = observation();
    result.candidates.push(
      {
        ...result.candidates[0],
        rank: 2,
        name: 'Artist 2',
        browseId: 'UC_candidate_2',
      },
      {
        ...result.candidates[0],
        rank: 3,
        name: 'Artist 3',
        browseId: 'UC_candidate_3',
      },
    );
    const downloadImage = vi.fn(() => pendingDownload.promise);
    const { service } = createService({
      runWorker: vi.fn().mockResolvedValue(result),
      downloadImage,
      maxActiveCandidateIntents: 2,
    });
    const search = await service.search(dir, [], ARTIST_ID);

    const previews = search.candidates.map((candidate) =>
      service.loadPreview(dir, ARTIST_ID, candidate.candidateId),
    );

    await expect(previews[2]).resolves.toEqual({
      status: 'error',
      reason: 'busy',
    });
    expect(downloadImage).toHaveBeenCalledTimes(2);
    pendingDownload.resolve({
      status: 'ok',
      image: {
        buffer: pngBuffer(),
        extension: '.png',
        mimeType: 'image/png',
        width: 512,
        height: 512,
      },
    });
    await expect(Promise.all(previews.slice(0, 2))).resolves.toEqual([
      expect.objectContaining({ status: 'ok' }),
      expect.objectContaining({ status: 'ok' }),
    ]);
  });

  it('rate-limits repeated cached preview copies for one candidate', async () => {
    let currentTime = 1_000;
    const { service, downloadImage } = createService({
      now: () => currentTime,
      previewReuseDelayMs: 100,
    });
    const candidate = await searchOne(service);

    await expect(
      service.loadPreview(dir, ARTIST_ID, candidate.candidateId),
    ).resolves.toMatchObject({ status: 'ok' });
    await expect(
      service.loadPreview(dir, ARTIST_ID, candidate.candidateId),
    ).resolves.toEqual({ status: 'error', reason: 'busy' });

    currentTime += 100;
    await expect(
      service.loadPreview(dir, ARTIST_ID, candidate.candidateId),
    ).resolves.toMatchObject({ status: 'ok' });
    expect(downloadImage).toHaveBeenCalledOnce();
  });

  it('bounds distinct active image downloads and evicts older cached sessions by bytes', async () => {
    const pendingDownload = deferred();
    const firstObservation = observation();
    firstObservation.candidates.push({
      ...firstObservation.candidates[0],
      rank: 2,
      browseId: 'UC_candidate_2',
      name: 'Artist 2',
    });
    const runWorker = vi
      .fn()
      .mockResolvedValueOnce(firstObservation)
      .mockResolvedValue(observation());
    const downloadImage = vi
      .fn()
      .mockImplementationOnce(() => pendingDownload.promise)
      .mockResolvedValue({
        status: 'ok',
        image: {
          buffer: pngBuffer(),
          extension: '.png',
          mimeType: 'image/png',
          width: 512,
          height: 512,
        },
      });
    const { service } = createService({
      runWorker,
      downloadImage,
      maxActiveImageDownloads: 1,
      maxCachedImageBytes: pngBuffer().byteLength,
    });
    const firstSearch = await service.search(dir, [], ARTIST_ID);
    const firstLoad = service.loadPreview(
      dir,
      ARTIST_ID,
      firstSearch.candidates[0].candidateId,
    );

    await vi.waitFor(() => expect(downloadImage).toHaveBeenCalledOnce());
    await expect(
      service.loadPreview(
        dir,
        ARTIST_ID,
        firstSearch.candidates[1].candidateId,
      ),
    ).resolves.toEqual({ status: 'error', reason: 'image-unavailable' });
    pendingDownload.resolve({
      status: 'ok',
      image: {
        buffer: pngBuffer(),
        extension: '.png',
        mimeType: 'image/png',
        width: 512,
        height: 512,
      },
    });
    await expect(firstLoad).resolves.toMatchObject({ status: 'ok' });

    const secondSearch = await service.search(dir, [], ARTIST_ID);
    await expect(
      service.loadPreview(
        dir,
        ARTIST_ID,
        secondSearch.candidates[0].candidateId,
      ),
    ).resolves.toMatchObject({ status: 'ok' });
    await expect(
      service.loadPreview(
        dir,
        ARTIST_ID,
        firstSearch.candidates[0].candidateId,
      ),
    ).resolves.toEqual({ status: 'error', reason: 'candidate-unavailable' });
  });

  it('maps image loader exceptions to a bounded public failure', async () => {
    const { service } = createService({
      downloadImage: vi
        .fn()
        .mockRejectedValue(new Error('private network data')),
    });
    const candidate = await searchOne(service);

    await expect(
      service.loadPreview(dir, ARTIST_ID, candidate.candidateId),
    ).resolves.toEqual({ status: 'error', reason: 'image-unavailable' });
  });

  it('does not apply a session evicted while its image is downloading', async () => {
    const pendingDownload = deferred();
    const writePhoto = vi.fn();
    const { service, downloadImage } = createService({
      maxSessions: 1,
      writePhoto,
      downloadImage: vi.fn(() => pendingDownload.promise),
    });
    const firstCandidate = await searchOne(service);
    const applying = service.apply(
      dir,
      [],
      ARTIST_ID,
      firstCandidate.candidateId,
    );
    await vi.waitFor(() => expect(downloadImage).toHaveBeenCalledOnce());
    await searchOne(service);
    pendingDownload.resolve({
      status: 'ok',
      image: {
        buffer: pngBuffer(),
        extension: '.png',
        mimeType: 'image/png',
        width: 512,
        height: 512,
      },
    });

    await expect(applying).resolves.toEqual({
      status: 'error',
      reason: 'candidate-unavailable',
    });
    expect(writePhoto).not.toHaveBeenCalled();
  });

  it('does not apply a session evicted during the final context refresh', async () => {
    const finalContext = deferred();
    let contextCalls = 0;
    const artistIndexCache = {
      getPhotoSearchContext: vi.fn(async () => {
        contextCalls += 1;
        return contextCalls === 3 ? finalContext.promise : context();
      }),
    };
    const writePhoto = vi.fn();
    const { service } = createService({
      artistIndexCache,
      maxSessions: 1,
      writePhoto,
    });
    const firstCandidate = await searchOne(service);
    const applying = service.apply(
      dir,
      () => [],
      ARTIST_ID,
      firstCandidate.candidateId,
    );
    await vi.waitFor(() => expect(contextCalls).toBe(3));
    await searchOne(service);
    finalContext.resolve(context());

    await expect(applying).resolves.toEqual({
      status: 'error',
      reason: 'candidate-unavailable',
    });
    expect(writePhoto).not.toHaveBeenCalled();
  });

  it('does not apply a session that expires during the final context refresh', async () => {
    const finalContext = deferred();
    let contextCalls = 0;
    let currentTime = 1_000;
    const artistIndexCache = {
      getPhotoSearchContext: vi.fn(async () => {
        contextCalls += 1;
        return contextCalls === 3 ? finalContext.promise : context();
      }),
    };
    const writePhoto = vi.fn();
    const { service } = createService({
      artistIndexCache,
      now: () => currentTime,
      ttlMs: 100,
      writePhoto,
    });
    const candidate = await searchOne(service);
    const applying = service.apply(
      dir,
      () => [],
      ARTIST_ID,
      candidate.candidateId,
    );
    await vi.waitFor(() => expect(contextCalls).toBe(3));
    currentTime += 101;
    finalContext.resolve(context());

    await expect(applying).resolves.toEqual({
      status: 'error',
      reason: 'candidate-unavailable',
    });
    expect(writePhoto).not.toHaveBeenCalled();
  });

  it('re-reads main-owned tracks for the final apply fingerprint', async () => {
    let currentTracks = [{ revision: 'before' }];
    const getTracks = vi.fn(() => currentTracks);
    const artistIndexCache = {
      getPhotoSearchContext: vi.fn(async (_dir, tracks) =>
        context(tracks[0]?.revision ?? 'missing'),
      ),
    };
    const pendingDownload = deferred();
    const writePhoto = vi.fn();
    const { service, downloadImage } = createService({
      artistIndexCache,
      writePhoto,
      downloadImage: vi.fn(() => pendingDownload.promise),
    });
    const search = await service.search(dir, getTracks, ARTIST_ID);
    const applying = service.apply(
      dir,
      getTracks,
      ARTIST_ID,
      search.candidates[0].candidateId,
    );
    await vi.waitFor(() => expect(downloadImage).toHaveBeenCalledOnce());
    currentTracks = [{ revision: 'after' }];
    pendingDownload.resolve({
      status: 'ok',
      image: {
        buffer: pngBuffer(),
        extension: '.png',
        mimeType: 'image/png',
        width: 512,
        height: 512,
      },
    });

    await expect(applying).resolves.toEqual({
      status: 'error',
      reason: 'candidate-stale',
    });
    expect(getTracks).toHaveBeenCalledTimes(4);
    expect(writePhoto).not.toHaveBeenCalled();
  });

  it('rejects a track snapshot changed during the final fresh context read', async () => {
    let currentTracks = [{ revision: 'before' }];
    const getTracks = vi.fn(() => currentTracks);
    const finalContext = deferred();
    const artistIndexCache = {
      getPhotoSearchContext: vi.fn((_dir, tracks, _artistId, options) => {
        if (options?.fresh) return finalContext.promise;
        return Promise.resolve(context(tracks[0]?.revision ?? 'missing'));
      }),
    };
    const writePhoto = vi.fn();
    const { service } = createService({ artistIndexCache, writePhoto });
    const search = await service.search(dir, getTracks, ARTIST_ID);
    const applying = service.apply(
      dir,
      getTracks,
      ARTIST_ID,
      search.candidates[0].candidateId,
    );
    await vi.waitFor(() =>
      expect(artistIndexCache.getPhotoSearchContext).toHaveBeenCalledTimes(3),
    );

    currentTracks = [{ revision: 'after' }];
    finalContext.resolve(context('before'));

    await expect(applying).resolves.toEqual({
      status: 'error',
      reason: 'candidate-stale',
    });
    expect(getTracks).toHaveBeenCalledTimes(4);
    expect(writePhoto).not.toHaveBeenCalled();
  });

  it('rejects concurrent apply fan-out for the same candidate', async () => {
    const pendingDownload = deferred();
    const artistIndexCache = {
      getPhotoSearchContext: vi.fn().mockResolvedValue(context()),
    };
    const writePhoto = vi.fn();
    const { service, downloadImage } = createService({
      artistIndexCache,
      writePhoto,
      downloadImage: vi.fn(() => pendingDownload.promise),
    });
    const candidate = await searchOne(service);

    const applying = Array.from({ length: 20 }, () =>
      service.apply(dir, [], ARTIST_ID, candidate.candidateId),
    );
    await vi.waitFor(() => expect(downloadImage).toHaveBeenCalledOnce());

    expect(artistIndexCache.getPhotoSearchContext).toHaveBeenCalledTimes(2);
    pendingDownload.resolve({
      status: 'ok',
      image: {
        buffer: pngBuffer(),
        extension: '.png',
        mimeType: 'image/png',
        width: 512,
        height: 512,
      },
    });
    const results = await Promise.all(applying);

    expect(results.filter((result) => result.changed)).toHaveLength(1);
    expect(results.filter((result) => result.reason === 'busy')).toHaveLength(
      19,
    );
    expect(
      artistIndexCache.getPhotoSearchContext.mock.calls.filter(
        ([, , , options]) => options?.fresh,
      ),
    ).toHaveLength(1);
    expect(writePhoto).toHaveBeenCalledOnce();
  });

  it('allows explicit apply to replace a removal marker but lets a new local photo win the race', async () => {
    clearArtistPhoto(dir, ARTIST_ID);
    expect(isArtistPhotoRemoved(dir, ARTIST_ID)).toBe(true);
    const first = createService();
    const candidate = await searchOne(first.service);
    await expect(
      first.service.apply(dir, [], ARTIST_ID, candidate.candidateId),
    ).resolves.toEqual({ status: 'ok', changed: true });
    expect(isArtistPhotoRemoved(dir, ARTIST_ID)).toBe(false);

    fs.rmSync(path.join(dir, 'artists', ARTIST_ID), {
      recursive: true,
      force: true,
    });
    let second;
    const downloadImage = vi.fn(async () => {
      writeArtistPhoto(dir, ARTIST_ID, {
        buffer: pngBuffer(128, 128),
        extension: '.png',
        source: 'local-file',
      });
      return second.downloadImageResult;
    });
    second = createService({
      downloadImage,
      downloadImageResult: {
        status: 'ok',
        image: {
          buffer: pngBuffer(),
          extension: '.png',
          mimeType: 'image/png',
        },
      },
    });
    const racedCandidate = await searchOne(second.service);
    await expect(
      second.service.apply(dir, [], ARTIST_ID, racedCandidate.candidateId),
    ).resolves.toEqual({ status: 'ok', changed: false });
    expect(readArtistPhoto(dir, ARTIST_ID).source).toBe('local-file');
  });

  it('rechecks artist context after image download before writing', async () => {
    const pendingDownload = deferred();
    const artistIndexCache = {
      getPhotoSearchContext: vi
        .fn()
        .mockResolvedValueOnce(context('Artist'))
        .mockResolvedValueOnce(context('Artist'))
        .mockResolvedValueOnce(context('Artist changed')),
    };
    const writePhoto = vi.fn();
    const { service, downloadImage } = createService({
      artistIndexCache,
      writePhoto,
      downloadImage: vi.fn(() => pendingDownload.promise),
    });
    const candidate = await searchOne(service);

    const applying = service.apply(dir, [], ARTIST_ID, candidate.candidateId);
    await vi.waitFor(() => expect(downloadImage).toHaveBeenCalledOnce());
    pendingDownload.resolve({
      status: 'ok',
      image: {
        buffer: pngBuffer(),
        extension: '.png',
        mimeType: 'image/png',
        width: 512,
        height: 512,
      },
    });

    await expect(applying).resolves.toEqual({
      status: 'error',
      reason: 'candidate-stale',
    });
    expect(writePhoto).not.toHaveBeenCalled();
  });

  it('expires and bounds sessions and rejects cross-artist or changed-context use', async () => {
    let currentTime = 1_000;
    let sequence = 0;
    const contexts = new Map([
      [ARTIST_ID, context('Artist')],
      [OTHER_ARTIST_ID, context('Other')],
    ]);
    const artistIndexCache = {
      getPhotoSearchContext: vi.fn(async (_dir, _tracks, artistId) =>
        contexts.get(artistId),
      ),
    };
    const { service } = createService({
      artistIndexCache,
      now: () => currentTime,
      ttlMs: 100,
      maxSessions: 2,
      createCandidateId: () =>
        `candidate_${String(++sequence).padStart(20, '0')}`,
    });
    const first = await searchOne(service);
    await expect(
      service.loadPreview(dir, OTHER_ARTIST_ID, first.candidateId),
    ).resolves.toEqual({ status: 'error', reason: 'candidate-unavailable' });

    contexts.set(ARTIST_ID, context('Artist changed'));
    await expect(
      service.apply(dir, [], ARTIST_ID, first.candidateId),
    ).resolves.toEqual({ status: 'error', reason: 'candidate-stale' });

    contexts.set(ARTIST_ID, context('Artist'));
    const expiring = await searchOne(service);
    currentTime += 101;
    await expect(
      service.loadPreview(dir, ARTIST_ID, expiring.candidateId),
    ).resolves.toEqual({ status: 'error', reason: 'candidate-unavailable' });

    currentTime += 1;
    const keptA = await searchOne(service);
    const keptB = await searchOne(service);
    const newest = await searchOne(service);
    await expect(
      service.loadPreview(dir, ARTIST_ID, keptA.candidateId),
    ).resolves.toEqual({ status: 'error', reason: 'candidate-unavailable' });
    await expect(
      service.loadPreview(dir, ARTIST_ID, keptB.candidateId),
    ).resolves.toMatchObject({ status: 'ok' });
    await expect(
      service.loadPreview(dir, ARTIST_ID, newest.candidateId),
    ).resolves.toMatchObject({ status: 'ok' });
  });

  it('retries only transient failures and opens an immediate global breaker on 429', async () => {
    let currentTime = 1_000;
    const runWorker = vi
      .fn()
      .mockResolvedValueOnce({ status: 'error', reason: 'timeout' })
      .mockResolvedValueOnce(observation())
      .mockResolvedValueOnce({ status: 'error', reason: 'provider-rejected' })
      .mockResolvedValueOnce({ status: 'error', reason: 'rate-limited' });
    const { service } = createService({
      runWorker,
      now: () => currentTime,
      retryDelayMs: 0,
      rateLimitCooldownMs: 500,
    });

    await expect(service.search(dir, [], ARTIST_ID)).resolves.toMatchObject({
      status: 'ok',
    });
    expect(runWorker).toHaveBeenCalledTimes(2);
    await expect(service.search(dir, [], ARTIST_ID)).resolves.toEqual({
      status: 'error',
      reason: 'provider-rejected',
    });
    expect(runWorker).toHaveBeenCalledTimes(3);
    await expect(service.search(dir, [], ARTIST_ID)).resolves.toEqual({
      status: 'error',
      reason: 'rate-limited',
    });
    await expect(service.search(dir, [], ARTIST_ID)).resolves.toEqual({
      status: 'error',
      reason: 'circuit-open',
    });
    expect(runWorker).toHaveBeenCalledTimes(4);
    currentTime += 501;
    runWorker.mockResolvedValueOnce({ status: 'no-match', candidates: [] });
    await expect(service.search(dir, [], ARTIST_ID)).resolves.toEqual({
      status: 'no-match',
      candidates: [],
    });
  });

  it('resets consecutive operational failures after a normal no-match', async () => {
    const runWorker = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'error',
        reason: 'provider-rejected',
      })
      .mockResolvedValueOnce({ status: 'no-match', candidates: [] })
      .mockResolvedValueOnce({
        status: 'error',
        reason: 'provider-rejected',
      })
      .mockResolvedValueOnce({
        status: 'error',
        reason: 'provider-rejected',
      })
      .mockResolvedValueOnce(observation());
    const { service } = createService({ runWorker });

    await service.search(dir, [], ARTIST_ID);
    await expect(service.search(dir, [], ARTIST_ID)).resolves.toEqual({
      status: 'no-match',
      candidates: [],
    });
    await service.search(dir, [], ARTIST_ID);
    await service.search(dir, [], ARTIST_ID);
    await expect(service.search(dir, [], ARTIST_ID)).resolves.toMatchObject({
      status: 'ok',
    });
    expect(runWorker).toHaveBeenCalledTimes(5);
  });

  it('opens the rate-limit cooldown even when prior candidates are preserved', async () => {
    const partial = observation({
      status: 'partial',
      reason: 'rate-limited',
    });
    const runWorker = vi.fn().mockResolvedValue(partial);
    const { service } = createService({ runWorker });

    await expect(service.search(dir, [], ARTIST_ID)).resolves.toMatchObject({
      status: 'partial',
      reason: 'rate-limited',
      candidates: expect.any(Array),
    });
    await expect(service.search(dir, [], ARTIST_ID)).resolves.toEqual({
      status: 'error',
      reason: 'circuit-open',
    });
    expect(runWorker).toHaveBeenCalledOnce();
  });

  it('cancels while artist context is loading without starting the worker', async () => {
    const pendingContext = deferred();
    const { service, runWorker } = createService({
      artistIndexCache: {
        getPhotoSearchContext: vi.fn(() => pendingContext.promise),
      },
    });

    const search = service.search(dir, [], ARTIST_ID);
    expect(service.cancel(ARTIST_ID, dir)).toEqual({ status: 'ok' });
    pendingContext.resolve(context());

    await expect(search).resolves.toEqual({
      status: 'error',
      reason: 'cancelled',
    });
    expect(runWorker).not.toHaveBeenCalled();
  });

  it('keeps the newest same-artist search while context work is serialized', async () => {
    const firstContext = deferred();
    const secondContext = deferred();
    const artistIndexCache = {
      getPhotoSearchContext: vi
        .fn()
        .mockImplementationOnce(() => firstContext.promise)
        .mockImplementationOnce(() => secondContext.promise),
    };
    const { service, runWorker } = createService({ artistIndexCache });

    const first = service.search(dir, [], ARTIST_ID);
    await vi.waitFor(() =>
      expect(artistIndexCache.getPhotoSearchContext).toHaveBeenCalledOnce(),
    );
    const second = service.search(dir, [], ARTIST_ID);
    firstContext.resolve(context());
    await expect(first).resolves.toEqual({
      status: 'error',
      reason: 'cancelled',
    });
    await vi.waitFor(() =>
      expect(artistIndexCache.getPhotoSearchContext).toHaveBeenCalledTimes(2),
    );
    secondContext.resolve(context());
    await expect(second).resolves.toMatchObject({ status: 'ok' });
    expect(runWorker).toHaveBeenCalledOnce();
  });

  it('bounds context derivation inside the default request queue', async () => {
    const pendingContext = deferred();
    const artistIndexCache = {
      getPhotoSearchContext: vi.fn(() => pendingContext.promise),
    };
    const { service } = createService({
      artistIndexCache,
      scheduler: undefined,
    });
    const artistIds = Array.from(
      { length: 5 },
      (_, index) => `artist-${String(index).padStart(16, '0')}`,
    );

    const searches = artistIds.map((artistId) =>
      service.search(dir, () => [], artistId),
    );
    await vi.waitFor(() =>
      expect(artistIndexCache.getPhotoSearchContext).toHaveBeenCalledOnce(),
    );
    await expect(searches[4]).resolves.toEqual({
      status: 'error',
      reason: 'busy',
    });
    expect(artistIndexCache.getPhotoSearchContext).toHaveBeenCalledOnce();

    for (const artistId of artistIds.slice(0, 4)) {
      service.cancel(artistId, dir);
    }
    pendingContext.resolve(context());
    await Promise.all(searches.slice(0, 4));
  });

  it('serializes searches and supports explicit cancellation', async () => {
    let releaseFirst;
    const runWorker = vi
      .fn()
      .mockImplementationOnce(
        (_request, { signal }) =>
          new Promise((resolve) => {
            releaseFirst = () => resolve(observation());
            signal.addEventListener('abort', () =>
              resolve({ status: 'error', reason: 'cancelled' }),
            );
          }),
      )
      .mockResolvedValue(observation());
    const { service } = createService({ runWorker });

    const first = service.search(dir, [], ARTIST_ID);
    const second = service.search(dir, [], OTHER_ARTIST_ID);
    await vi.waitFor(() => expect(runWorker).toHaveBeenCalledTimes(1));
    expect(service.cancel(ARTIST_ID)).toEqual({ status: 'ok' });
    await expect(first).resolves.toEqual({
      status: 'error',
      reason: 'cancelled',
    });
    await expect(second).resolves.toMatchObject({ status: 'ok' });
    releaseFirst?.();
  });
});

describe('isAllowedYtMusicPortraitUrl', () => {
  it.each([
    ['https://yt3.googleusercontent.com/a', true],
    ['https://yt3.ggpht.com/a', true],
    ['https://lh3.googleusercontent.com/a', true],
    ['http://yt3.googleusercontent.com/a', false],
    ['https://yt3.googleusercontent.com.evil.test/a', false],
    ['https://user@yt3.googleusercontent.com/a', false],
    ['not-a-url', false],
  ])('validates %s', (url, expected) => {
    expect(isAllowedYtMusicPortraitUrl(url)).toBe(expected);
  });
});
