import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLyricsAcquisitionService } from './lyricsAcquisitionService.js';
import { saveTrackLyricsText } from '../lib/library/lyrics.js';
import { fingerprintLrclibRecord } from '../lib/lrclib/record.js';

function record(overrides = {}) {
  return {
    id: 42,
    name: 'Song - Artist',
    trackName: 'Song',
    artistName: 'Artist',
    albumName: 'Album',
    duration: 180,
    instrumental: false,
    plainLyrics: 'Hello',
    syncedLyrics: '[00:01.000]Hello',
    lyricsfile: null,
    ...overrides,
  };
}

const track = { title: 'Song', artist: 'Artist', duration: 180 };

function client(overrides = {}) {
  return {
    getExact: vi.fn().mockResolvedValue({ status: 'ok', record: record() }),
    search: vi
      .fn()
      .mockResolvedValue({ status: 'ok', records: [], invalidRecordCount: 0 }),
    searchBroad: vi
      .fn()
      .mockResolvedValue({ status: 'ok', records: [], invalidRecordCount: 0 }),
    getById: vi.fn().mockResolvedValue({ status: 'ok', record: record() }),
    ...overrides,
  };
}

describe('createLyricsAcquisitionService', () => {
  let rootDir;
  let trackDir;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-lyrics-service-'),
    );
    trackDir = path.join(rootDir, 'tracks', 'track');
    fs.mkdirSync(trackDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('checks the lyrics gate before every manual provider operation', async () => {
    const requireFeatureGate = vi.fn();
    const provider = client();
    const service = createLyricsAcquisitionService({
      requireFeatureGate,
      featureId: 'lyrics-flow',
      client: provider,
    });

    await service.searchCandidates(track);
    await service.fetchRecord(42);

    expect(requireFeatureGate).toHaveBeenCalledTimes(2);
    expect(requireFeatureGate).toHaveBeenNthCalledWith(1, 'lyrics-flow');
    expect(provider.getExact).toHaveBeenCalledOnce();
    expect(provider.getById).toHaveBeenCalledOnce();
  });

  it('rejects concurrent manual searches before they grow the provider queue', async () => {
    let resolveExact;
    const provider = client({
      getExact: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveExact = resolve;
          }),
      ),
    });
    const logger = { warn: vi.fn(), error: vi.fn() };
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
      logger,
    });

    const first = service.searchCandidates(track);
    await vi.waitFor(() => expect(provider.getExact).toHaveBeenCalledOnce());
    await expect(service.searchCandidates(track)).resolves.toMatchObject({
      status: 'error',
      reason: 'busy',
      candidates: [],
    });
    expect(provider.getExact).toHaveBeenCalledOnce();

    resolveExact({ status: 'ok', record: record() });
    await first;
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs typed provider failures once without exposing track metadata', async () => {
    const provider = client({
      getExact: vi.fn().mockResolvedValue({
        status: 'error',
        reason: 'http-error',
        httpStatus: 503,
      }),
    });
    const logger = { warn: vi.fn(), error: vi.fn() };
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
      logger,
    });

    await expect(service.searchCandidates(track)).resolves.toMatchObject({
      status: 'error',
      reason: 'http-error',
      httpStatus: 503,
    });

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      '[lyrics] LRCLIB search failed',
      expect.any(Error),
      { reason: 'http-error', httpStatus: 503, retryable: true },
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('Song');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('Artist');
  });

  it('logs unexpected provider exceptions once and rethrows them', async () => {
    const failure = new Error('socket closed');
    const provider = client({
      getExact: vi.fn().mockRejectedValue(failure),
    });
    const logger = { warn: vi.fn(), error: vi.fn() };
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
      logger,
    });

    await expect(service.searchCandidates(track)).rejects.toBe(failure);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      '[lyrics] LRCLIB search failed',
      expect.objectContaining({
        message: 'LRCLIB search failed: exception',
      }),
      { reason: 'exception', retryable: true },
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      failure.message,
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs save-time provider failures at the main acquisition boundary', async () => {
    const provider = client({
      getById: vi.fn().mockResolvedValue({
        status: 'error',
        reason: 'service-unavailable',
      }),
    });
    const logger = { warn: vi.fn(), error: vi.fn() };
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
      logger,
    });

    await expect(
      service.saveCandidate({
        track,
        trackDir,
        candidateId: 42,
        expectedFingerprint: fingerprintLrclibRecord(record()),
      }),
    ).resolves.toMatchObject({
      status: 'error',
      reason: 'service-unavailable',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      '[lyrics] LRCLIB save failed',
      expect.any(Error),
      { reason: 'service-unavailable', retryable: true },
    );
  });

  it('issues zero requests when the lyrics gate is closed', async () => {
    const provider = client();
    const service = createLyricsAcquisitionService({
      requireFeatureGate() {
        throw new Error('gate closed');
      },
      featureId: 'lyrics-flow',
      client: provider,
    });

    await expect(service.searchCandidates(track)).rejects.toThrow(
      /gate closed/,
    );
    await expect(service.fetchRecord(42)).rejects.toThrow(/gate closed/);
    await expect(service.saveIfAbsent(track, trackDir)).rejects.toThrow(
      /gate closed/,
    );

    expect(provider.getExact).not.toHaveBeenCalled();
    expect(provider.search).not.toHaveBeenCalled();
    expect(provider.getById).not.toHaveBeenCalled();
  });

  it('skips the gate and network when the track already has an LRCLIB source', async () => {
    saveTrackLyricsText(
      trackDir,
      { filename: 'lrclib-42.lrc', language: 'und', kind: 'lrclib' },
      '[00:01.000]Hello',
    );
    const requireFeatureGate = vi.fn();
    const provider = client();
    const service = createLyricsAcquisitionService({
      requireFeatureGate,
      featureId: 'lyrics-flow',
      client: provider,
    });

    await expect(service.saveIfAbsent(track, trackDir)).resolves.toBe(false);
    expect(requireFeatureGate).not.toHaveBeenCalled();
    expect(provider.getExact).not.toHaveBeenCalled();
  });

  it('can create its default client without starting provider work', async () => {
    saveTrackLyricsText(
      trackDir,
      { filename: 'lrclib-42.lrc', language: 'und', kind: 'lrclib' },
      '[00:01.000]Hello',
    );
    const requireFeatureGate = vi.fn();
    const service = createLyricsAcquisitionService({
      requireFeatureGate,
      featureId: 'lyrics-flow',
    });

    await expect(service.saveIfAbsent(track, trackDir)).resolves.toBe(false);
    expect(requireFeatureGate).not.toHaveBeenCalled();
  });

  it('uses the shared client for bounded automatic acquisition and storage', async () => {
    const provider = client();
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
    });

    await expect(service.saveIfAbsent(track, trackDir)).resolves.toBe(true);
    expect(provider.getExact).toHaveBeenCalledOnce();
    expect(provider.search).not.toHaveBeenCalled();
    expect(
      fs.existsSync(
        path.join(trackDir, 'lyrics', 'providers', 'lrclib-42.json'),
      ),
    ).toBe(true);
  });

  it('does not publish an automatic source when no safe match exists', async () => {
    const provider = client({
      getExact: vi
        .fn()
        .mockResolvedValue({ status: 'unavailable', reason: 'not-found' }),
    });
    const logger = { warn: vi.fn(), error: vi.fn() };
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
      logger,
    });

    await expect(service.saveIfAbsent(track, trackDir)).resolves.toBe(false);
    expect(provider.search).toHaveBeenCalledOnce();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reuses the same gated client for save re-fetch', async () => {
    const provider = client();
    const requireFeatureGate = vi.fn();
    const service = createLyricsAcquisitionService({
      requireFeatureGate,
      featureId: 'lyrics-flow',
      client: provider,
    });

    await expect(
      service.saveCandidate({
        track,
        trackDir,
        candidateId: 42,
        expectedFingerprint: fingerprintLrclibRecord(record()),
      }),
    ).resolves.toMatchObject({
      status: 'saved',
      source: { filename: 'lrclib-42.lrc' },
    });
    expect(requireFeatureGate).toHaveBeenCalledWith('lyrics-flow');
    expect(provider.getById).toHaveBeenCalledOnce();
  });

  it('rejects concurrent candidate saves before a second provider fetch', async () => {
    let resolveRecord;
    const provider = client({
      getById: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRecord = resolve;
          }),
      ),
    });
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
    });
    const options = {
      track,
      trackDir,
      candidateId: 42,
      expectedFingerprint: fingerprintLrclibRecord(record()),
    };

    const first = service.saveCandidate(options);
    await vi.waitFor(() => expect(provider.getById).toHaveBeenCalledOnce());
    await expect(service.saveCandidate(options)).resolves.toMatchObject({
      status: 'error',
      reason: 'busy',
    });
    expect(provider.getById).toHaveBeenCalledOnce();

    resolveRecord({ status: 'ok', record: record() });
    await expect(first).resolves.toMatchObject({ status: 'saved' });
  });
});
