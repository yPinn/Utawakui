import { describe, expect, it, vi } from 'vitest';
import { registerDiagnosticsHandlers } from './diagnosticsHandlers.js';

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

describe('registerDiagnosticsHandlers', () => {
  it('registers only the bounded diagnostics intents', () => {
    const ipcMain = createIpcMain();

    registerDiagnosticsHandlers({
      ipcMain,
      service: { record: vi.fn(), listRecent: vi.fn(), clear: vi.fn() },
      openLogsDirectory: vi.fn(),
    });

    expect([...ipcMain.handlers.keys()]).toEqual([
      'diagnostics:record-renderer',
      'diagnostics:list-recent',
      'diagnostics:clear',
      'diagnostics:open-folder',
      'diagnostics:export',
    ]);
  });

  it('rebuilds renderer events from allowlisted top-level fields', async () => {
    const ipcMain = createIpcMain();
    const record = vi.fn(() => ({ ok: true, event: { id: 'private' } }));
    registerDiagnosticsHandlers({
      ipcMain,
      service: { record, listRecent: vi.fn(), clear: vi.fn() },
      openLogsDirectory: vi.fn(),
    });

    await expect(
      ipcMain.handlers.get('diagnostics:record-renderer')(null, {
        process: 'main',
        level: 'warning',
        source: 'player',
        operation: 'play',
        code: 'PLAYBACK_FAILED',
        message: 'Unable to play C:\\Users\\Alice\\private.mp3',
        correlationId: 'correlation-id',
        context: { stage: 'decode', trackTitle: 'private title' },
        stack: 'private stack',
        arbitrary: { secret: true },
      }),
    ).resolves.toEqual({ ok: true });

    expect(record).toHaveBeenCalledWith({
      process: 'renderer',
      level: 'warning',
      source: 'player',
      operation: 'play',
      code: 'PLAYBACK_FAILED',
      message: 'Unable to play C:\\Users\\Alice\\private.mp3',
      correlationId: 'correlation-id',
      context: { stage: 'decode', trackTitle: 'private title' },
    });
  });

  it('returns a public projection without stack or session identifiers', async () => {
    const ipcMain = createIpcMain();
    const event = {
      schemaVersion: 1,
      id: 'event-id',
      timestamp: '2026-08-22T00:00:00.000Z',
      level: 'error',
      process: 'main',
      source: 'library',
      operation: 'list',
      code: 'FS_READ_FAILED',
      message: 'Unable to read the library',
      sessionId: 'private-session',
      correlationId: 'correlation-id',
      context: { errno: 'EACCES' },
      stack: 'private stack',
    };
    const listRecent = vi.fn(() => [event]);
    registerDiagnosticsHandlers({
      ipcMain,
      service: { record: vi.fn(), listRecent, clear: vi.fn() },
      openLogsDirectory: vi.fn(),
    });

    await expect(
      ipcMain.handlers.get('diagnostics:list-recent')(null, 20),
    ).resolves.toEqual([
      {
        id: 'event-id',
        timestamp: '2026-08-22T00:00:00.000Z',
        level: 'error',
        process: 'main',
        source: 'library',
        operation: 'list',
        code: 'FS_READ_FAILED',
        message: 'Unable to read the library',
        correlationId: 'correlation-id',
        context: { errno: 'EACCES' },
      },
    ]);
    expect(listRecent).toHaveBeenCalledWith(20);
  });

  it('clears records and opens the directory without returning a path', async () => {
    const ipcMain = createIpcMain();
    const clear = vi.fn(() => ({ ok: true, removed: 3 }));
    const openLogsDirectory = vi.fn(async () => '');
    registerDiagnosticsHandlers({
      ipcMain,
      service: { record: vi.fn(), listRecent: vi.fn(), clear },
      openLogsDirectory,
    });

    await expect(ipcMain.handlers.get('diagnostics:clear')()).resolves.toEqual({
      ok: true,
      removed: 3,
    });
    await expect(
      ipcMain.handlers.get('diagnostics:open-folder')(),
    ).resolves.toEqual({ ok: true });
    expect(openLogsDirectory).toHaveBeenCalledOnce();
  });

  it('bounds recent reads and handles invalid renderer payloads fail-open', async () => {
    const ipcMain = createIpcMain();
    const record = vi.fn(() => ({ ok: false, errorCode: 'ENOSPC' }));
    const listRecent = vi.fn(() => []);
    registerDiagnosticsHandlers({
      ipcMain,
      service: { record, listRecent, clear: vi.fn() },
      openLogsDirectory: vi.fn(),
    });

    await expect(
      ipcMain.handlers.get('diagnostics:record-renderer')(null, null),
    ).resolves.toEqual({ ok: false, errorCode: 'ENOSPC' });
    await ipcMain.handlers.get('diagnostics:list-recent')(null, 'all');
    await ipcMain.handlers.get('diagnostics:list-recent')(null, 0);
    await ipcMain.handlers.get('diagnostics:list-recent')(null, 999);

    expect(record).toHaveBeenCalledWith({
      process: 'renderer',
      level: undefined,
      source: undefined,
      operation: undefined,
      code: undefined,
      message: undefined,
      correlationId: undefined,
      context: undefined,
    });
    expect(listRecent.mock.calls).toEqual([[100], [1], [500]]);
  });

  it('maps open-folder failures to one safe code', async () => {
    const ipcMain = createIpcMain();
    const openLogsDirectory = vi
      .fn()
      .mockResolvedValueOnce('private shell error')
      .mockRejectedValueOnce(new Error('private shell failure'));
    registerDiagnosticsHandlers({
      ipcMain,
      service: { record: vi.fn(), listRecent: vi.fn(), clear: vi.fn() },
      openLogsDirectory,
    });
    const openFolder = ipcMain.handlers.get('diagnostics:open-folder');

    await expect(openFolder()).resolves.toEqual({
      ok: false,
      errorCode: 'OPEN_LOGS_DIRECTORY_FAILED',
    });
    await expect(openFolder()).resolves.toEqual({
      ok: false,
      errorCode: 'OPEN_LOGS_DIRECTORY_FAILED',
    });
  });

  it('rate-limits renderer writes without recursively logging the rejection', async () => {
    const ipcMain = createIpcMain();
    const record = vi.fn(() => ({ ok: true }));
    let currentTime = 1000;
    registerDiagnosticsHandlers({
      ipcMain,
      service: { record, listRecent: vi.fn(), clear: vi.fn() },
      openLogsDirectory: vi.fn(),
      now: () => currentTime,
      maxRendererEventsPerMinute: 2,
    });
    const recordRenderer = ipcMain.handlers.get('diagnostics:record-renderer');

    await expect(recordRenderer(null, {})).resolves.toEqual({ ok: true });
    await expect(recordRenderer(null, {})).resolves.toEqual({ ok: true });
    await expect(recordRenderer(null, {})).resolves.toEqual({
      ok: false,
      errorCode: 'DIAGNOSTICS_RATE_LIMITED',
    });
    currentTime += 60_000;
    await expect(recordRenderer(null, {})).resolves.toEqual({ ok: true });

    expect(record).toHaveBeenCalledTimes(3);
  });
});

describe('diagnostics:export', () => {
  function setup({
    dialogResult,
    listRecentResult = [],
    writeExportFile = vi.fn(),
    getMainWindow = () => ({ id: 'main-window' }),
    now = () => Date.parse('2026-09-04T00:00:00.000Z'),
  } = {}) {
    const ipcMain = createIpcMain();
    const dialog = {
      showSaveDialog: vi.fn(async () => dialogResult),
    };
    registerDiagnosticsHandlers({
      ipcMain,
      service: {
        record: vi.fn(),
        listRecent: vi.fn(() => listRecentResult),
        clear: vi.fn(),
      },
      openLogsDirectory: vi.fn(),
      dialog,
      getMainWindow,
      appVersion: '1.2.3',
      electronVersion: '30.0.0',
      now,
      writeExportFile,
    });
    return { ipcMain, dialog, writeExportFile };
  }

  it('writes a support bundle to the user-selected path', async () => {
    const events = [{ level: 'error', message: 'ok' }];
    const writeExportFile = vi.fn();
    const { ipcMain, dialog } = setup({
      dialogResult: {
        canceled: false,
        filePath: 'C:\\Users\\Alice\\export.json',
      },
      listRecentResult: events,
      writeExportFile,
    });

    await expect(ipcMain.handlers.get('diagnostics:export')()).resolves.toEqual(
      { ok: true, cancelled: false },
    );

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(
      { id: 'main-window' },
      expect.objectContaining({
        title: expect.any(String),
        filters: expect.any(Array),
      }),
    );
    expect(writeExportFile).toHaveBeenCalledWith(
      'C:\\Users\\Alice\\export.json',
      expect.objectContaining({
        bundleVersion: 1,
        appVersion: '1.2.3',
        electronVersion: '30.0.0',
        eventCount: 1,
        events,
      }),
    );
  });

  it('treats a cancelled save dialog as expected control flow', async () => {
    const writeExportFile = vi.fn();
    const { ipcMain } = setup({
      dialogResult: { canceled: true, filePath: undefined },
      writeExportFile,
    });

    await expect(ipcMain.handlers.get('diagnostics:export')()).resolves.toEqual(
      { ok: true, cancelled: true },
    );
    expect(writeExportFile).not.toHaveBeenCalled();
  });

  it('treats a save dialog resolved with no chosen path as cancelled', async () => {
    const writeExportFile = vi.fn();
    const { ipcMain } = setup({
      dialogResult: { canceled: false, filePath: '' },
      writeExportFile,
    });

    await expect(ipcMain.handlers.get('diagnostics:export')()).resolves.toEqual(
      { ok: true, cancelled: true },
    );
    expect(writeExportFile).not.toHaveBeenCalled();
  });

  it('calls showSaveDialog without a window when none is available', async () => {
    const { ipcMain, dialog } = setup({
      dialogResult: { canceled: true },
      getMainWindow: () => null,
    });

    await ipcMain.handlers.get('diagnostics:export')();

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.any(String) }),
    );
  });

  it('fails open with one safe code when the dialog throws', async () => {
    const ipcMain = createIpcMain();
    const dialog = {
      showSaveDialog: vi.fn(async () => {
        throw new Error('private dialog failure');
      }),
    };
    registerDiagnosticsHandlers({
      ipcMain,
      service: { record: vi.fn(), listRecent: vi.fn(() => []), clear: vi.fn() },
      openLogsDirectory: vi.fn(),
      dialog,
      getMainWindow: () => null,
    });

    await expect(ipcMain.handlers.get('diagnostics:export')()).resolves.toEqual(
      { ok: false, errorCode: 'DIAGNOSTICS_EXPORT_FAILED' },
    );
  });

  it('fails open with one safe code when writing the export fails', async () => {
    const writeExportFile = vi.fn(() => {
      throw new Error('private write failure: C:\\Users\\Alice\\export.json');
    });
    const { ipcMain } = setup({
      dialogResult: {
        canceled: false,
        filePath: 'C:\\Users\\Alice\\export.json',
      },
      writeExportFile,
    });

    await expect(ipcMain.handlers.get('diagnostics:export')()).resolves.toEqual(
      { ok: false, errorCode: 'DIAGNOSTICS_EXPORT_FAILED' },
    );
  });
});
