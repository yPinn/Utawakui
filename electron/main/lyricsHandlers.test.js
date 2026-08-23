import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveLrclibRecord } from '../lib/lrclib.js';
import lyricsHandlersModule from './lyricsHandlers.js';

const { normalizeLrclibSearchOptions, registerLyricsHandlers } =
  lyricsHandlersModule;

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

describe('lyrics timing IPC', () => {
  let dir;
  let trackDir;
  let ipcMain;
  let notifyLibraryUpdated;
  let lyricsAcquisitionService;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-lyrics-ipc-'));
    trackDir = path.join(dir, 'tracks', 'track-a');
    fs.mkdirSync(path.join(trackDir, 'lyrics'), { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'audio');
    fs.writeFileSync(
      path.join(trackDir, 'lyrics', 'main.lrc'),
      '[00:01.00]Hello',
    );

    ipcMain = createIpcMain();
    notifyLibraryUpdated = vi.fn();
    lyricsAcquisitionService = {
      searchCandidates: vi.fn(),
      saveCandidate: vi.fn(),
      fetchRecord: vi.fn(),
    };
    registerLyricsHandlers({
      ipcMain,
      dialog: { showOpenDialog: vi.fn() },
      getConfig: () => ({}),
      resolveDownloadDir: () => dir,
      getMainWindow: () => null,
      notifyLibraryUpdated,
      requireFeatureGate: vi.fn(),
      featureIds: { LYRICS_FLOW: 'lyrics-flow' },
      lyricsAcquisitionService,
    });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('loads source identity and saves a bounded main-derived timing sidecar', async () => {
    const loaded = await ipcMain.handlers.get('lyrics:get-track')(
      null,
      'track-a',
      'main.lrc',
    );
    const document = {
      schemaVersion: 1,
      documentId: 'lyr_document_01',
      normalizerProfileId: loaded.timing.normalizerProfileId,
      source: {
        filename: 'main.lrc',
        sha256: loaded.timing.sourceFingerprint,
      },
      lines: [
        {
          lineId: 'line_01',
          text: 'Hello',
          startMs: 1000,
          endMs: null,
        },
      ],
    };

    await expect(
      ipcMain.handlers.get('lyrics:save-timing')(
        null,
        'track-a',
        'main.lrc',
        loaded.timing.sourceFingerprint,
        document,
      ),
    ).resolves.toMatchObject({
      status: 'current',
      document: { documentId: 'lyr_document_01', granularity: 'T1' },
    });
    expect(notifyLibraryUpdated).toHaveBeenCalledOnce();
    expect(
      fs.existsSync(path.join(trackDir, 'lyrics', 'timing', 'main.lrc.json')),
    ).toBe(true);
  });

  it('rejects unknown tracks, unsafe filenames, and stale source fingerprints', async () => {
    const save = ipcMain.handlers.get('lyrics:save-timing');
    const document = {
      schemaVersion: 1,
      documentId: 'lyr_document_01',
      normalizerProfileId: 'lyrics-source-v1',
      source: { filename: 'main.lrc', sha256: 'a'.repeat(64) },
      lines: [],
    };

    await expect(
      save(null, 'missing', 'main.lrc', 'a'.repeat(64), document),
    ).rejects.toThrow(/unknown track/i);
    await expect(
      save(null, 'track-a', '../main.lrc', 'a'.repeat(64), document),
    ).rejects.toThrow();
    await expect(
      save(null, 'track-a', 'main.lrc', 'a'.repeat(64), document),
    ).rejects.toThrow(/changed/i);
    expect(notifyLibraryUpdated).not.toHaveBeenCalled();
  });

  it('persists a bounded offset for the selected lyrics source', async () => {
    const saveOffset = ipcMain.handlers.get('lyrics:set-source-offset');

    await expect(
      saveOffset(null, 'track-a', 'main.lrc', -1300),
    ).resolves.toMatchObject({
      source: { filename: 'main.lrc', offsetMs: -1300 },
    });
    await expect(
      ipcMain.handlers.get('lyrics:get-track')(null, 'track-a', 'main.lrc'),
    ).resolves.toMatchObject({
      source: { filename: 'main.lrc', offsetMs: -1300 },
    });
    expect(notifyLibraryUpdated).not.toHaveBeenCalled();
  });

  it('rejects unsafe or invalid lyrics offset writes', async () => {
    const saveOffset = ipcMain.handlers.get('lyrics:set-source-offset');

    await expect(
      saveOffset(null, 'track-a', '../main.lrc', 100),
    ).rejects.toThrow();
    await expect(
      saveOffset(null, 'track-a', 'main.lrc', 100.5),
    ).rejects.toThrow();
    await expect(saveOffset(null, 'missing', 'main.lrc', 100)).rejects.toThrow(
      /unknown track/i,
    );
  });

  it('rejects stale, duplicate, and unknown-target reading identities before work', async () => {
    const loaded = await ipcMain.handlers.get('lyrics:get-track')(
      null,
      'track-a',
      'main.lrc',
    );
    const setLine = ipcMain.handlers.get('lyrics:set-reading-line');
    const identity = {
      documentId: 'lyr_document_01',
      sourceFingerprint: loaded.timing.sourceFingerprint,
      targetLineId: 'line_01',
      lines: [{ lineId: 'line_01', text: 'Hello' }],
    };

    await expect(
      setLine(null, 'track-a', 'main.lrc', {
        ...identity,
        sourceFingerprint: 'a'.repeat(64),
      }),
    ).rejects.toThrow(/stale or invalid/);
    await expect(
      setLine(null, 'track-a', 'main.lrc', {
        ...identity,
        lines: [
          { lineId: 'line_01', text: 'Hello' },
          { lineId: 'line_01', text: 'Again' },
        ],
      }),
    ).rejects.toThrow(/lines are invalid/);
    await expect(
      setLine(null, 'track-a', 'main.lrc', {
        ...identity,
        targetLineId: 'missing_line',
      }),
    ).rejects.toThrow(/target line is invalid/);
  });

  it('returns bounded best and related LRCLIB summaries for an editable query', async () => {
    const best = {
      id: 42,
      trackName: 'Manual title',
      artistName: 'Manual artist',
      matchBand: 'strong',
      language: 'ja',
    };
    const related = {
      id: 43,
      trackName: 'Related title',
      artistName: 'Other artist',
      matchBand: 'related',
    };
    lyricsAcquisitionService.searchCandidates.mockResolvedValue({
      provider: 'lrclib',
      status: 'ok',
      candidates: [best, related],
      groups: { best: [best], related: [related] },
      invalidRecordCount: 1,
    });

    const result = await ipcMain.handlers.get('lyrics:search-candidates')(
      null,
      'track-a',
      { query: { title: 'Manual title', artist: 'Manual artist' } },
    );

    expect(lyricsAcquisitionService.searchCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-a' }),
      { query: { title: 'Manual title', artist: 'Manual artist' } },
    );
    expect(result).toMatchObject({
      status: 'ok',
      invalidRecordCount: 1,
      groups: {
        best: [{ ...best, saveState: 'unsaved', alreadySaved: false }],
        related: [{ ...related, saveState: 'unsaved', alreadySaved: false }],
      },
    });
  });

  it('distinguishes a current stored LRCLIB record from an available update', async () => {
    const saved = saveLrclibRecord(
      trackDir,
      {
        id: 42,
        name: 'Song - Artist',
        trackName: 'Song',
        artistName: 'Artist',
        albumName: 'Album',
        duration: 120,
        instrumental: false,
        plainLyrics: 'Saved lyrics',
        syncedLyrics: '[00:01.000]Saved lyrics',
        lyricsfile: null,
      },
      { retrievedAt: '2026-08-23T10:00:00.000Z' },
    );
    const candidate = {
      id: 42,
      trackName: 'Song',
      artistName: 'Artist',
      matchBand: 'exact',
      previewFingerprint: saved.recordFingerprint,
    };
    lyricsAcquisitionService.searchCandidates.mockResolvedValue({
      provider: 'lrclib',
      status: 'ok',
      candidates: [candidate],
      groups: { best: [candidate], related: [] },
      invalidRecordCount: 0,
    });
    const search = ipcMain.handlers.get('lyrics:search-candidates');

    await expect(search(null, 'track-a')).resolves.toMatchObject({
      candidates: [
        {
          id: 42,
          saveState: 'current',
          alreadySaved: true,
          retrievedAt: '2026-08-23T10:00:00.000Z',
        },
      ],
    });

    candidate.previewFingerprint = 'f'.repeat(64);
    await expect(search(null, 'track-a')).resolves.toMatchObject({
      candidates: [
        {
          id: 42,
          saveState: 'update-available',
          alreadySaved: false,
          retrievedAt: '2026-08-23T10:00:00.000Z',
        },
      ],
    });

    const artifactPath = path.join(
      trackDir,
      'lyrics',
      'providers',
      'lrclib-42.json',
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    artifact.hashes.record = '0'.repeat(64);
    fs.writeFileSync(artifactPath, JSON.stringify(artifact));
    candidate.previewFingerprint = saved.recordFingerprint;
    await expect(search(null, 'track-a')).resolves.toMatchObject({
      candidates: [
        {
          id: 42,
          saveState: 'update-available',
          alreadySaved: false,
        },
      ],
    });
  });

  it('passes the bounded editable query into save-time revalidation', async () => {
    lyricsAcquisitionService.saveCandidate.mockResolvedValue({
      provider: 'lrclib',
      status: 'record-changed',
      candidate: { id: 42 },
    });

    await expect(
      ipcMain.handlers.get('lyrics:save-candidate')(
        null,
        'track-a',
        42,
        'a'.repeat(64),
        { query: { title: 'Manual title', artist: 'Manual artist' } },
      ),
    ).resolves.toMatchObject({ status: 'record-changed' });
    expect(lyricsAcquisitionService.saveCandidate).toHaveBeenCalledWith({
      track: expect.objectContaining({ id: 'track-a' }),
      trackDir,
      candidateId: 42,
      expectedFingerprint: 'a'.repeat(64),
      query: { title: 'Manual title', artist: 'Manual artist' },
    });
    await expect(
      ipcMain.handlers.get('lyrics:save-candidate')(
        null,
        'track-a',
        42,
        'a'.repeat(64),
        { mode: 'broaden' },
      ),
    ).rejects.toThrow(/unsupported mode/i);
  });
});

describe('normalizeLrclibSearchOptions', () => {
  it('accepts only bounded query fields and the explicit broaden mode', () => {
    expect(
      normalizeLrclibSearchOptions({
        query: { title: 'Song', artist: 'Artist' },
        mode: 'broaden',
      }),
    ).toEqual({
      query: { title: 'Song', artist: 'Artist' },
      mode: 'broaden',
    });
    expect(normalizeLrclibSearchOptions(undefined)).toEqual({});
  });

  it('rejects transport injection, controls, and oversized query text', () => {
    expect(() =>
      normalizeLrclibSearchOptions({ baseUrl: 'https://example.com' }),
    ).toThrow(/options/i);
    expect(() =>
      normalizeLrclibSearchOptions({ query: { title: 'Song\nOther' } }),
    ).toThrow(/query/i);
    expect(() =>
      normalizeLrclibSearchOptions({
        query: { title: 'x'.repeat(257), artist: 'Artist' },
      }),
    ).toThrow(/query/i);
  });
});
