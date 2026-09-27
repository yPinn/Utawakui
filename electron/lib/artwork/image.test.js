import { describe, expect, it, vi } from 'vitest';
import {
  downloadValidatedArtwork,
  inspectArtworkImage,
  MAX_ARTWORK_PIXELS,
} from './image.js';

function pngBuffer(width, height) {
  const buffer = Buffer.alloc(32);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function response(buffer, options = {}) {
  return new Response(buffer, {
    status: options.status ?? 200,
    headers: {
      'Content-Type': options.contentType ?? 'image/png',
      ...(options.headers || {}),
    },
  });
}

describe('artwork image validation', () => {
  it('derives MIME, extension, and dimensions from magic bytes', () => {
    expect(inspectArtworkImage(pngBuffer(500, 500))).toEqual({
      mimeType: 'image/png',
      extension: '.png',
      width: 500,
      height: 500,
    });
    expect(inspectArtworkImage(Buffer.from('not an image'))).toBe(null);
  });

  it('manually follows only CAA/Internet Archive redirects and returns validated bytes', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: 'https://archive.org/download/x/front.png' },
        }),
      )
      .mockResolvedValueOnce(response(pngBuffer(1200, 1200)));

    await expect(
      downloadValidatedArtwork(
        'https://coverartarchive.org/release/x/front-1200',
        { fetch },
      ),
    ).resolves.toMatchObject({
      status: 'ok',
      image: {
        extension: '.png',
        mimeType: 'image/png',
        width: 1200,
        height: 1200,
        buffer: expect.any(Buffer),
      },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].redirect).toBe('manual');
  });

  it('rejects disallowed redirects, MIME mismatch, unsafe dimensions, and declared oversize bodies', async () => {
    const disallowed = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: 'https://evil.example/front.png' },
      }),
    );
    await expect(
      downloadValidatedArtwork('https://coverartarchive.org/release/x/front', {
        fetch: disallowed,
      }),
    ).resolves.toEqual({ status: 'error', reason: 'redirect-not-allowed' });

    await expect(
      downloadValidatedArtwork('https://archive.org/download/x/front.jpg', {
        fetch: vi
          .fn()
          .mockResolvedValue(
            response(pngBuffer(500, 500), { contentType: 'image/jpeg' }),
          ),
      }),
    ).resolves.toEqual({ status: 'error', reason: 'mime-mismatch' });

    await expect(
      downloadValidatedArtwork('https://archive.org/download/x/front.png', {
        fetch: vi.fn().mockResolvedValue(response(pngBuffer(20, 20))),
      }),
    ).resolves.toEqual({ status: 'error', reason: 'invalid-dimensions' });

    expect(MAX_ARTWORK_PIXELS).toBeLessThan(12_000 * 12_000);
    await expect(
      downloadValidatedArtwork('https://archive.org/download/x/front.png', {
        fetch: vi.fn().mockResolvedValue(response(pngBuffer(12_000, 12_000))),
      }),
    ).resolves.toEqual({ status: 'error', reason: 'invalid-dimensions' });

    const cancel = vi.fn().mockResolvedValue(undefined);
    const oversized = {
      ok: true,
      status: 200,
      headers: new Headers({
        'Content-Type': 'image/png',
        'Content-Length': String(10 * 1024 * 1024 + 1),
      }),
      body: { cancel },
    };
    await expect(
      downloadValidatedArtwork('https://archive.org/download/x/front.png', {
        fetch: vi.fn().mockResolvedValue(oversized),
      }),
    ).resolves.toEqual({ status: 'error', reason: 'response-too-large' });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
