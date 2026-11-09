import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';

import { saveLrclibRecord } from '../lib/lrclib.js';
import {
  getTrackLyricsState,
  saveTrackLyricsText,
  setLyricsSourceLabel,
  setLyricsSourceOffset,
  setLyricsSourcePreference,
} from '../lib/library/lyrics.js';
import { saveIndexEntry } from '../lib/library/metadataIndex.js';
import { fingerprintNeteaseRecord, saveNeteaseRecord } from '../lib/netease.js';
import { saveKugouRecord } from '../lib/kugou/storage.js';
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

function createIpcMain(getTrustedEvent = () => null) {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) =>
      handlers.set(
        channel,
        [
          'lyrics:get-track',
          'lyrics:fork-authored',
          'lyrics:copy-linked-reference',
          'lyrics:edit-authored',
          'lyrics:preview-export',
          'lyrics:save-export',
          'lyrics:save-timing',
          'lyrics:set-source-offset',
          'lyrics:cancel-source-session',
          'lyrics:cancel-timing-review',
          'lyrics:get-timing-review',
          'lyrics:confirm-timing-review',
          'lyrics:revoke-timing-review',
        ].includes(channel)
          ? (event, ...args) => handler(event ?? getTrustedEvent(), ...args)
          : handler,
      ),
    ),
  };
}

function parseAppErrorCode(error) {
  const raw = String(error?.message || '');
  const index = raw.indexOf(APP_ERROR_PREFIX);
  expect(index).toBeGreaterThanOrEqual(0);
  return JSON.parse(raw.slice(index + APP_ERROR_PREFIX.length)).code;
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
  let recordDiagnostic;
  it('exports an acknowledged partial source and rechecks after the save dialog', async () => {
    const audio = Buffer.alloc(44 + 8000 * 2 * 10);
    audio.write('RIFF');
    audio.writeUInt32LE(audio.length - 8, 4);
    audio.write('WAVEfmt ', 8);
    audio.writeUInt32LE(16, 16);
    audio.writeUInt16LE(1, 20);
    audio.writeUInt16LE(1, 22);
    audio.writeUInt32LE(8000, 24);
    audio.writeUInt32LE(16000, 28);
    audio.writeUInt16LE(2, 32);
    audio.writeUInt16LE(16, 34);
    audio.write('data', 36);
    audio.writeUInt32LE(audio.length - 44, 40);
    fs.rmSync(path.join(trackDir, 'audio.mp3'));
    fs.writeFileSync(path.join(trackDir, 'audio.wav'), audio);
    const open = ipcMain.handlers.get('lyrics:get-track');
    const preview = ipcMain.handlers.get('lyrics:preview-export');
    const save = ipcMain.handlers.get('lyrics:save-export');
    const { source } = await ipcMain.handlers.get('lyrics:import-text')(
      null,
      'track-a',
      { text: '歌\n另句' },
    );
    const baseline = await open(null, 'track-a', source.filename);
    const { source: copy } = await ipcMain.handlers.get('lyrics:fork-authored')(
      null,
      'track-a',
      source.filename,
      baseline.sourceSession,
    );
    const opened = await open(null, 'track-a', copy.filename);
    const [first, second] = opened.timing.document.lines;
    const timed = await ipcMain.handlers.get('lyrics:save-timing')(
      null,
      'track-a',
      copy.filename,
      opened.timing.sourceFingerprint,
      {
        ...opened.timing.document,
        lines: [{ ...first, startMs: 1500 }, second],
      },
      opened.sourceSession,
    );
    const plan = await preview(
      null,
      'track-a',
      copy.filename,
      timed.sourceSession,
      'srt',
    );
    expect(plan).toMatchObject({
      count: 1,
      needsConfirmation: true,
      issues: { untimed: 1, estimatedEnds: 1 },
    });
    await expect(save(null, plan.token, false)).rejects.toMatchObject({
      code: 'LYRICS_SOURCE_STALE',
    });
    const target = path.join(dir, 'lyrics.srt');
    dialog.showSaveDialog = vi
      .fn()
      .mockResolvedValue({ filePath: target, canceled: false });
    await expect(save(null, plan.token, true)).resolves.toEqual({
      status: 'saved',
    });
    expect(fs.readFileSync(target, 'utf8')).toContain(
      '00:00:01,500 --> 00:00:05,500\r\n歌',
    );
    await expect(save(null, plan.token, true)).rejects.toMatchObject({
      code: 'LYRICS_SOURCE_STALE',
    });

    const stale = await preview(
      null,
      'track-a',
      copy.filename,
      timed.sourceSession,
      'lrc',
    );
    const staleTarget = path.join(dir, 'stale.lrc');
    dialog.showSaveDialog.mockImplementation(async () => {
      await ipcMain.handlers.get('lyrics:set-source-offset')(
        null,
        'track-a',
        copy.filename,
        100,
        timed.sourceSession,
      );
      return { filePath: staleTarget, canceled: false };
    });
    await expect(save(null, stale.token, true)).rejects.toMatchObject({
      code: 'LYRICS_SOURCE_CONFLICT',
    });
    expect(fs.existsSync(staleTarget)).toBe(false);
    const fresh = await open(null, 'track-a', copy.filename);
    const cancelled = await preview(
      null,
      'track-a',
      copy.filename,
      fresh.sourceSession,
      'lrc',
    );
    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    await expect(save(null, cancelled.token, true)).resolves.toEqual({
      status: 'cancelled',
    });

    const blocked = await preview(
      null,
      'track-a',
      copy.filename,
      fresh.sourceSession,
      'lrc',
    );
    const originalPath = path.join(trackDir, 'lyrics', 'main.lrc');
    const before = fs.readFileSync(originalPath, 'utf8');
    dialog.showSaveDialog.mockResolvedValueOnce({
      filePath: originalPath,
      canceled: false,
    });
    await expect(save(null, blocked.token, true)).rejects.toMatchObject({
      code: 'LYRICS_SOURCE_INVALID',
    });
    expect(fs.readFileSync(originalPath, 'utf8')).toBe(before);
  });
  it('forks and corrects through the trusted IPC and leaves the original untouched', async () => {
    const open = ipcMain.handlers.get('lyrics:get-track');
    const fork = ipcMain.handlers.get('lyrics:fork-authored');
    const edit = ipcMain.handlers.get('lyrics:edit-authored');
    const original = await open(null, 'track-a', 'main.lrc');
    await expect(
      fork(
        { sender: {}, senderFrame: {} },
        'track-a',
        'main.lrc',
        original.sourceSession,
      ),
    ).rejects.toMatchObject({ code: 'LYRICS_SOURCE_INVALID' });
    const { source } = await fork(
      null,
      'track-a',
      'main.lrc',
      original.sourceSession,
    );
    const copy = await open(null, 'track-a', source.filename);
    const [{ lineId }] = copy.timing.document.lines;
    const saved = await edit(
      null,
      'track-a',
      source.filename,
      copy.sourceSession,
      {
        lineId,
        text: 'Hello!',
      },
    );
    expect(saved.timing.document.lines).toMatchObject([
      { lineId, text: 'Hello!', startMs: 1000 },
    ]);
    expect((await open(null, 'track-a', 'main.lrc')).text).toBe(original.text);
    expect(requireFeatureGate).not.toHaveBeenCalled();
  });
  it('confirms and revokes only Main-derived receipts through the trusted main frame', async () => {
    const a = await ipcMain.handlers.get('lyrics:get-track')(
      null,
      'track-a',
      'main.lrc',
    );
    const get = ipcMain.handlers.get('lyrics:get-timing-review');
    await expect(
      get(
        { sender: {}, senderFrame: {} },
        'track-a',
        'main.lrc',
        a.sourceSession,
      ),
    ).rejects.toSatisfy(
      (error) => parseAppErrorCode(error) === 'LYRICS_SOURCE_INVALID',
    );
    const ready = await get(null, 'track-a', 'main.lrc', a.sourceSession);
    expect(ready).toMatchObject({
      status: 'unconfirmed',
      coverage: { timed: 1, total: 1 },
    });
    const confirmed = await ipcMain.handlers.get(
      'lyrics:confirm-timing-review',
    )(null, 'track-a', 'main.lrc', a.sourceSession, ready.token);
    expect(confirmed.status).toBe('confirmed');
    const fresh = await get(null, 'track-a', 'main.lrc', a.sourceSession);
    expect(
      (
        await ipcMain.handlers.get('lyrics:revoke-timing-review')(
          null,
          'track-a',
          'main.lrc',
          a.sourceSession,
          fresh.token,
        )
      ).status,
    ).toBe('revoked');
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });

  it('cancels a timing review token so it can no longer confirm', async () => {
    const a = await ipcMain.handlers.get('lyrics:get-track')(
      null,
      'track-a',
      'main.lrc',
    );
    const ready = await ipcMain.handlers.get('lyrics:get-timing-review')(
      null,
      'track-a',
      'main.lrc',
      a.sourceSession,
    );
    await expect(
      ipcMain.handlers.get('lyrics:cancel-timing-review')(null, ready.token),
    ).resolves.toEqual({ status: 'cancelled' });
    await expect(
      ipcMain.handlers.get('lyrics:confirm-timing-review')(
        null,
        'track-a',
        'main.lrc',
        a.sourceSession,
        ready.token,
      ),
    ).rejects.toThrow();
  });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-lyrics-ipc-'));
    trackDir = path.join(dir, 'tracks', 'track-a');
    fs.mkdirSync(path.join(trackDir, 'lyrics'), { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'audio');
    fs.writeFileSync(
      path.join(trackDir, 'lyrics', 'main.lrc'),
      '[00:01.00]Hello',
    );

    ipcMain = createIpcMain(() => ({
      sender: mainWindow?.webContents,
      senderFrame: mainWindow?.webContents.mainFrame,
    }));
    notifyLibraryUpdated = vi.fn();
    dialog = { showOpenDialog: vi.fn() };
    mainWindow = {
      isDestroyed: () => false,
      webContents: { mainFrame: {}, send: vi.fn() },
    };
    requireFeatureGate = vi.fn();
    runReadingWorker = vi.fn();
    recordDiagnostic = vi.fn(() => ({ ok: true }));
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
      getLibraryContext: () => ({ dir, epoch: 1 }),
      getLinkedLyricsReference: async (_dir, id) =>
        id === 'cover' ? 'track-a' : null,
      getMainWindow: () => mainWindow,
      notifyLibraryUpdated,
      requireFeatureGate,
      featureIds: { LYRICS_FLOW: 'lyrics-flow' },
      lyricsAcquisitionService,
      runReadingWorker,
      recordDiagnostic,
    });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('inherits timing without a session and copies only to the confirmed cover', async () => {
    const cover = path.join(dir, 'tracks', 'cover');
    fs.mkdirSync(cover);
    fs.writeFileSync(path.join(cover, 'audio.mp3'), 'audio');
    saveTrackLyricsText(
      cover,
      { filename: 'manual.lrc', kind: 'manual', label: '參照 Track A' },
      'Hello',
    );
    setLyricsSourceOffset(trackDir, 'main.lrc', 400);
    const load = ipcMain.handlers.get('lyrics:get-track');
    const reference = await load(
      null,
      'track-a',
      'main.lrc',
      'reference-timed',
    );
    expect(reference).toMatchObject({
      text: '[00:01.00]Hello',
      source: { offsetMs: 400 },
    });
    expect(reference.sourceSession).toBeUndefined();
    const copy = ipcMain.handlers.get('lyrics:copy-linked-reference');
    await expect(
      copy(null, 'cover', 'elsewhere', 'main.lrc'),
    ).rejects.toMatchObject({
      code: 'LYRICS_SOURCE_STALE',
    });
    const { source } = await copy(null, 'cover', 'track-a', 'main.lrc');
    expect(await load(null, 'cover', source.filename)).toMatchObject({
      source: { kind: 'authored', offsetMs: 400 },
      timing: { document: { lines: [{ startMs: 1000, text: 'Hello' }] } },
    });
    expect(
      fs.readFileSync(path.join(trackDir, 'lyrics', 'main.lrc'), 'utf8'),
    ).toBe('[00:01.00]Hello');
    expect(
      fs.readFileSync(path.join(cover, 'lyrics', 'manual.lrc'), 'utf8'),
    ).toBe('Hello');
    await expect(
      copy(null, 'cover', 'track-a', 'main.lrc'),
    ).rejects.toMatchObject({
      code: 'LYRICS_SOURCE_STALE',
    });
  });
  it('rejects forged frames and source sessions without exposing private paths', async () => {
    const load = ipcMain.handlers.get('lyrics:get-track');
    await expect(
      load({ sender: {}, senderFrame: {} }, 'track-a', 'main.lrc'),
    ).rejects.toMatchObject({ code: 'LYRICS_SOURCE_INVALID' });
    const opened = await load(null, 'track-a', 'main.lrc');
    const save = ipcMain.handlers.get('lyrics:set-source-offset');
    await expect(
      save(
        { sender: mainWindow.webContents, senderFrame: {} },
        'track-a',
        'main.lrc',
        100,
        opened.sourceSession,
      ),
    ).rejects.toMatchObject({ code: 'LYRICS_SOURCE_INVALID' });
    await ipcMain.handlers.get('lyrics:cancel-source-session')(
      null,
      opened.sourceSession.id,
    );
    await expect(
      save(null, 'track-a', 'main.lrc', 100, opened.sourceSession),
    ).rejects.toMatchObject({ code: 'LYRICS_SOURCE_STALE' });
  });
  it('records unexpected source IO privately and bounds the public error once', async () => {
    const read = fs.readFileSync;
    const spy = vi
      .spyOn(fs, 'readFileSync')
      .mockImplementation((file, ...args) => {
        if (String(file).endsWith('main.lrc'))
          throw Error('private E:/media/secret.lrc');
        return read(file, ...args);
      });
    try {
      const error = await ipcMain.handlers
        .get('lyrics:get-track')(null, 'track-a', 'main.lrc')
        .catch((value) => value);
      expect(error.code).toBe('LYRICS_SOURCE_FAILED');
      expect(error.message).not.toContain('secret.lrc');
      expect(error.context.diagnosticRecorded).toBe(true);
      expect(recordDiagnostic).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });
  it('rejects a same-text timing race through the real writer without rebasing', async () => {
    const load = ipcMain.handlers.get('lyrics:get-track'),
      save = ipcMain.handlers.get('lyrics:save-timing');
    const a = await load(null, 'track-a', 'main.lrc'),
      b = await load(null, 'track-a', 'main.lrc');
    const document = {
      schemaVersion: 1,
      documentId: 'doc',
      normalizerProfileId: a.timing.normalizerProfileId,
      source: { filename: 'main.lrc', sha256: a.timing.sourceFingerprint },
      lines: [{ lineId: 'line', text: 'Hello', startMs: 1000, endMs: null }],
    };
    await save(
      null,
      'track-a',
      'main.lrc',
      a.timing.sourceFingerprint,
      document,
      a.sourceSession,
    );
    const file = path.join(trackDir, 'lyrics/timing/main.lrc.json'),
      before = fs.readFileSync(file, 'utf8');
    await expect(
      save(
        null,
        'track-a',
        'main.lrc',
        b.timing.sourceFingerprint,
        { ...document, lines: [{ ...document.lines[0], startMs: 2000 }] },
        b.sourceSession,
      ),
    ).rejects.toMatchObject({ code: 'LYRICS_SOURCE_CONFLICT' });
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('saves and reloads source-bound vocal roles through fixed local IPC', async () => {
    const { normalizeLyricsDocument } =
      await import('../../src/utils/lyricsDocument.js');
    const loaded = await ipcMain.handlers.get('lyrics:get-track')(
      null,
      'track-a',
      'main.lrc',
    );
    const document = normalizeLyricsDocument({
      text: loaded.text,
      source: loaded.source,
      timing: loaded.timing,
      sourceFingerprint: loaded.timing.sourceFingerprint,
    });
    const load = ipcMain.handlers.get('lyrics:get-vocal-roles'),
      save = ipcMain.handlers.get('lyrics:save-vocal-roles');
    expect(load(null, 'track-a', 'main.lrc', document.documentId).status).toBe(
      'missing',
    );
    const rows = [
      { lineId: document.lines[0].lineId, role: 'male', scope: 'line' },
    ];
    expect(
      save(null, 'track-a', 'main.lrc', document.documentId, 0, rows)
        .assignments,
    ).toEqual(rows);
    expect(
      load(null, 'track-a', 'main.lrc', document.documentId).assignments,
    ).toEqual(rows);
    expect(() =>
      save(null, 'unknown', 'main.lrc', document.documentId, 0, rows),
    ).toThrow();
    expect(() =>
      load(null, 'track-a', '../main.lrc', document.documentId),
    ).toThrow();
    expect(
      fs.readFileSync(path.join(trackDir, 'lyrics', 'main.lrc'), 'utf8'),
    ).toBe(loaded.text);
    expect(requireFeatureGate).not.toHaveBeenCalled();
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
        loaded.sourceSession,
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
    ).rejects.toThrow();
    await expect(
      save(null, 'track-a', '../main.lrc', 'a'.repeat(64), document),
    ).rejects.toThrow();
    await expect(
      save(null, 'track-a', 'main.lrc', 'a'.repeat(64), document),
    ).rejects.toThrow();
    expect(notifyLibraryUpdated).not.toHaveBeenCalled();
  });

  it('persists a bounded offset for the selected lyrics source', async () => {
    const saveOffset = ipcMain.handlers.get('lyrics:set-source-offset');
    const opened = await ipcMain.handlers.get('lyrics:get-track')(
      null,
      'track-a',
      'main.lrc',
    );

    await expect(
      saveOffset(null, 'track-a', 'main.lrc', -1300, opened.sourceSession),
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

  it('persists a user-owned preferred lyrics source', async () => {
    const savePreference = ipcMain.handlers.get('lyrics:set-preferred-source');

    await expect(
      savePreference(null, 'track-a', 'main.lrc'),
    ).resolves.toMatchObject({
      preferredSourceFilename: 'main.lrc',
      preferenceOrigin: 'user',
    });
    expect(notifyLibraryUpdated).toHaveBeenCalledOnce();
    await expect(
      savePreference(null, 'track-a', '../main.lrc'),
    ).rejects.toThrow(/unknown lyrics source/i);
  });

  it('rejects unsafe or invalid lyrics offset writes', async () => {
    const saveOffset = ipcMain.handlers.get('lyrics:set-source-offset');

    await expect(
      saveOffset(null, 'track-a', '../main.lrc', 100),
    ).rejects.toThrow();
    await expect(
      saveOffset(null, 'track-a', 'main.lrc', 100.5),
    ).rejects.toThrow();
    await expect(
      saveOffset(null, 'missing', 'main.lrc', 100),
    ).rejects.toThrow();
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

    // All four map to the same public LYRICS_READING_IDENTITY_STALE code —
    // the renderer's view of this identity no longer matches main, and the
    // specific internal reason (stale fingerprint, duplicate line id, etc.)
    // stays a private diagnostic detail, not public message text.
    const error1 = await setLine(null, 'track-a', 'main.lrc', {
      ...identity,
      sourceFingerprint: 'a'.repeat(64),
    }).catch((err) => err);
    expect(parseAppErrorCode(error1)).toBe('LYRICS_READING_IDENTITY_STALE');

    const error2 = await setLine(null, 'track-a', 'main.lrc', {
      ...identity,
      normalizerProfileId: 'lyrics-source-v1',
    }).catch((err) => err);
    expect(parseAppErrorCode(error2)).toBe('LYRICS_READING_IDENTITY_STALE');

    const error3 = await setLine(null, 'track-a', 'main.lrc', {
      ...identity,
      lines: [
        { lineId: 'line_01', text: 'Hello' },
        { lineId: 'line_01', text: 'Again' },
      ],
    }).catch((err) => err);
    expect(parseAppErrorCode(error3)).toBe('LYRICS_READING_IDENTITY_STALE');

    const error4 = await setLine(null, 'track-a', 'main.lrc', {
      ...identity,
      targetLineId: 'missing_line',
    }).catch((err) => err);
    expect(parseAppErrorCode(error4)).toBe('LYRICS_READING_IDENTITY_STALE');
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
        'amll',
        'track-a',
        { query: { title: 'Song', artist: 'Artist' } },
      ),
    ).rejects.toThrow(/provider/i);

    lyricsAcquisitionService.searchProviderCandidates.mockResolvedValueOnce({
      provider: 'betterlyrics',
      status: 'unavailable',
      reason: 'cache-miss',
      candidates: [],
      groups: null,
      invalidRecordCount: 0,
    });
    await expect(
      ipcMain.handlers.get('lyrics:search-provider-candidates')(
        null,
        'betterlyrics',
        'track-a',
        { query: { title: 'Song', artist: 'Artist' } },
      ),
    ).resolves.toMatchObject({
      provider: 'betterlyrics',
      status: 'unavailable',
      reason: 'cache-miss',
    });

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
  it('recognizes persisted Kugou provenance through the all-provider IPC and deletes both files', async () => {
    const saved = saveKugouRecord(trackDir, {
      id: 123,
      trackName: 'Song',
      artistName: 'Artist',
      duration: 180,
      lrcLyrics: '[ti:Song]\n[ar:Artist]\n[00:01]One\n[00:02]Two',
    });
    const candidate = {
      id: 123,
      providerId: 'kugou',
      candidateKey: 'kugou:123',
      trackName: 'Song',
      artistName: 'Artist',
      previewFingerprint: saved.recordFingerprint,
      matchBand: 'exact',
      capability: { level: 'T1' },
    };
    lyricsAcquisitionService.searchProviderCandidates.mockResolvedValue({
      provider: 'all',
      status: 'ok',
      candidates: [candidate],
      groups: { best: [candidate], related: [] },
    });
    const result = await ipcMain.handlers.get(
      'lyrics:search-provider-candidates',
    )(null, 'all', 'track-a');
    expect(result.candidates[0]).toMatchObject({
      providerId: 'kugou',
      saveState: 'current',
      alreadySaved: true,
      storedSourceFilename: saved.source.filename,
    });
    expect(result.candidates[0].retrievedAt).toBeTypeOf('string');
    await ipcMain.handlers.get('lyrics:delete-source')(
      null,
      'track-a',
      saved.source.filename,
    );
    expect(
      fs.existsSync(path.join(trackDir, 'lyrics/providers/kugou-123.json')),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(trackDir, 'lyrics', saved.source.filename)),
    ).toBe(false);
  });

  it('updates a stored NetEase T1 to T2 in place when the provider record is unchanged', async () => {
    const record = {
      id: 77,
      trackName: 'Song',
      artistName: 'Artist',
      artists: ['Artist'],
      duration: 180,
      yrcLyrics: '[1000,1000](1000,500,0)Song(1500,500,0) ',
      lrcLyrics: '[00:01.000]Song',
    };
    const { source } = saveNeteaseRecord(trackDir, {
      ...record,
      yrcLyrics: '',
    });
    const artifactPath = path.join(
      trackDir,
      'lyrics/providers/netease-77.json',
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const fingerprint = fingerprintNeteaseRecord(record);
    fs.writeFileSync(
      artifactPath,
      JSON.stringify({
        ...artifact,
        record,
        hashes: { ...artifact.hashes, record: fingerprint },
      }),
    );
    setLyricsSourceLabel(trackDir, source.filename, 'My label');
    setLyricsSourceOffset(trackDir, source.filename, -850);
    setLyricsSourcePreference(trackDir, source.filename, 'automatic');

    lyricsAcquisitionService.searchProviderCandidates.mockResolvedValue({
      provider: 'netease',
      status: 'ok',
      candidates: [
        {
          id: 77,
          previewFingerprint: fingerprint,
          capability: { level: 'T2', partial: false },
          compatibility: { t2: true },
        },
      ],
    });
    lyricsAcquisitionService.saveProviderCandidate.mockImplementation(
      async () => saveNeteaseRecord(trackDir, record),
    );
    const search = ipcMain.handlers.get('lyrics:search-provider-candidates');
    const save = ipcMain.handlers.get('lyrics:save-provider-candidate');
    const sourcePath = path.join(trackDir, 'lyrics', source.filename);
    const originalSource = fs.readFileSync(sourcePath, 'utf8');
    await expect(search(null, 'netease', 'track-a')).resolves.toMatchObject({
      candidates: [{ saveState: 'update-available', alreadySaved: false }],
    });
    fs.writeFileSync(sourcePath, '[00:01.000]Local edit\n');
    await expect(
      save(null, 'netease', 'track-a', 77, fingerprint),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'stale-search',
    });
    expect(fs.readFileSync(sourcePath, 'utf8')).toContain('Local edit');
    fs.writeFileSync(sourcePath, originalSource);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        save(null, 'netease', 'track-a', 77, fingerprint),
      ).resolves.toMatchObject({
        status: 'saved',
        preserveSelection: true,
        source: { filename: source.filename },
        timing: { status: 'current', document: { granularity: 'T2' } },
      });
    }
    expect(getTrackLyricsState(trackDir)).toMatchObject({
      preferredSourceFilename: source.filename,
      preferenceOrigin: 'automatic',
      sources: expect.arrayContaining([
        expect.objectContaining({
          filename: source.filename,
          label: 'My label',
          offsetMs: -850,
        }),
      ]),
    });
    await expect(search(null, 'netease', 'track-a')).resolves.toMatchObject({
      candidates: [{ saveState: 'current', alreadySaved: true }],
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

  it('passes indexed track identity into Better Lyrics save revalidation', async () => {
    saveIndexEntry(dir, 'track-a', {
      title: 'I AM',
      artist: 'IVE',
      album: "I've IVE",
      duration: 184,
    });
    lyricsAcquisitionService.saveProviderCandidate.mockResolvedValue({
      provider: 'betterlyrics',
      status: 'saved',
      source: { filename: 'betterlyrics-42.lrc', kind: 'betterlyrics' },
    });

    await ipcMain.handlers.get('lyrics:save-provider-candidate')(
      null,
      'betterlyrics',
      'track-a',
      42,
      'c'.repeat(64),
      { query: { title: 'I AM', artist: 'IVE' } },
    );

    expect(lyricsAcquisitionService.saveProviderCandidate).toHaveBeenCalledWith(
      'betterlyrics',
      expect.objectContaining({
        track: expect.objectContaining({
          id: 'track-a',
          title: 'I AM',
          artist: 'IVE',
          album: "I've IVE",
          duration: 184,
        }),
      }),
    );
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

  it('rejects deleting a source that is not in the manifest', async () => {
    await expect(
      ipcMain.handlers.get('lyrics:delete-source')(
        null,
        'track-a',
        'missing.lrc',
      ),
    ).rejects.toThrow('unable to delete lyrics source: missing.lrc');
    expect(notifyLibraryUpdated).not.toHaveBeenCalled();
  });

  it('deletes a retired source as local lyrics while retaining its migration backup', async () => {
    fs.cpSync(
      new URL('../lib/library/fixtures/retired-source', import.meta.url),
      trackDir,
      { recursive: true },
    );
    const filename = 'amll-43.lrc';
    await expect(
      ipcMain.handlers.get('lyrics:delete-source')(null, 'track-a', filename),
    ).resolves.toMatchObject({
      sources: expect.not.arrayContaining([
        expect.objectContaining({ filename }),
      ]),
    });
    expect(fs.existsSync(path.join(trackDir, 'lyrics', filename))).toBe(false);
    expect(
      fs.existsSync(path.join(trackDir, 'lyrics/providers/amll-43.json')),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          trackDir,
          'lyrics/migrations/retired-providers-v1/providers/amll-43.json',
        ),
      ),
    ).toBe(true);
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
    mainWindow = {
      isDestroyed: () => false,
      webContents: { mainFrame: {}, send: vi.fn() },
    };
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

    const unsupportedScript = await generate(
      null,
      'track-a',
      'main.lrc',
      identity,
      'en',
    ).catch((err) => err);
    expect(parseAppErrorCode(unsupportedScript)).toBe(
      'LYRICS_READING_UNSUPPORTED_SCRIPT',
    );

    const unknownSource = await generate(
      null,
      'track-a',
      'missing.lrc',
      identity,
      'ja',
    ).catch((err) => err);
    expect(parseAppErrorCode(unknownSource)).toBe(
      'LYRICS_READING_UNKNOWN_SOURCE',
    );
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
