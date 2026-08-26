import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveLrclibRecord } from '../lib/lrclib.js';
import acquisitionHandlersModule from './lyrics/acquisitionHandlers.js';
import documentHandlersModule from './lyrics/documentHandlers.js';
import readingHandlersModule from './lyrics/readingHandlers.js';

const { normalizeLrclibSearchOptions, registerLyricsAcquisitionHandlers } =
  acquisitionHandlersModule;
const { registerLyricsDocumentHandlers } = documentHandlersModule;
const { registerLyricsReadingHandlers } = readingHandlersModule;

function registerLyricsHandlers(options) {
  registerLyricsDocumentHandlers(options);
  registerLyricsAcquisitionHandlers(options);
  registerLyricsReadingHandlers(options);
}

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
  let dialog;
  let mainWindow;
  let requireFeatureGate;
  let runReadingWorker;

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
    dialog = { showOpenDialog: vi.fn() };
    mainWindow = null;
    requireFeatureGate = vi.fn();
    runReadingWorker = vi.fn();
    lyricsAcquisitionService = {
      searchCandidates: vi.fn(),
      saveCandidate: vi.fn(),
      fetchRecord: vi.fn(),
    };
    registerLyricsHandlers({
      ipcMain,
      dialog,
      getConfig: () => ({}),
      resolveDownloadDir: () => dir,
      getMainWindow: () => mainWindow,
      notifyLibraryUpdated,
      requireFeatureGate,
      featureIds: { LYRICS_FLOW: 'lyrics-flow' },
      lyricsAcquisitionService,
      runReadingWorker,
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
      normalizerProfileId: 'lyrics-source-v2',
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

  it('enforces the external-provider gate and bounds unknown Musixmatch tracks', async () => {
    await expect(
      ipcMain.handlers.get('lyrics:probe-musixmatch')(null, 'missing'),
    ).resolves.toEqual({
      provider: 'musixmatch',
      status: 'unavailable',
      reason: 'unknown-track',
    });
    expect(requireFeatureGate).toHaveBeenCalledWith('lyrics-flow');
  });

  it('publishes a saved provider candidate with the current local source list', async () => {
    lyricsAcquisitionService.saveCandidate.mockResolvedValue({
      provider: 'lrclib',
      status: 'saved',
      candidate: { id: 42 },
    });

    await expect(
      ipcMain.handlers.get('lyrics:save-candidate')(
        null,
        'track-a',
        42,
        'a'.repeat(64),
      ),
    ).resolves.toMatchObject({
      status: 'saved',
      sources: [expect.objectContaining({ filename: 'main.lrc' })],
    });
    expect(notifyLibraryUpdated).toHaveBeenCalledOnce();
  });

  it('keeps manual document import, labels, and deletion local and ungated', async () => {
    await expect(
      ipcMain.handlers.get('lyrics:set-source-label')(
        null,
        'track-a',
        'main.lrc',
        'Main lyrics',
      ),
    ).resolves.toMatchObject({
      sources: [
        expect.objectContaining({ filename: 'main.lrc', label: 'Main lyrics' }),
      ],
    });

    await expect(
      ipcMain.handlers.get('lyrics:import-text')(null, 'track-a', {
        text: 'First line\nSecond line',
        label: 'Pasted',
      }),
    ).resolves.toMatchObject({
      source: { filename: 'manual.lrc', label: 'Pasted' },
    });

    const pickedLyricsPath = path.join(dir, 'picked.vtt');
    fs.writeFileSync(
      pickedLyricsPath,
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello',
    );
    dialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [pickedLyricsPath],
    });
    await expect(
      ipcMain.handlers.get('lyrics:import-file')(null, 'track-a'),
    ).resolves.toMatchObject({ source: { filename: 'manual.vtt' } });

    await expect(
      ipcMain.handlers.get('lyrics:delete-source')(
        null,
        'track-a',
        'manual.lrc',
      ),
    ).resolves.toMatchObject({
      sources: expect.not.arrayContaining([
        expect.objectContaining({ filename: 'manual.lrc' }),
      ]),
    });
    expect(requireFeatureGate).not.toHaveBeenCalled();
  });

  it('generates, edits, reports progress for, and deletes a reading document', async () => {
    const loaded = await ipcMain.handlers.get('lyrics:get-track')(
      null,
      'track-a',
      'main.lrc',
    );
    const identity = {
      documentId: 'lyr_document_01',
      sourceFingerprint: loaded.timing.sourceFingerprint,
      lines: [{ lineId: 'line_01', text: 'Hello' }],
    };
    mainWindow = { webContents: { send: vi.fn() } };
    runReadingWorker.mockImplementation(
      async ({ lines, script, onProgress }) => {
        onProgress({ stage: 'tokenizing', index: 0, total: lines.length });
        return {
          analyzer: { id: script },
          lines: lines.map((text) => ({
            text,
            segments: [{ t: text }],
            romaji: 'hello',
          })),
        };
      },
    );

    await expect(
      ipcMain.handlers.get('lyrics:generate-reading')(
        null,
        'track-a',
        'main.lrc',
        identity,
        'ja',
      ),
    ).resolves.toMatchObject({
      version: 2,
      script: 'ja',
      lines: [{ lineId: 'line_01', text: 'Hello' }],
    });
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'lyrics:reading-progress',
      expect.objectContaining({
        trackId: 'track-a',
        sourceFilename: 'main.lrc',
      }),
    );
    await expect(
      ipcMain.handlers.get('lyrics:get-reading')(null, 'track-a', 'main.lrc'),
    ).resolves.toMatchObject({ script: 'ja' });
    await expect(
      ipcMain.handlers.get('lyrics:set-reading-line')(
        null,
        'track-a',
        'main.lrc',
        { ...identity, targetLineId: 'line_01' },
        'ハロー',
      ),
    ).resolves.toMatchObject({
      lines: [expect.objectContaining({ edited: true })],
    });
    await expect(
      ipcMain.handlers.get('lyrics:delete-reading')(
        null,
        'track-a',
        'main.lrc',
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      ipcMain.handlers.get('lyrics:get-reading')(null, 'track-a', 'main.lrc'),
    ).resolves.toBe(null);
  });

  it('rejects unsupported reading scripts and unknown lyric sources before work', async () => {
    const loaded = await ipcMain.handlers.get('lyrics:get-track')(
      null,
      'track-a',
      'main.lrc',
    );
    const identity = {
      documentId: 'lyr_document_01',
      sourceFingerprint: loaded.timing.sourceFingerprint,
      lines: [{ lineId: 'line_01', text: 'Hello' }],
    };
    const generate = ipcMain.handlers.get('lyrics:generate-reading');

    await expect(
      generate(null, 'track-a', 'main.lrc', identity, 'en'),
    ).rejects.toThrow(/unsupported reading script/i);
    await expect(
      generate(null, 'track-a', 'missing.lrc', identity, 'ja'),
    ).rejects.toThrow(/unknown lyrics source/i);
    expect(runReadingWorker).not.toHaveBeenCalled();
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
