import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveLrclibRecord } from '../lib/lrclib.js';
import { saveTrackLyricsText } from '../lib/library/lyrics.js';
import { saveNeteaseRecord } from '../lib/netease.js';
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
      searchProviderCandidates: vi.fn(),
      saveProviderCandidate: vi.fn(),
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
      normalizerProfileId: loaded.timing.normalizerProfileId,
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
        normalizerProfileId: 'lyrics-source-v1',
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

  it('routes a bounded NetEase provider intent without accepting dynamic providers', async () => {
    const candidate = {
      id: 77,
      trackName: 'Song',
      artistName: 'Artist',
      matchBand: 'exact',
      capability: { level: 'T2', partial: false },
      previewFingerprint: 'b'.repeat(64),
    };
    lyricsAcquisitionService.searchProviderCandidates.mockResolvedValue({
      provider: 'netease',
      status: 'ok',
      candidates: [candidate],
      groups: { best: [candidate], related: [] },
      invalidRecordCount: 0,
    });

    await expect(
      ipcMain.handlers.get('lyrics:search-provider-candidates')(
        null,
        'netease',
        'track-a',
        { query: { title: 'Song', artist: 'Artist' } },
      ),
    ).resolves.toMatchObject({
      provider: 'netease',
      candidates: [{ id: 77, saveState: 'unsaved' }],
    });
    expect(
      lyricsAcquisitionService.searchProviderCandidates,
    ).toHaveBeenCalledWith(
      'netease',
      expect.objectContaining({ id: 'track-a' }),
      {
        query: { title: 'Song', artist: 'Artist' },
      },
    );

    await expect(
      ipcMain.handlers.get('lyrics:search-provider-candidates')(
        null,
        'netease',
        'track-a',
        {
          query: { title: 'Song', artist: 'Artist' },
          mode: 'broaden',
        },
      ),
    ).resolves.toMatchObject({ provider: 'netease', status: 'ok' });
    expect(
      lyricsAcquisitionService.searchProviderCandidates,
    ).toHaveBeenLastCalledWith(
      'netease',
      expect.objectContaining({ id: 'track-a' }),
      {
        query: { title: 'Song', artist: 'Artist' },
        mode: 'broaden',
      },
    );

    await expect(
      ipcMain.handlers.get('lyrics:search-provider-candidates')(
        null,
        'dynamic-provider',
        'track-a',
      ),
    ).rejects.toThrow(/provider/i);

    await expect(
      ipcMain.handlers.get('lyrics:search-provider-candidates')(
        null,
        'netease',
        'missing-track',
        { query: { title: 'Song' } },
      ),
    ).rejects.toThrow(/unknown track/i);
  });

  it('maps storage state for every source in an all-provider recording group', async () => {
    const lrclib = {
      id: 42,
      providerId: 'lrclib',
      candidateKey: 'lrclib:42',
      trackName: 'Song',
      artistName: 'Artist',
      matchBand: 'exact',
      capability: { level: 'T1', partial: false },
      previewFingerprint: 'a'.repeat(64),
    };
    const netease = {
      id: 77,
      providerId: 'netease',
      candidateKey: 'netease:77',
      trackName: 'Song',
      artistName: 'Artist',
      matchBand: 'exact',
      capability: { level: 'T2', partial: false },
      previewFingerprint: 'b'.repeat(64),
    };
    lyricsAcquisitionService.searchProviderCandidates.mockResolvedValue({
      provider: 'all',
      status: 'ok',
      partial: false,
      candidates: [netease, lrclib],
      groups: { best: [netease, lrclib], related: [] },
      recordingGroups: {
        best: [
          {
            recordingKey: 'recording:one',
            matchBand: 'exact',
            recommendedCandidateKey: 'netease:77',
            candidates: [netease, lrclib],
          },
        ],
        related: [],
      },
      providerStatuses: [
        { provider: 'lrclib', status: 'ok' },
        { provider: 'netease', status: 'ok' },
      ],
      invalidRecordCount: 0,
    });

    const result = await ipcMain.handlers.get(
      'lyrics:search-provider-candidates',
    )(null, 'all', 'track-a', {
      query: { title: 'Song', artist: 'Artist' },
    });

    expect(result).toMatchObject({
      provider: 'all',
      candidates: [
        {
          providerId: 'netease',
          candidateKey: 'netease:77',
          saveState: 'unsaved',
        },
        {
          providerId: 'lrclib',
          candidateKey: 'lrclib:42',
          saveState: 'unsaved',
        },
      ],
      recordingGroups: {
        best: [
          {
            recommendedCandidateKey: 'netease:77',
            candidates: [
              { candidateKey: 'netease:77', saveState: 'unsaved' },
              { candidateKey: 'lrclib:42', saveState: 'unsaved' },
            ],
          },
        ],
        related: [],
      },
    });
    expect(
      lyricsAcquisitionService.searchProviderCandidates,
    ).toHaveBeenCalledWith('all', expect.objectContaining({ id: 'track-a' }), {
      query: { title: 'Song', artist: 'Artist' },
    });
  });

  it('passes NetEase save through main-owned track and query resolution', async () => {
    lyricsAcquisitionService.saveProviderCandidate.mockResolvedValue({
      provider: 'netease',
      status: 'saved',
      source: { filename: 'netease-77.lrc', kind: 'netease' },
    });

    await expect(
      ipcMain.handlers.get('lyrics:save-provider-candidate')(
        null,
        'netease',
        'track-a',
        77,
        'b'.repeat(64),
        { query: { title: 'Song', artist: 'Artist' } },
      ),
    ).resolves.toMatchObject({ status: 'saved', sources: expect.any(Array) });
    expect(lyricsAcquisitionService.saveProviderCandidate).toHaveBeenCalledWith(
      'netease',
      {
        track: expect.objectContaining({ id: 'track-a' }),
        trackDir,
        candidateId: 77,
        expectedFingerprint: 'b'.repeat(64),
        query: { title: 'Song', artist: 'Artist' },
      },
    );
    expect(notifyLibraryUpdated).toHaveBeenCalled();
  });

  it('rejects broaden mode and preserves a bounded provider save failure', async () => {
    const save = ipcMain.handlers.get('lyrics:save-provider-candidate');

    await expect(
      save(null, 'netease', 'track-a', 77, 'b'.repeat(64), {
        mode: 'broaden',
      }),
    ).rejects.toThrow(/unsupported mode/i);

    lyricsAcquisitionService.saveProviderCandidate.mockResolvedValue({
      provider: 'netease',
      status: 'unavailable',
      reason: 'record-mismatch',
    });
    await expect(
      save(null, 'netease', 'track-a', 77, 'b'.repeat(64)),
    ).resolves.toEqual({
      provider: 'netease',
      status: 'unavailable',
      reason: 'record-mismatch',
    });
    expect(notifyLibraryUpdated).not.toHaveBeenCalled();
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

  it('backfills a legacy LRCLIB source label through the bounded fetch callback', async () => {
    saveTrackLyricsText(
      trackDir,
      { filename: 'lrclib-99.lrc', language: 'und', kind: 'lrclib' },
      '[00:01.000]Legacy',
    );
    lyricsAcquisitionService.fetchRecord.mockResolvedValue({
      status: 'ok',
      record: { albumName: null, artistName: 'Resolved Artist' },
    });

    await expect(
      ipcMain.handlers.get('lyrics:backfill-source-labels')(null, 'track-a'),
    ).resolves.toMatchObject({
      sources: expect.arrayContaining([
        expect.objectContaining({
          filename: 'lrclib-99.lrc',
          label: 'Resolved Artist',
        }),
      ]),
    });
    expect(lyricsAcquisitionService.fetchRecord).toHaveBeenCalledWith(99);
    expect(notifyLibraryUpdated).toHaveBeenCalledOnce();
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

  it('deletes a NetEase source through its provider-owned storage', async () => {
    const saved = saveNeteaseRecord(trackDir, {
      id: 42,
      trackName: 'Song',
      artistName: 'Artist',
      artists: ['Artist'],
      albumName: 'Album',
      duration: 180,
      aliases: [],
      translatedTitles: [],
      yrcLyrics: '[1000,1000](1000,1000,0)Hello',
      lrcLyrics: '[00:01.000]Hello',
    });
    const artifactPath = path.join(
      trackDir,
      'lyrics',
      'providers',
      'netease-42.json',
    );
    expect(fs.existsSync(artifactPath)).toBe(true);

    await expect(
      ipcMain.handlers.get('lyrics:delete-source')(
        null,
        'track-a',
        saved.source.filename,
      ),
    ).resolves.toMatchObject({
      sources: expect.not.arrayContaining([
        expect.objectContaining({ filename: saved.source.filename }),
      ]),
    });
    expect(fs.existsSync(artifactPath)).toBe(false);
    expect(notifyLibraryUpdated).toHaveBeenCalledOnce();
  });

  it('generates, edits, reports progress for, and deletes a reading document', async () => {
    const loaded = await ipcMain.handlers.get('lyrics:get-track')(
      null,
      'track-a',
      'main.lrc',
    );
    const identity = {
      documentId: 'lyr_document_01',
      normalizerProfileId: loaded.timing.normalizerProfileId,
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
      version: 3,
      script: 'ja',
      normalizerProfileId: loaded.timing.normalizerProfileId,
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
      ipcMain.handlers.get('lyrics:get-reading')(
        null,
        'track-a',
        'main.lrc',
        identity,
      ),
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
      ipcMain.handlers.get('lyrics:get-reading')(
        null,
        'track-a',
        'main.lrc',
        identity,
      ),
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
      normalizerProfileId: loaded.timing.normalizerProfileId,
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
