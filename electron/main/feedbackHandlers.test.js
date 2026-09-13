import { describe, expect, it, vi } from 'vitest';
import { registerFeedbackHandlers } from './feedbackHandlers.js';

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

function createService(events = []) {
  return { listRecent: vi.fn(() => events) };
}

function bugInput(overrides = {}) {
  return { kind: 'bug', description: '整首歌卡住', ...overrides };
}

describe('registerFeedbackHandlers', () => {
  it('registers exactly the three feedback intents', () => {
    const ipcMain = createIpcMain();
    registerFeedbackHandlers({
      ipcMain,
      service: createService(),
      client: { submit: vi.fn() },
      dialog: {},
    });
    expect([...ipcMain.handlers.keys()]).toEqual([
      'feedback:build-preview',
      'feedback:submit',
      'feedback:export-fallback',
    ]);
  });

  it('builds a preview without contacting the network', async () => {
    const ipcMain = createIpcMain();
    const client = { submit: vi.fn() };
    registerFeedbackHandlers({
      ipcMain,
      service: createService(),
      client,
      dialog: {},
      appVersion: '1.0.0',
      electronVersion: '30.0.0',
      locale: 'zh-TW',
      idGenerator: () => 'preview-id',
      now: () => Date.parse('2026-09-13T00:00:00.000Z'),
    });

    const result = await ipcMain.handlers.get('feedback:build-preview')(
      null,
      bugInput(),
    );

    expect(result.ok).toBe(true);
    expect(result.payload).toMatchObject({
      reportId: 'preview-id',
      kind: 'bug',
      description: '整首歌卡住',
      environment: {
        appVersion: '1.0.0',
        electronVersion: '30.0.0',
        locale: 'zh-TW',
      },
    });
    expect(client.submit).not.toHaveBeenCalled();
  });

  it('returns a mapped error code when preview input is invalid', async () => {
    const ipcMain = createIpcMain();
    registerFeedbackHandlers({
      ipcMain,
      service: createService(),
      client: { submit: vi.fn() },
      dialog: {},
    });

    const result = await ipcMain.handlers.get('feedback:build-preview')(
      null,
      bugInput({ description: '' }),
    );
    expect(result).toEqual({
      ok: false,
      errorCode: 'FEEDBACK_DESCRIPTION_REQUIRED',
    });
  });

  it('only attaches diagnostics for a bug report that requests them', async () => {
    const ipcMain = createIpcMain();
    const service = createService([{ level: 'error', message: 'boom' }]);
    registerFeedbackHandlers({
      ipcMain,
      service,
      client: { submit: vi.fn() },
      dialog: {},
    });
    const buildPreview = ipcMain.handlers.get('feedback:build-preview');

    const withDiagnostics = await buildPreview(
      null,
      bugInput({ includeDiagnostics: true }),
    );
    expect(withDiagnostics.payload.diagnostics).toBeDefined();
    expect(service.listRecent).toHaveBeenCalledTimes(1);

    service.listRecent.mockClear();
    const featureRequest = await buildPreview(null, {
      kind: 'feature',
      description: '希望能加入歌詞跑馬燈',
      includeDiagnostics: true,
    });
    expect(featureRequest.payload).not.toHaveProperty('diagnostics');
    expect(service.listRecent).not.toHaveBeenCalled();
  });

  it('submits the built payload and returns the relay reportId', async () => {
    const ipcMain = createIpcMain();
    const client = {
      submit: vi.fn().mockResolvedValue({ status: 'ok', reportId: 'r-42' }),
    };
    registerFeedbackHandlers({
      ipcMain,
      service: createService(),
      client,
      dialog: {},
    });

    const result = await ipcMain.handlers.get('feedback:submit')(
      null,
      bugInput(),
    );
    expect(result).toEqual({ ok: true, reportId: 'r-42' });
    expect(client.submit).toHaveBeenCalledTimes(1);
  });

  it('maps a client submission failure to a generic submit-failed result', async () => {
    const ipcMain = createIpcMain();
    const client = {
      submit: vi.fn().mockResolvedValue({ status: 'error', reason: 'offline' }),
    };
    registerFeedbackHandlers({
      ipcMain,
      service: createService(),
      client,
      dialog: {},
    });

    const result = await ipcMain.handlers.get('feedback:submit')(
      null,
      bugInput(),
    );
    expect(result).toEqual({
      ok: false,
      errorCode: 'FEEDBACK_SUBMIT_FAILED',
      reason: 'offline',
    });
  });

  it('rate-limits submissions within the configured window', async () => {
    const ipcMain = createIpcMain();
    const client = {
      submit: vi.fn().mockResolvedValue({ status: 'ok', reportId: 'r' }),
    };
    let currentTime = 0;
    registerFeedbackHandlers({
      ipcMain,
      service: createService(),
      client,
      dialog: {},
      now: () => currentTime,
      maxSubmissionsPerWindow: 2,
    });
    const submit = ipcMain.handlers.get('feedback:submit');

    await expect(submit(null, bugInput())).resolves.toMatchObject({
      ok: true,
    });
    await expect(submit(null, bugInput())).resolves.toMatchObject({
      ok: true,
    });
    await expect(submit(null, bugInput())).resolves.toEqual({
      ok: false,
      errorCode: 'FEEDBACK_RATE_LIMITED',
    });

    // Advancing past the window resets the counter.
    currentTime += 10 * 60 * 1000 + 1;
    await expect(submit(null, bugInput())).resolves.toMatchObject({
      ok: true,
    });
  });

  it('treats a cancelled export-fallback dialog as success with no write', async () => {
    const ipcMain = createIpcMain();
    const writeExportFile = vi.fn();
    const dialog = {
      showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
    };
    registerFeedbackHandlers({
      ipcMain,
      service: createService(),
      client: { submit: vi.fn() },
      dialog,
      getMainWindow: () => null,
      writeExportFile,
    });

    const result = await ipcMain.handlers.get('feedback:export-fallback')(
      null,
      bugInput(),
    );
    expect(result).toEqual({ ok: true, cancelled: true });
    expect(writeExportFile).not.toHaveBeenCalled();
  });

  it('writes the payload to the chosen path on export-fallback', async () => {
    const ipcMain = createIpcMain();
    const writeExportFile = vi.fn();
    const dialog = {
      showSaveDialog: vi
        .fn()
        .mockResolvedValue({ canceled: false, filePath: 'C:/tmp/out.json' }),
    };
    registerFeedbackHandlers({
      ipcMain,
      service: createService(),
      client: { submit: vi.fn() },
      dialog,
      getMainWindow: () => null,
      writeExportFile,
    });

    const result = await ipcMain.handlers.get('feedback:export-fallback')(
      null,
      bugInput(),
    );
    expect(result).toEqual({ ok: true, cancelled: false });
    expect(writeExportFile).toHaveBeenCalledTimes(1);
    expect(writeExportFile.mock.calls[0][0]).toBe('C:/tmp/out.json');
    expect(writeExportFile.mock.calls[0][1]).toMatchObject({ kind: 'bug' });
  });
});
