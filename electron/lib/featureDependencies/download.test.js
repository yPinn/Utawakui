import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dependencyDownloadLabel,
  downloadBuffer,
  downloadText,
  emitProgress,
  sha256,
} from './download.js';

// Mirrors real fetch()/AbortController interop: rejects with an AbortError
// once the request's own signal fires, rather than just hanging forever the
// way a naive mock would — that's the failure mode this file's timeout
// handling exists to escape.
function neverRespondingFetch() {
  return vi.fn(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      }),
  );
}

function arrayBufferFrom(buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}

function streamResponse(chunks, contentLength = null) {
  let index = 0;
  return {
    ok: true,
    headers: {
      get: (name) =>
        name === 'content-length' && contentLength !== null
          ? String(contentLength)
          : null,
    },
    body: {
      getReader: () => ({
        read: vi.fn(async () =>
          index < chunks.length
            ? { done: false, value: Uint8Array.from(chunks[index++]) }
            : { done: true },
        ),
      }),
    },
  };
}

describe('feature dependency downloads', () => {
  it('hashes buffers and chooses a bounded public dependency label', () => {
    expect(sha256(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(dependencyDownloadLabel({ role: 'runtime' })).toBe('runtime');
    expect(dependencyDownloadLabel({ id: 'ffmpeg' })).toBe('ffmpeg');
    expect(dependencyDownloadLabel({ name: 'Model' })).toBe('Model');
    expect(dependencyDownloadLabel(null)).toBe('dependency');
  });

  it('emits progress only when a callback exists', () => {
    const onProgress = vi.fn();
    expect(() => emitProgress({}, { stage: 'downloading' })).not.toThrow();
    emitProgress({ onProgress }, { stage: 'downloading', percent: 25 });
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'downloading',
      percent: 25,
    });
  });

  it('downloads a non-streaming response and reports completion', async () => {
    const payload = Buffer.from('payload');
    const onProgress = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      body: null,
      arrayBuffer: async () => arrayBufferFrom(payload),
    });

    await expect(
      downloadBuffer('https://example.test/tool', fetchImpl, { onProgress }),
    ).resolves.toEqual(payload);
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'downloading',
      percent: 100,
    });
  });

  it('streams chunks with deduplicated percentage progress', async () => {
    const onProgress = vi.fn();
    const response = streamResponse([[1], [2, 3], [4]], 4);

    await expect(
      downloadBuffer(
        'https://example.test/tool',
        vi.fn().mockResolvedValue(response),
        { onProgress },
        { id: 'tool', maxDownloadSize: 4 },
      ),
    ).resolves.toEqual(Buffer.from([1, 2, 3, 4]));
    expect(onProgress.mock.calls.map(([event]) => event.percent)).toEqual([
      25, 75, 100,
    ]);
  });

  it('reports indeterminate progress when content length is unavailable', async () => {
    const onProgress = vi.fn();
    const response = streamResponse([[1, 2], [3]]);

    await downloadBuffer(
      'https://example.test/tool',
      vi.fn().mockResolvedValue(response),
      { onProgress },
      { expectedSize: 3 },
    );

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, { stage: 'downloading' });
  });

  it('rejects an oversized declared response before reading it', async () => {
    const arrayBuffer = vi.fn();
    const response = {
      ok: true,
      headers: { get: () => '11' },
      body: null,
      arrayBuffer,
    };

    await expect(
      downloadBuffer(
        'https://example.test/tool',
        vi.fn().mockResolvedValue(response),
        {},
        { role: 'runtime', maxDownloadSize: 10 },
      ),
    ).rejects.toThrow(/runtime exceeds allowed size \(11 > 10\)/);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects oversized buffered and streamed bodies', async () => {
    const payload = Buffer.from('1234');
    const bufferedResponse = {
      ok: true,
      headers: { get: () => 'invalid' },
      body: null,
      arrayBuffer: async () => arrayBufferFrom(payload),
    };
    await expect(
      downloadBuffer(
        'https://example.test/tool',
        vi.fn().mockResolvedValue(bufferedResponse),
        {},
        { id: 'tool', expectedSize: 3 },
      ),
    ).rejects.toThrow(/tool exceeds allowed size \(4 > 3\)/);

    await expect(
      downloadBuffer(
        'https://example.test/tool',
        vi.fn().mockResolvedValue(
          streamResponse([
            [1, 2],
            [3, 4],
          ]),
        ),
        {},
        { id: 'tool', maxDownloadSize: 3 },
      ),
    ).rejects.toThrow(/tool exceeds allowed size \(4 > 3\)/);
  });

  it('rejects unsuccessful binary and metadata responses', async () => {
    await expect(
      downloadBuffer(
        'https://example.test/tool',
        vi.fn().mockResolvedValue({ ok: false, status: 503 }),
      ),
    ).rejects.toThrow(/HTTP 503/);
    await expect(
      downloadText(
        'https://example.test/metadata',
        vi.fn().mockResolvedValue({ ok: false, status: 404 }),
      ),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('cancels a still-open streamed body on an unsuccessful response', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('already closed'));

    await expect(
      downloadBuffer(
        'https://example.test/tool',
        vi.fn().mockResolvedValue({ ok: false, status: 500, body: { cancel } }),
      ),
    ).rejects.toThrow(/HTTP 500/);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('passes a non-timeout connection failure through unchanged', async () => {
    const connectionReset = new Error('ECONNRESET');

    await expect(
      downloadBuffer(
        'https://example.test/tool',
        vi.fn().mockRejectedValue(connectionReset),
      ),
    ).rejects.toBe(connectionReset);

    await expect(
      downloadText(
        'https://example.test/metadata',
        vi.fn().mockRejectedValue(connectionReset),
      ),
    ).rejects.toBe(connectionReset);
  });

  it('downloads and trims dependency metadata', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '  2026.08.25\n',
    });

    await expect(
      downloadText('https://example.test/metadata', fetchImpl),
    ).resolves.toBe('2026.08.25');
  });

  describe('stalled connections', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('rejects downloadBuffer instead of hanging forever when nothing ever responds', async () => {
      vi.useFakeTimers();
      const fetchImpl = neverRespondingFetch();

      const promise = downloadBuffer(
        'https://example.test/tool',
        fetchImpl,
        {},
        null,
        30_000,
      );
      const assertion = expect(promise).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    });

    it('rejects downloadBuffer when the stream goes silent mid-transfer', async () => {
      vi.useFakeTimers();
      const fetchImpl = vi.fn((_url, init) => {
        let callCount = 0;
        return Promise.resolve({
          ok: true,
          headers: { get: () => null },
          body: {
            getReader: () => ({
              read: () => {
                callCount += 1;
                if (callCount === 1) {
                  return Promise.resolve({
                    done: false,
                    value: Uint8Array.from([1]),
                  });
                }
                // The second chunk never arrives; only an abort settles this.
                return new Promise((_resolve, reject) => {
                  init.signal.addEventListener('abort', () => {
                    reject(
                      Object.assign(new Error('aborted'), {
                        name: 'AbortError',
                      }),
                    );
                  });
                });
              },
            }),
          },
        });
      });

      const promise = downloadBuffer(
        'https://example.test/tool',
        fetchImpl,
        {},
        null,
        30_000,
      );
      const assertion = expect(promise).rejects.toThrow(/timed out/i);
      // The first chunk resets the idle window, so only the silence after it
      // needs to reach the full 30s for the abort to fire.
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    });

    it('does not abort a slow-but-still-progressing download', async () => {
      vi.useFakeTimers();
      const steps = [
        { delayMs: 20_000, bytes: [1] },
        { delayMs: 20_000, bytes: [2] },
        { delayMs: 20_000 },
      ];
      let index = 0;
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        body: {
          getReader: () => ({
            read: () =>
              new Promise((resolve) => {
                const step = steps[index++];
                setTimeout(() => {
                  resolve(
                    step.bytes
                      ? { done: false, value: Uint8Array.from(step.bytes) }
                      : { done: true },
                  );
                }, step.delayMs);
              }),
          }),
        },
      });

      const promise = downloadBuffer(
        'https://example.test/tool',
        fetchImpl,
        {},
        null,
        30_000, // idle window shorter than the 60s total, but longer than each 20s gap
      );
      await vi.advanceTimersByTimeAsync(20_000);
      await vi.advanceTimersByTimeAsync(20_000);
      await vi.advanceTimersByTimeAsync(20_000);

      await expect(promise).resolves.toEqual(Buffer.from([1, 2]));
    });

    it('rejects downloadText instead of hanging forever when nothing ever responds', async () => {
      const fetchImpl = neverRespondingFetch();

      await expect(
        downloadText('https://example.test/metadata', fetchImpl, 20),
      ).rejects.toThrow(/timed out/i);
    });
  });
});
