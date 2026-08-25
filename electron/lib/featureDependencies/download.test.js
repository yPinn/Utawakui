import { describe, expect, it, vi } from 'vitest';
import {
  dependencyDownloadLabel,
  downloadBuffer,
  downloadText,
  emitProgress,
  sha256,
} from './download.js';

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

  it('downloads and trims dependency metadata', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '  2026.08.25\n',
    });

    await expect(
      downloadText('https://example.test/metadata', fetchImpl),
    ).resolves.toBe('2026.08.25');
  });
});
