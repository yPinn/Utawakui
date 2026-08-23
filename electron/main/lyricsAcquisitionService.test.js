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
    const service = createLyricsAcquisitionService({
      requireFeatureGate: vi.fn(),
      featureId: 'lyrics-flow',
      client: provider,
    });

    await expect(service.saveIfAbsent(track, trackDir)).resolves.toBe(false);
    expect(provider.search).toHaveBeenCalledOnce();
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
});
