import { describe, expect, it, vi } from 'vitest';
import { registerLyricsExperimentalHandlers } from './experimentalHandlers.js';
function setup() {
  const handlers = new Map(),
    queue = {
      status: vi.fn(),
      setEnabled: vi.fn(),
      cancel: vi.fn(),
      enqueue: vi.fn(() => true),
    },
    loadEstimate = vi.fn(),
    recordDiagnostic = vi.fn();
  registerLyricsExperimentalHandlers({
    ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
    queue,
    loadEstimate,
    recordDiagnostic,
  });
  return { handlers, queue, loadEstimate, recordDiagnostic };
}
describe('bounded experimental lyrics IPC', () => {
  it('awaits admission and accepts only a bounded job id for source-specific cancellation', async () => {
    const { handlers, queue } = setup();
    queue.enqueue.mockResolvedValueOnce(false);
    expect(
      await handlers.get('lyrics-experimental:retry')(
        null,
        'song',
        'auto',
        'a.lrc',
      ),
    ).toEqual({ queued: false });
    const jobId = '12345678-1234-1234-1234-123456789abc';
    await handlers.get('lyrics-experimental:cancel')(null, 'song', jobId);
    expect(queue.cancel).toHaveBeenCalledWith('song', jobId);
    await expect(
      handlers.get('lyrics-experimental:cancel')(null, 'song', '../a.lrc'),
    ).rejects.toThrow();
  });
  it('accepts only fixed product intents and never renderer paths or model configuration', async () => {
    const { handlers, queue, loadEstimate } = setup();
    expect(handlers.size).toBe(5);
    await handlers.get('lyrics-experimental:status')(null);
    await handlers.get('lyrics-experimental:enable')(null, true);
    await handlers.get('lyrics-experimental:cancel')(null, 'song');
    expect(
      await handlers.get('lyrics-experimental:retry')(null, 'song'),
    ).toEqual({ queued: true });
    await handlers.get('lyrics-experimental:estimate')(null, 'song', 'zh.vtt');
    expect(queue.setEnabled).toHaveBeenCalledWith(true);
    await handlers.get('lyrics-experimental:retry')(null, 'song', 'ja');
    expect(queue.enqueue).toHaveBeenCalledWith('song', 'ja');
    await handlers.get('lyrics-experimental:retry')(
      null,
      'song',
      'auto',
      'active.lrc',
    );
    expect(queue.enqueue).toHaveBeenCalledWith('song', 'auto', 'active.lrc');
    expect(loadEstimate).toHaveBeenCalledWith('song', 'zh.vtt');
    for (const [operation, args] of [
      ['status', [true]],
      ['enable', ['true']],
      ['cancel', ['../x']],
      ['retry', [{ model: 'x' }]],
      ['retry', ['song', 'ko']],
      ['retry', ['song', { language: 'ja' }]],
      ['retry', ['song', 'ja', 'extra']],
      ['retry', ['song', 'ja', '../active.lrc']],
      ['retry', ['song', 'ja', 'active.lrc', true]],
      ['estimate', ['song', '../zh.vtt']],
      ['estimate', ['song', 'zh.vtt', 'extra']],
    ])
      await expect(
        handlers.get(`lyrics-experimental:${operation}`)(null, ...args),
      ).rejects.toThrow();
  });
  it('keeps private failures inside diagnostics', async () => {
    const { handlers, loadEstimate, recordDiagnostic } = setup();
    loadEstimate.mockRejectedValue(Error('C:/private/model'));
    const error = await handlers
      .get('lyrics-experimental:estimate')(null, 'song', 'zh.vtt')
      .catch((e) => e);
    expect(error.message).not.toContain('C:/private');
    expect(recordDiagnostic).toHaveBeenCalledTimes(1);
  });
});
