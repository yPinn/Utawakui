import { describe, expect, it, vi } from 'vitest';
import handlerModule from './lyricsProviderCorpusReviewHandlers.js';

const { registerLyricsProviderCorpusReviewHandlers } = handlerModule;

function ipcMainFixture() {
  const handlers = new Map();
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    },
  };
}

describe('lyrics provider corpus review handlers', () => {
  it('registers no production IPC surface when the development gate is disabled', () => {
    const { ipcMain, handlers } = ipcMainFixture();

    expect(
      registerLyricsProviderCorpusReviewHandlers({
        ipcMain,
        enabled: false,
        service: {},
      }),
    ).toBe(false);
    expect(handlers.size).toBe(0);
  });

  it('registers four fixed development-only intents and ignores renderer paths', async () => {
    const { ipcMain, handlers } = ipcMainFixture();
    const writeClipboardText = vi.fn();
    const openExternal = vi.fn(async () => undefined);
    const service = {
      load: vi.fn(async () => ({ candidates: [] })),
      saveDecision: vi.fn(async (intent) => ({ intent })),
      exportCorpus: vi.fn(async () => ({ exported: true, caseCount: 200 })),
      resolveLookupAction: vi
        .fn()
        .mockResolvedValueOnce({ effect: 'copy', value: 'recording-id' })
        .mockResolvedValueOnce({
          effect: 'open-external',
          value: 'https://musicbrainz.org/recording/recording-id',
        }),
    };

    expect(
      registerLyricsProviderCorpusReviewHandlers({
        ipcMain,
        enabled: true,
        service,
        writeClipboardText,
        openExternal,
      }),
    ).toBe(true);
    expect([...handlers.keys()]).toEqual([
      'lyrics-provider-review:load',
      'lyrics-provider-review:save-decision',
      'lyrics-provider-review:export',
      'lyrics-provider-review:lookup-action',
    ]);

    await handlers.get('lyrics-provider-review:load')(
      null,
      'E:\\untrusted\\candidates.json',
    );
    await handlers.get('lyrics-provider-review:save-decision')(null, {
      candidateId: 'candidate-0000000000000001',
      decision: 'rejected',
      rejectionReason: 'metadata-insufficient',
    });
    await handlers.get('lyrics-provider-review:export')(
      null,
      'E:\\untrusted\\corpus.json',
    );
    const copyIntent = {
      candidateId: 'candidate-0000000000000001',
      action: 'copy-recording-mbid',
    };
    const openIntent = {
      candidateId: 'candidate-0000000000000001',
      action: 'open-musicbrainz-recording',
    };
    await expect(
      handlers.get('lyrics-provider-review:lookup-action')(null, copyIntent),
    ).resolves.toEqual({ completed: true, action: copyIntent.action });
    await expect(
      handlers.get('lyrics-provider-review:lookup-action')(null, openIntent),
    ).resolves.toEqual({ completed: true, action: openIntent.action });

    expect(service.load).toHaveBeenCalledWith();
    expect(service.saveDecision).toHaveBeenCalledWith({
      candidateId: 'candidate-0000000000000001',
      decision: 'rejected',
      rejectionReason: 'metadata-insufficient',
    });
    expect(service.exportCorpus).toHaveBeenCalledWith();
    expect(service.resolveLookupAction).toHaveBeenNthCalledWith(1, copyIntent);
    expect(service.resolveLookupAction).toHaveBeenNthCalledWith(2, openIntent);
    expect(writeClipboardText).toHaveBeenCalledWith('recording-id');
    expect(openExternal).toHaveBeenCalledWith(
      'https://musicbrainz.org/recording/recording-id',
    );
  });

  it('returns bounded public errors without private paths', async () => {
    const { ipcMain, handlers } = ipcMainFixture();
    const recordDiagnostic = vi.fn(() => ({ ok: true }));
    registerLyricsProviderCorpusReviewHandlers({
      ipcMain,
      enabled: true,
      recordDiagnostic,
      service: {
        load: vi.fn(async () => {
          throw new Error('E:\\private\\reviews.json has invalid JSON');
        }),
        saveDecision: vi.fn(async () => {
          throw new Error('E:\\private\\reviews.json could not be replaced');
        }),
        exportCorpus: vi.fn(async () => {
          throw new Error('all 100 candidate reviews must be approved');
        }),
      },
    });

    await expect(handlers.get('lyrics-provider-review:load')()).rejects.toThrow(
      'lyrics provider review could not be loaded',
    );
    await expect(
      handlers.get('lyrics-provider-review:save-decision')(null, {}),
    ).rejects.toThrow('lyrics provider review decision could not be saved');
    await expect(
      handlers.get('lyrics-provider-review:export')(),
    ).rejects.toThrow('lyrics provider review corpus is not ready to export');
    for (const handler of handlers.values()) {
      await expect(handler()).rejects.not.toThrow(/private|reviews\.json/i);
    }
    expect(recordDiagnostic).toHaveBeenCalled();
    expect(recordDiagnostic.mock.calls[0][0]).toMatchObject({
      process: 'main',
      level: 'error',
      source: 'lyrics-provider-review',
      operation: 'load',
      error: expect.objectContaining({
        message: 'E:\\private\\reviews.json has invalid JSON',
      }),
    });
  });
});
