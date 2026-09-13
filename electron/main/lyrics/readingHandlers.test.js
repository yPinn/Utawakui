import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../../lib/appError.js';
import { registerLyricsReadingHandlers } from './readingHandlers.js';

const SOURCE_FINGERPRINT = 'a'.repeat(64);
const VALID_IDENTITY = Object.freeze({
  documentId: 'doc-1',
  normalizerProfileId: 'profile-1',
  sourceFingerprint: SOURCE_FINGERPRINT,
  lines: [{ lineId: 'line-1', text: 'hello' }],
  targetLineId: 'line-1',
});
const CURRENT_LYRICS = Object.freeze({
  timing: {
    normalizerProfileId: 'profile-1',
    sourceFingerprint: SOURCE_FINGERPRINT,
  },
});

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

function parseAppError(error) {
  const raw = String(error?.message || '');
  const index = raw.indexOf(APP_ERROR_PREFIX);
  expect(index).toBeGreaterThanOrEqual(0);
  return JSON.parse(raw.slice(index + APP_ERROR_PREFIX.length));
}

function register(overrides = {}) {
  const ipcMain = createIpcMain();
  registerLyricsReadingHandlers({
    ipcMain,
    getConfig: () => ({}),
    resolveDownloadDir: () => 'library-dir',
    getMainWindow: () => null,
    notifyLibraryUpdated: vi.fn(),
    recordDiagnostic: vi.fn().mockReturnValue({ ok: true }),
    runReadingWorker: vi.fn().mockResolvedValue({ lines: [] }),
    resolveReadingTrackDir: vi.fn(() => 'track-dir'),
    readReadingTrackLyrics: vi.fn(() => CURRENT_LYRICS),
    getReadingTrackLyricsState: vi.fn(() => ({
      sources: [{ filename: 'a.lrc' }],
    })),
    loadReadingForIdentity: vi.fn(() => ({ lines: [] })),
    saveReadingForIdentity: vi.fn(() => ({ ok: true, lines: [] })),
    setReadingLineText: vi.fn(() => ({ ok: true })),
    deleteReadingForTrack: vi.fn(),
    ...overrides,
  });
  return ipcMain.handlers;
}

describe('registerLyricsReadingHandlers', () => {
  it('registers exactly the four reading intents', () => {
    const handlers = register();
    expect([...handlers.keys()]).toEqual([
      'lyrics:get-reading',
      'lyrics:generate-reading',
      'lyrics:set-reading-line',
      'lyrics:delete-reading',
    ]);
  });

  describe('lyrics:get-reading', () => {
    it('rejects an unknown track without recording a diagnostic', async () => {
      const recordDiagnostic = vi.fn();
      const handlers = register({
        recordDiagnostic,
        resolveReadingTrackDir: vi.fn(() => null),
      });

      const error = await handlers
        .get('lyrics:get-reading')(null, 't1', 'a.lrc', VALID_IDENTITY)
        .catch((err) => err);

      expect(parseAppError(error).code).toBe('LYRICS_READING_UNKNOWN_TRACK');
      expect(recordDiagnostic).not.toHaveBeenCalled();
    });

    it('rejects a stale identity without recording a diagnostic', async () => {
      const recordDiagnostic = vi.fn();
      const handlers = register({
        recordDiagnostic,
        readReadingTrackLyrics: vi.fn(() => ({
          timing: { normalizerProfileId: 'different' },
        })),
      });

      const error = await handlers
        .get('lyrics:get-reading')(null, 't1', 'a.lrc', VALID_IDENTITY)
        .catch((err) => err);

      expect(parseAppError(error).code).toBe('LYRICS_READING_IDENTITY_STALE');
      expect(recordDiagnostic).not.toHaveBeenCalled();
    });

    it('records an operational load failure and rethrows a safe AppError', async () => {
      const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
      const handlers = register({
        recordDiagnostic,
        loadReadingForIdentity: vi.fn(() => {
          throw new Error('ENOENT: /Users/someone/reading.json');
        }),
      });

      const error = await handlers
        .get('lyrics:get-reading')(null, 't1', 'a.lrc', VALID_IDENTITY)
        .catch((err) => err);

      const payload = parseAppError(error);
      expect(payload.code).toBe('LYRICS_READING_LOAD_FAILED');
      expect(payload.context.diagnosticRecorded).toBe(true);
      expect(String(payload.message)).not.toMatch(/Users/);
      expect(recordDiagnostic).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'lyrics-reading', operation: 'get' }),
      );
    });

    it('returns the loaded reading document on success', async () => {
      const loadReadingForIdentity = vi.fn(() => ({ lines: ['ok'] }));
      const handlers = register({ loadReadingForIdentity });

      await expect(
        handlers.get('lyrics:get-reading')(null, 't1', 'a.lrc', VALID_IDENTITY),
      ).resolves.toEqual({ lines: ['ok'] });
    });
  });

  describe('lyrics:generate-reading', () => {
    it('rejects an unsupported script without recording a diagnostic', async () => {
      const recordDiagnostic = vi.fn();
      const runReadingWorker = vi.fn();
      const handlers = register({ recordDiagnostic, runReadingWorker });

      const error = await handlers
        .get('lyrics:generate-reading')(
          null,
          't1',
          'a.lrc',
          VALID_IDENTITY,
          'zh',
        )
        .catch((err) => err);

      expect(parseAppError(error).code).toBe(
        'LYRICS_READING_UNSUPPORTED_SCRIPT',
      );
      expect(recordDiagnostic).not.toHaveBeenCalled();
      expect(runReadingWorker).not.toHaveBeenCalled();
    });

    it('rejects an unknown lyrics source without recording a diagnostic', async () => {
      const recordDiagnostic = vi.fn();
      const handlers = register({
        recordDiagnostic,
        getReadingTrackLyricsState: vi.fn(() => ({ sources: [] })),
      });

      const error = await handlers
        .get('lyrics:generate-reading')(
          null,
          't1',
          'missing.lrc',
          VALID_IDENTITY,
          'ja',
        )
        .catch((err) => err);

      expect(parseAppError(error).code).toBe('LYRICS_READING_UNKNOWN_SOURCE');
      expect(recordDiagnostic).not.toHaveBeenCalled();
    });

    it('rejects a concurrent generate call for the same track/source', async () => {
      let releaseWorker;
      const runReadingWorker = vi.fn(
        () => new Promise((resolve) => (releaseWorker = resolve)),
      );
      const handlers = register({ runReadingWorker });
      const generate = handlers.get('lyrics:generate-reading');

      const first = generate(null, 't1', 'a.lrc', VALID_IDENTITY, 'ja');
      const second = await generate(
        null,
        't1',
        'a.lrc',
        VALID_IDENTITY,
        'ja',
      ).catch((err) => err);

      expect(parseAppError(second).code).toBe('LYRICS_READING_IN_PROGRESS');
      releaseWorker({ lines: [] });
      await first;
    });

    it('records a worker failure and rethrows a safe AppError', async () => {
      const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
      const handlers = register({
        recordDiagnostic,
        runReadingWorker: vi
          .fn()
          .mockRejectedValue(new Error('worker crashed')),
      });

      const error = await handlers
        .get('lyrics:generate-reading')(
          null,
          't1',
          'a.lrc',
          VALID_IDENTITY,
          'ja',
        )
        .catch((err) => err);

      const payload = parseAppError(error);
      expect(payload.code).toBe('LYRICS_READING_GENERATE_FAILED');
      expect(payload.context.diagnosticRecorded).toBe(true);
      expect(recordDiagnostic).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'lyrics-reading',
          operation: 'generate',
        }),
      );
    });

    it('rejects a post-worker stale identity without recording it as an operational failure', async () => {
      const recordDiagnostic = vi.fn();
      const readReadingTrackLyrics = vi
        .fn()
        // Pre-flight check passes, then the identity goes stale while the
        // worker is running (post-worker re-validation must catch it).
        .mockReturnValueOnce(CURRENT_LYRICS)
        .mockReturnValue({ timing: { normalizerProfileId: 'different' } });
      const handlers = register({ recordDiagnostic, readReadingTrackLyrics });

      const error = await handlers
        .get('lyrics:generate-reading')(
          null,
          't1',
          'a.lrc',
          VALID_IDENTITY,
          'ja',
        )
        .catch((err) => err);

      // Must be the specific stale-identity code, not the generic
      // generate-failed one — proves the two diagnostic wraps around the
      // worker call and the save call don't swallow this in between.
      expect(parseAppError(error).code).toBe('LYRICS_READING_IDENTITY_STALE');
      expect(recordDiagnostic).not.toHaveBeenCalled();
    });

    it('records a save failure and rethrows a safe AppError', async () => {
      const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
      const handlers = register({
        recordDiagnostic,
        saveReadingForIdentity: vi.fn(() => null),
      });

      const error = await handlers
        .get('lyrics:generate-reading')(
          null,
          't1',
          'a.lrc',
          VALID_IDENTITY,
          'ja',
        )
        .catch((err) => err);

      const payload = parseAppError(error);
      expect(payload.code).toBe('LYRICS_READING_SAVE_FAILED');
      expect(payload.context.diagnosticRecorded).toBe(true);
      expect(recordDiagnostic).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'lyrics-reading',
          operation: 'save',
        }),
      );
    });

    it('saves the generated reading and notifies the library on success', async () => {
      const notifyLibraryUpdated = vi.fn();
      const saveReadingForIdentity = vi.fn(() => ({ saved: true }));
      const handlers = register({
        notifyLibraryUpdated,
        saveReadingForIdentity,
      });

      await expect(
        handlers.get('lyrics:generate-reading')(
          null,
          't1',
          'a.lrc',
          VALID_IDENTITY,
          'ja',
        ),
      ).resolves.toEqual({ saved: true });
      expect(notifyLibraryUpdated).toHaveBeenCalledOnce();

      // The in-progress lock must be released even on success, so an
      // immediate second call isn't wrongly rejected as concurrent.
      await expect(
        handlers.get('lyrics:generate-reading')(
          null,
          't1',
          'a.lrc',
          VALID_IDENTITY,
          'ja',
        ),
      ).resolves.toEqual({ saved: true });
    });
  });

  describe('lyrics:set-reading-line', () => {
    it('records an update failure and rethrows a safe AppError', async () => {
      const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
      const handlers = register({
        recordDiagnostic,
        setReadingLineText: vi.fn(() => null),
      });

      const error = await handlers
        .get('lyrics:set-reading-line')(
          null,
          't1',
          'a.lrc',
          VALID_IDENTITY,
          'かな',
        )
        .catch((err) => err);

      const payload = parseAppError(error);
      expect(payload.code).toBe('LYRICS_READING_SET_LINE_FAILED');
      expect(payload.context.diagnosticRecorded).toBe(true);
    });

    it('updates the line and notifies the library on success', async () => {
      const notifyLibraryUpdated = vi.fn();
      const handlers = register({
        notifyLibraryUpdated,
        setReadingLineText: vi.fn(() => ({ updated: true })),
      });

      await expect(
        handlers.get('lyrics:set-reading-line')(
          null,
          't1',
          'a.lrc',
          VALID_IDENTITY,
          'かな',
        ),
      ).resolves.toEqual({ updated: true });
      expect(notifyLibraryUpdated).toHaveBeenCalledOnce();
    });
  });

  describe('lyrics:delete-reading', () => {
    it('records a delete failure and rethrows a safe AppError', async () => {
      const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
      const handlers = register({
        recordDiagnostic,
        deleteReadingForTrack: vi.fn(() => {
          throw new Error('EACCES: permission denied');
        }),
      });

      const error = await handlers
        .get('lyrics:delete-reading')(null, 't1', 'a.lrc')
        .catch((err) => err);

      const payload = parseAppError(error);
      expect(payload.code).toBe('LYRICS_READING_DELETE_FAILED');
      expect(payload.context.diagnosticRecorded).toBe(true);
    });

    it('deletes the reading and notifies the library on success', async () => {
      const notifyLibraryUpdated = vi.fn();
      const handlers = register({ notifyLibraryUpdated });

      await expect(
        handlers.get('lyrics:delete-reading')(null, 't1', 'a.lrc'),
      ).resolves.toEqual({ ok: true });
      expect(notifyLibraryUpdated).toHaveBeenCalledOnce();
    });
  });
});
