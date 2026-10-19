import { describe, it, expect, vi } from 'vitest';
import { registerLyricsAcousticCapabilityHandlers } from './acousticCapabilityHandlers.js';
function fixture() {
  const handlers = new Map(),
    gate = vi.fn(),
    record = vi.fn(() => ({ ok: true }));
  const status = { status: 'missing', installed: false, canPrepare: true };
  const service = {
    getStatus: () => status,
    prepare: vi.fn(async () => ({ ...status, status: 'ready' })),
    verify: vi.fn(),
    repair: vi.fn(),
    remove: vi.fn(),
    cancel: vi.fn(async () => ({ cancelled: true })),
  };
  registerLyricsAcousticCapabilityHandlers({
    ipcMain: { handle: (c, h) => handlers.set(c, h) },
    capability: service,
    requireFeatureGate: gate,
    featureId: 'audio-processing-flow',
    recordDiagnostic: record,
  });
  return { handlers, gate, record, service };
}
describe('optional lyrics environment IPC', () => {
  it('reports unavailable without blocking the app and treats the catalog gate as expected', async () => {
    const handlers = new Map(),
      gate = vi.fn();
    registerLyricsAcousticCapabilityHandlers({
      ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
      capability: null,
      requireFeatureGate: gate,
    });
    expect((await handlers.get('lyrics-acoustic:status')()).status).toBe(
      'unavailable',
    );
    expect((await handlers.get('lyrics-acoustic:prepare')()).canPrepare).toBe(
      false,
    );
    expect(await handlers.get('lyrics-acoustic:cancel')()).toEqual({
      cancelled: false,
    });
    const h = fixture();
    h.service.prepare.mockRejectedValueOnce(
      Object.assign(Error('blocked'), { code: 'LYRICS_ENV_BLOCKED' }),
    );
    expect((await h.handlers.get('lyrics-acoustic:prepare')()).status).toBe(
      'missing',
    );
    expect(h.record).not.toHaveBeenCalled();
  });
  it('has only fixed no-argument intents; status is read-only and every mutation rechecks gate', async () => {
    const h = fixture();
    expect(h.handlers.size).toBe(6);
    expect((await h.handlers.get('lyrics-acoustic:status')()).status).toBe(
      'missing',
    );
    expect(h.gate).not.toHaveBeenCalled();
    for (const operation of ['prepare', 'verify', 'repair', 'remove'])
      await h.handlers.get('lyrics-acoustic:' + operation)();
    expect(h.gate).toHaveBeenCalledTimes(4);
    await expect(
      h.handlers.get('lyrics-acoustic:prepare')(null, { path: 'private' }),
    ).rejects.toThrow();
    expect(h.service.prepare).toHaveBeenCalledTimes(1);
    h.gate.mockImplementation(() => {
      throw Error('disabled');
    });
    await expect(h.handlers.get('lyrics-acoustic:repair')()).rejects.toThrow(
      'disabled',
    );
    expect(await h.handlers.get('lyrics-acoustic:cancel')()).toEqual({
      cancelled: true,
    });
  });
  it('does not record cancellation as failure and keeps operational paths private', async () => {
    const h = fixture();
    h.service.prepare.mockRejectedValueOnce(
      new DOMException('cancelled', 'AbortError'),
    );
    expect(await h.handlers.get('lyrics-acoustic:prepare')()).toMatchObject({
      cancelled: true,
      status: 'missing',
    });
    expect(h.record).not.toHaveBeenCalled();
    h.service.prepare.mockRejectedValueOnce(
      Error('C:/private/model.onnx secret'),
    );
    const error = await h.handlers
      .get('lyrics-acoustic:prepare')()
      .catch((error) => error);
    expect(error).toMatchObject({
      publicMessage: '歌詞音訊輔助環境操作未完成。',
      context: { diagnosticRecorded: true },
    });
    expect(error.message).not.toContain('private');
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'lyrics-acoustic-environment',
        operation: 'prepare',
      }),
    );
  });
});
