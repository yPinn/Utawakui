import { describe, expect, it, vi } from 'vitest';
import { registerLyricsResearchHandlers } from './researchHandlers.js';
function setup() {
  const handlers = new Map();
  const service = Object.fromEntries(
    [
      'status',
      'prepare',
      'verify',
      'remove',
      'cancel',
      'inspect',
      'preview',
    ].map((name) => [
      name,
      vi.fn(async () => ({ researchOnly: true, status: 'ready' })),
    ]),
  );
  const recordDiagnostic = vi.fn(() => ({ ok: true }));
  registerLyricsResearchHandlers({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    service,
    recordDiagnostic,
  });
  return { handlers, service, recordDiagnostic };
}
describe('research-only IPC boundary', () => {
  it('has fixed actions and rejects executable, source paths and surplus arguments', async () => {
    const { handlers, service } = setup();
    expect(handlers.size).toBe(7);
    for (const operation of [
      'status',
      'prepare',
      'verify',
      'remove',
      'cancel',
    ]) {
      await expect(
        handlers.get(`lyrics-research:${operation}`)(null, {
          root: 'C:/private',
        }),
      ).rejects.toThrow();
      expect(service[operation]).not.toHaveBeenCalled();
      await handlers.get(`lyrics-research:${operation}`)(null);
      expect(service[operation]).toHaveBeenCalledWith();
    }
    for (const operation of ['inspect', 'preview']) {
      const handler = handlers.get(`lyrics-research:${operation}`);
      const intent = { trackId: 'a', language: 'ja', lineIndex: 2 };
      await handler(null, intent);
      expect(service[operation]).toHaveBeenCalledWith(intent);
      for (const args of [
        [],
        [intent, 'extra'],
        [{ ...intent, filename: '../x' }],
        [{ ...intent, trackId: '../outside' }],
      ])
        await expect(handler(null, ...args)).rejects.toThrow();
      expect(service[operation]).toHaveBeenCalledTimes(1);
    }
  });
  it('records private failures once and returns only bounded public errors', async () => {
    const { handlers, service, recordDiagnostic } = setup();
    service.preview.mockRejectedValue(
      Error('C:/private/model.onnx https://secret'),
    );
    const intent = { trackId: 'a', language: 'zh', lineIndex: 0 };
    try {
      await handlers.get('lyrics-research:preview')(null, intent);
      throw Error('missing rejection');
    } catch (error) {
      expect(error.message).not.toMatch(/private|secret/);
      expect(error.code).toBe('LYRICS_RESEARCH_FAILED');
    }
    expect(recordDiagnostic).toHaveBeenCalledTimes(1);
  });
});
