import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlayerDiagnostics } from './usePlayerDiagnostics.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bounded player runtime diagnostics', () => {
  it('expires throttling per reason and retains only categorical evidence', () => {
    let time = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => time);
    const recordDiagnostic = vi.fn();
    vi.stubGlobal('window', { Utawakui: { recordDiagnostic } });
    const record = usePlayerDiagnostics({
      track: { usesSeparatedAudio: true, title: 'private' },
    });
    record('media-error', 'media-element', { errorCode: 3 });
    record('media-error', 'media-element', { errorCode: 3 });
    expect(recordDiagnostic).toHaveBeenCalledOnce();
    time += 30000;
    record('media-error', 'media-element', { errorCode: 3 });
    expect(recordDiagnostic).toHaveBeenCalledTimes(2);
    expect(recordDiagnostic.mock.calls[1][0].context).toEqual({
      reason: 'media-element',
      stage: 'separated',
      errorCode: 3,
    });
    expect(JSON.stringify(recordDiagnostic.mock.calls)).not.toContain(
      'private',
    );
  });

  it('fails open when recording throws, rejects, or has no bridge', async () => {
    const recordDiagnostic = vi
      .fn()
      .mockImplementationOnce(() => {
        throw Error('offline');
      })
      .mockRejectedValueOnce(Error('offline'));
    vi.stubGlobal('window', { Utawakui: { recordDiagnostic } });
    const record = usePlayerDiagnostics({ track: null });
    expect(() => record('context-state', 'monitor')).not.toThrow();
    expect(() => record('processor-error', 'capture')).not.toThrow();
    vi.stubGlobal('window', undefined);
    expect(() => record('buffering', 'waiting')).not.toThrow();
    await Promise.resolve();
  });
});
