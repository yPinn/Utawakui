import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLyricsAcquisitionService } from './lyricsAcquisitionService.js';
import { saveTrackLyricsText } from '../lib/library/lyrics.js';
import {
  computeLyricsSourceFingerprint,
  saveTrackLyricsTiming,
} from '../lib/library/lyricsTiming.js';
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

const track = { id: 'track', title: 'Song', artist: 'Artist', duration: 180 };

function unavailableNeteaseProvider(overrides = {}) {
  return {
    searchCandidates: vi.fn().mockResolvedValue({
      provider: 'netease',
      status: 'unavailable',
      reason: 'not-found',
      candidates: [],
      groups: null,
    }),
    saveCandidate: vi.fn(),
    ...overrides,
  };
}

function saveFullT2Source(targetTrackDir, filename = 'netease-99.lrc') {
  saveTrackLyricsText(
    targetTrackDir,
    { filename, language: 'und', kind: 'netease' },
    '[00:01.000]Hello',
  );
  const sourceSha256 = computeLyricsSourceFingerprint(targetTrackDir, filename);
  saveTrackLyricsTiming(targetTrackDir, filename, sourceSha256, {
    schemaVersion: 1,
    documentId: 'netease:99',
    normalizerProfileId: 'lyrics-source-v2',
    source: { filename, sha256: sourceSha256 },
    granularity: 'T2',
    lines: [
      {
        lineId: 'l1',
        text: 'Hello',
        startMs: 1000,
        endMs: 2000,
        segments: [
          {
            segmentId: 's1',
            text: 'Hello',
            startMs: 1000,
            endMs: 2000,
          },
        ],
      },
    ],
  });
}

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
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'audio');
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

  it('routes allowlisted NetEase and Better Lyrics providers through the same lyrics gate', async () => {
    const requireFeatureGate = vi.fn();
    const neteaseProvider = {
      searchCandidates: vi.fn().mockResolvedValue({
        provider: 'netease',
        status: 'ok',
        candidates: [],
        groups: { best: [], related: [] },
      }),
      saveCandidate: vi.fn().mockResolvedValue({
        provider: 'netease',
        status: 'saved',
      }),
    };
    const betterLyricsProvider = {
      searchCandidates: vi.fn().mockResolvedValue({
        provider: 'betterlyrics',
        status: 'ok',
        candidates: [],
        groups: { best: [], related: [] },
      }),
      saveCandidate: vi.fn().mockResolvedValue({
        provider: 'betterlyrics',
        status: 'saved',
      }),
    };
    const service = createLyricsAcquisitionService({
      requireFeatureGate,
      featureId: 'lyrics-flow',
      client: client(),
      neteaseProvider,
      betterLyricsProvider,
    });

    await service.searchProviderCandidates('netease', track);
    await service.saveProviderCandidate('netease', {
      track,
      trackDir,
      candidateId: 42,
      expectedFingerprint: 'a'.repeat(64),
    });
    await service.searchProviderCandidates('betterlyrics', track);
    await service.saveProviderCandidate('betterlyrics', {
      track,
      trackDir,
      candidateId: 44,
      expectedFingerprint: 'c'.repeat(64),
    });

    expect(requireFeatureGate).toHaveBeenCalledTimes(4);
    expect(neteaseProvider.searchCandidates).toHaveBeenCalledWith(track, {
      signal: expect.any(AbortSignal),
    });
    expect(neteaseProvider.saveCandidate).toHaveBeenCalledWith({
      track,
      trackDir,
      candidateId: 42,
      expectedFingerprint: 'a'.repeat(64),
    });
    expect(betterLyricsProvider.searchCandidates).toHaveBeenCalledWith(track, {
      signal: expect.any(AbortSignal),
    });
    expect(betterLyricsProvider.saveCandidate).toHaveBeenCalledWith({
      track,
      trackDir,
      candidateId: 44,
      expectedFingerprint: 'c'.repeat(64),
    });
    await expect(
      service.searchProviderCandidates('amll', track),
    ).rejects.toThrow(/provider is invalid/i);
    await expect(
      service.saveProviderCandidate('amll', {
        track,
        trackDir,
        candidateId: 43,
        expectedFingerprint: 'b'.repeat(64),
      }),
    ).rejects.toThrow(/provider is invalid/i);
    await expect(
      service.searchProviderCandidates('unknown-provider', track),
    ).rejects.toThrow(/provider is invalid/i);
  });

  it('deduplicates identical concurrent manual searches', async () => {
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
    const second = service.searchCandidates(track);
    expect(provider.getExact).toHaveBeenCalledOnce();

    resolveExact({ status: 'ok', record: record() });
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(secondResult).toEqual(firstResult);
    expect(provider.search).toHaveBeenCalledOnce();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('fans out all-provider search in parallel and returns source-neutral groups', async () => {
    let resolveExact;
    let resolveNetease;
    const provider = client({
      getExact: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveExact = resolve;
          }),
      ),
    });
    const neteaseProvider = {
      searchCandidates: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveNetease = resolve;
          }),
      ),
      saveCandidate: vi.fn(),
    };
    const betterLyricsProvider = {
      searchCandidates: vi.fn().mockResolvedValue({
        provider: 'betterlyrics',
        status: 'unavailable',
        reason: 'cache-miss',
        candidates: [],
      }),
      saveCandidate: vi.fn(),
    };
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
      neteaseProvider,
      betterLyricsProvider,
    });

    const pending = service.searchProviderCandidates('all', track);
    await vi.waitFor(() => {
      expect(provider.getExact).toHaveBeenCalledOnce();
      expect(neteaseProvider.searchCandidates).toHaveBeenCalledOnce();
      expect(betterLyricsProvider.searchCandidates).toHaveBeenCalledOnce();
    });
    resolveExact({ status: 'unavailable', reason: 'not-found' });
    resolveNetease({
      provider: 'netease',
      status: 'ok',
      candidates: [
        {
          id: 9,
          trackName: 'Song',
          artistName: 'Artist',
          albumName: 'Album',
          duration: 180,
          capability: { level: 'T2', partial: false },
          compatibility: { t0: true, t1: true, t2: true },
          warnings: [],
          previewLines: [{ start: 1, text: 'Word' }],
          previewFingerprint: 'b'.repeat(64),
          matchBand: 'exact',
        },
      ],
      groups: null,
      invalidRecordCount: 0,
    });

    await expect(pending).resolves.toMatchObject({
      provider: 'all',
      status: 'ok',
      partial: true,
      candidates: [{ providerId: 'netease', candidateKey: 'netease:9' }],
      recordingGroups: {
        best: [{ recommendedCandidateKey: 'netease:9' }],
        related: [],
      },
    });
  });

  it('contains an unexpected all-provider exception as a partial result', async () => {
    const neteaseProvider = unavailableNeteaseProvider({
      searchCandidates: vi.fn().mockRejectedValue(new Error('private path')),
    });
    const betterLyricsProvider = {
      searchCandidates: vi.fn().mockResolvedValue({
        provider: 'betterlyrics',
        status: 'unavailable',
        reason: 'cache-miss',
        candidates: [],
      }),
      saveCandidate: vi.fn(),
    };
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: client(),
      neteaseProvider,
      betterLyricsProvider,
      logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });

    await expect(
      service.searchProviderCandidates('all', track),
    ).resolves.toMatchObject({
      provider: 'all',
      status: 'ok',
      partial: true,
      providerStatuses: expect.arrayContaining([
        {
          provider: 'netease',
          status: 'error',
          reason: 'service-unavailable',
        },
      ]),
    });
  });

  it('reuses a short-lived successful discovery result', async () => {
    const provider = client({
      getExact: vi
        .fn()
        .mockResolvedValue({ status: 'unavailable', reason: 'not-found' }),
    });
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
    });

    const first = await service.searchCandidates(track, {
      query: { title: 'Song', artist: 'Artist' },
    });
    const searchCallsAfterFirst = provider.search.mock.calls.length;
    const second = await service.searchCandidates(track, {
      query: { title: 'Song', artist: 'Artist' },
    });

    expect(second).toEqual(first);
    expect(provider.getExact).toHaveBeenCalledOnce();
    expect(provider.search).toHaveBeenCalledTimes(searchCallsAfterFirst);
  });

  it('aborts a superseded provider query while preserving the newer search', async () => {
    let firstSignal;
    const provider = client({
      getExact: vi
        .fn()
        .mockImplementationOnce(
          (_query, options) =>
            new Promise((resolve) => {
              firstSignal = options.signal;
              options.signal.addEventListener(
                'abort',
                () => resolve({ status: 'error', reason: 'timeout' }),
                { once: true },
              );
            }),
        )
        .mockResolvedValueOnce({
          status: 'unavailable',
          reason: 'not-found',
        }),
    });
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
    });

    const first = service.searchCandidates(track, {
      query: { title: 'First', artist: 'Artist' },
    });
    await vi.waitFor(() => expect(firstSignal).toBeDefined());
    const second = service.searchCandidates(track, {
      query: { title: 'Second', artist: 'Artist' },
    });

    expect(firstSignal.aborted).toBe(true);
    await expect(first).resolves.toMatchObject({
      status: 'error',
      reason: 'timeout',
    });
    await expect(second).resolves.toMatchObject({ status: 'ok' });
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
    await expect(service.acquireBestIfNeeded(track, trackDir)).rejects.toThrow(
      /gate closed/,
    );

    expect(provider.getExact).not.toHaveBeenCalled();
    expect(provider.search).not.toHaveBeenCalled();
    expect(provider.getById).not.toHaveBeenCalled();
  });

  it('skips the gate and network when the track already has full T2 lyrics', async () => {
    saveFullT2Source(trackDir);
    const requireFeatureGate = vi.fn();
    const provider = client();
    const neteaseProvider = unavailableNeteaseProvider();
    const service = createLyricsAcquisitionService({
      requireFeatureGate,
      featureId: 'lyrics-flow',
      client: provider,
      neteaseProvider,
    });

    await expect(service.acquireBestIfNeeded(track, trackDir)).resolves.toEqual(
      { status: 'skipped', reason: 'current-t2' },
    );
    expect(requireFeatureGate).not.toHaveBeenCalled();
    expect(provider.getExact).not.toHaveBeenCalled();
    expect(neteaseProvider.searchCandidates).not.toHaveBeenCalled();
  });

  it('can create its default client without starting provider work', async () => {
    saveFullT2Source(trackDir);
    const requireFeatureGate = vi.fn();
    const service = createLyricsAcquisitionService({
      requireFeatureGate,
      featureId: 'lyrics-flow',
    });

    await expect(service.acquireBestIfNeeded(track, trackDir)).resolves.toEqual(
      { status: 'skipped', reason: 'current-t2' },
    );
    expect(requireFeatureGate).not.toHaveBeenCalled();
  });

  it('uses the shared client and save-time refetch for automatic acquisition', async () => {
    const provider = client();
    const neteaseProvider = unavailableNeteaseProvider();
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
      neteaseProvider,
    });

    await expect(
      service.acquireBestIfNeeded(track, trackDir),
    ).resolves.toMatchObject({
      status: 'saved',
      provider: 'lrclib',
      source: { filename: 'lrclib-42.lrc' },
    });
    expect(provider.getExact).toHaveBeenCalledOnce();
    expect(provider.getById).toHaveBeenCalledOnce();
    expect(
      fs.existsSync(
        path.join(trackDir, 'lyrics', 'providers', 'lrclib-42.json'),
      ),
    ).toBe(true);
  });

  it('invokes the automatic save completion callback without provider payload', async () => {
    const onSaved = vi.fn();
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: client(),
      neteaseProvider: unavailableNeteaseProvider(),
    });

    await expect(
      service.scheduleAutomaticAcquisition(track, trackDir, { onSaved }),
    ).resolves.toMatchObject({ status: 'saved' });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onSaved).toHaveBeenCalledWith();
  });

  it('still reports a committed source when automatic preference persistence fails', async () => {
    const onSaved = vi.fn();
    const logger = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const setAutomaticPreference = vi.fn(() => {
      throw new Error('disk full at a private path');
    });
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: client(),
      neteaseProvider: unavailableNeteaseProvider(),
      logger,
      setAutomaticPreference,
    });

    await expect(
      service.scheduleAutomaticAcquisition(track, trackDir, { onSaved }),
    ).resolves.toMatchObject({ status: 'saved' });
    expect(setAutomaticPreference).toHaveBeenCalledOnce();
    expect(onSaved).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      '[lyrics] automatic acquisition failed',
      expect.any(Error),
      { reason: 'preference-write-failed', retryable: true },
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      'private path',
    );
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
      neteaseProvider: unavailableNeteaseProvider(),
      logger,
    });

    await expect(service.acquireBestIfNeeded(track, trackDir)).resolves.toEqual(
      { status: 'skipped', reason: 'no-exact-candidate' },
    );
    expect(provider.search).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('chooses NetEase full T2 over LRCLIB T1 and never queries Better Lyrics automatically', async () => {
    const neteaseProvider = unavailableNeteaseProvider({
      searchCandidates: vi.fn().mockResolvedValue({
        provider: 'netease',
        status: 'ok',
        candidates: [
          {
            id: 9,
            trackName: 'Song',
            artistName: 'Artist',
            albumName: '',
            duration: 180,
            capability: { level: 'T2', partial: false },
            compatibility: { t0: true, t1: true, t2: true },
            warnings: [],
            previewFingerprint: 'b'.repeat(64),
            matchBand: 'exact',
          },
        ],
      }),
      saveCandidate: vi.fn(async ({ trackDir: targetTrackDir }) => {
        saveTrackLyricsText(
          targetTrackDir,
          {
            filename: 'netease-9.lrc',
            language: 'und',
            kind: 'netease',
          },
          '[00:01.000]Hello',
        );
        return {
          provider: 'netease',
          status: 'saved',
          source: {
            filename: 'netease-9.lrc',
            language: 'und',
            kind: 'netease',
          },
        };
      }),
    });
    const betterLyricsProvider = {
      searchCandidates: vi.fn(),
      saveCandidate: vi.fn(),
    };
    const provider = client();
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
      neteaseProvider,
      betterLyricsProvider,
    });

    await expect(
      service.acquireBestIfNeeded(track, trackDir),
    ).resolves.toMatchObject({
      status: 'saved',
      provider: 'netease',
      source: { filename: 'netease-9.lrc' },
    });
    expect(neteaseProvider.saveCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 9,
        expectedFingerprint: 'b'.repeat(64),
      }),
    );
    expect(provider.getById).not.toHaveBeenCalled();
    expect(betterLyricsProvider.searchCandidates).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        fs.readFileSync(path.join(trackDir, 'lyrics', 'lyrics.json'), 'utf8'),
      ).preference,
    ).toEqual({ filename: 'netease-9.lrc', origin: 'automatic' });
  });

  it('rechecks current T2 lyrics before committing an automatic save', async () => {
    let resolveNetease;
    const neteaseProvider = unavailableNeteaseProvider({
      searchCandidates: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveNetease = resolve;
          }),
      ),
      saveCandidate: vi.fn(),
    });
    const provider = client({
      getExact: vi.fn().mockResolvedValue({
        status: 'unavailable',
        reason: 'not-found',
      }),
    });
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
      neteaseProvider,
    });

    const pending = service.acquireBestIfNeeded(track, trackDir);
    await vi.waitFor(() =>
      expect(neteaseProvider.searchCandidates).toHaveBeenCalledOnce(),
    );
    saveFullT2Source(trackDir);
    resolveNetease({
      provider: 'netease',
      status: 'ok',
      candidates: [
        {
          id: 9,
          trackName: 'Song',
          artistName: 'Artist',
          albumName: '',
          duration: 180,
          capability: { level: 'T2', partial: false },
          compatibility: { t0: true, t1: true, t2: true },
          warnings: [],
          previewFingerprint: 'b'.repeat(64),
          matchBand: 'exact',
        },
      ],
    });

    await expect(pending).resolves.toEqual({
      status: 'skipped',
      reason: 'current-t2',
    });
    expect(neteaseProvider.saveCandidate).not.toHaveBeenCalled();
  });

  it('rechecks current T2 lyrics after the save-time provider refetch', async () => {
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
      neteaseProvider: unavailableNeteaseProvider(),
    });

    const pending = service.acquireBestIfNeeded(track, trackDir);
    await vi.waitFor(() => expect(provider.getById).toHaveBeenCalledOnce());
    saveFullT2Source(trackDir);
    resolveRecord({ status: 'ok', record: record() });

    await expect(pending).resolves.toEqual({
      status: 'skipped',
      reason: 'current-t2',
    });
    expect(fs.existsSync(path.join(trackDir, 'lyrics', 'lrclib-42.lrc'))).toBe(
      false,
    );
  });

  it('invalidates an in-flight save when a track is deleted and re-imported', async () => {
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
      neteaseProvider: unavailableNeteaseProvider(),
    });

    const pending = service.acquireBestIfNeeded(
      { title: 'Song', artist: 'Artist', duration: 180 },
      trackDir,
    );
    await vi.waitFor(() => expect(provider.getById).toHaveBeenCalledOnce());
    service.invalidateAutomaticAcquisition(track.id);
    fs.rmSync(trackDir, { recursive: true, force: true });
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'replacement');
    resolveRecord({ status: 'ok', record: record() });

    await expect(pending).resolves.toEqual({
      status: 'skipped',
      reason: 'stale-track',
    });
    expect(fs.existsSync(path.join(trackDir, 'lyrics'))).toBe(false);
  });

  it('rejects unsafe or unbounded automatic invalidation keys', () => {
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: client(),
    });

    expect(service.invalidateAutomaticAcquisition(null)).toBe(false);
    expect(service.invalidateAutomaticAcquisition({ id: 'track' })).toBe(false);
    expect(service.invalidateAutomaticAcquisition('../track')).toBe(false);
    expect(service.invalidateAutomaticAcquisition('x'.repeat(129))).toBe(false);
  });

  it('invalidates only cached searches belonging to the deleted track', async () => {
    const provider = client();
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
    });
    const otherTrack = { ...track, id: 'track-2', title: 'Second' };

    await service.searchCandidates(track);
    await service.searchCandidates(otherTrack);
    const callsAfterWarmup = provider.getExact.mock.calls.length;

    expect(service.invalidateAutomaticAcquisition(track.id)).toBe(true);
    await service.searchCandidates(otherTrack);

    expect(provider.getExact).toHaveBeenCalledTimes(callsAfterWarmup);
  });

  it('deduplicates concurrent automatic acquisition for the same track', async () => {
    let resolveNetease;
    const neteaseProvider = unavailableNeteaseProvider({
      searchCandidates: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveNetease = resolve;
          }),
      ),
    });
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: client({
        getExact: vi.fn().mockResolvedValue({
          status: 'unavailable',
          reason: 'not-found',
        }),
      }),
      neteaseProvider,
    });

    const first = service.acquireBestIfNeeded(track, trackDir);
    const second = service.acquireBestIfNeeded(track, trackDir);
    await vi.waitFor(() =>
      expect(neteaseProvider.searchCandidates).toHaveBeenCalledOnce(),
    );
    resolveNetease({
      provider: 'netease',
      status: 'unavailable',
      reason: 'not-found',
      candidates: [],
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'skipped', reason: 'no-exact-candidate' },
      { status: 'skipped', reason: 'no-exact-candidate' },
    ]);
    expect(neteaseProvider.searchCandidates).toHaveBeenCalledOnce();
  });

  it('bounds automatic acquisition concurrency across different tracks', async () => {
    const exactResolvers = [];
    const provider = client({
      getExact: vi.fn(
        () =>
          new Promise((resolve) => {
            exactResolvers.push(resolve);
          }),
      ),
    });
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
      neteaseProvider: unavailableNeteaseProvider(),
      automaticConcurrency: 1,
    });
    const secondTrackDir = path.join(rootDir, 'tracks', 'track-2');
    fs.mkdirSync(secondTrackDir, { recursive: true });
    fs.writeFileSync(path.join(secondTrackDir, 'audio.mp3'), 'audio');

    const first = service.scheduleAutomaticAcquisition(track, trackDir);
    const second = service.scheduleAutomaticAcquisition(
      { ...track, id: 'track-2', title: 'Second' },
      secondTrackDir,
    );
    await vi.waitFor(() => expect(provider.getExact).toHaveBeenCalledOnce());

    exactResolvers[0]({ status: 'unavailable', reason: 'not-found' });
    await vi.waitFor(() => expect(provider.getExact).toHaveBeenCalledTimes(2));
    exactResolvers[1]({ status: 'unavailable', reason: 'not-found' });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'skipped', reason: 'no-exact-candidate' },
      { status: 'skipped', reason: 'no-exact-candidate' },
    ]);
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
