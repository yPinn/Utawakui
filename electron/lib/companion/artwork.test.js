import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { readCompanionArtwork } from './artwork.js';
import { createCompanionServer } from './server.js';

const webp = Buffer.from(
  'UklGRk4AAABXRUJQVlA4IEIAAADQAwCdASpAAEAAPm02mEkkIyKhIggAgA2JaQB2AAAgbqagCvELcgAA/vkd2//+QH/+QH/+QH/8gP/+IXeyAwAAAAA=',
  'base64',
);

describe('companion artwork', () => {
  it('resizes a validated image to a small JPEG', async () => {
    const thumbnail = Buffer.from('jpeg');
    const resize = vi.fn(() => ({ toJPEG: () => thumbnail }));
    const createImage = vi.fn(() => ({
      isEmpty: () => false,
      getSize: () => ({ width: 1024, height: 1024 }),
      resize,
    }));
    const filename = new URL(
      '../../../public/assets/icons/app-icon.png',
      import.meta.url,
    );
    expect(await readCompanionArtwork(filename, createImage)).toEqual({
      body: thumbnail,
      type: 'image/jpeg',
    });
    expect(resize).toHaveBeenCalledWith({ width: 160 });
    expect(await readCompanionArtwork(null, createImage)).toBeNull();
  });

  it('preserves transparent PNG in the resized portrait', async () => {
    const thumbnail = Buffer.from('png');
    const resize = vi.fn(() => ({ toPNG: () => thumbnail }));
    const filename = new URL(
      '../../../public/assets/icons/app-icon.png',
      import.meta.url,
    );
    const image = () => ({
      isEmpty: () => false,
      getSize: () => ({ width: 1024, height: 1024 }),
      resize,
    });
    expect(
      await readCompanionArtwork(filename, image, { preserveAlpha: true }),
    ).toEqual({ body: thumbnail, type: 'image/png' });
    expect(resize).toHaveBeenCalledWith({ width: 160 });
  });

  it('preserves a validated WebP without calling nativeImage', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'companion-artwork-'));
    try {
      const filename = join(directory, 'thumbnail.webp');
      await writeFile(filename, webp);
      const createImage = vi.fn();
      expect(await readCompanionArtwork(filename, createImage)).toEqual({
        body: webp,
        type: 'image/webp',
      });
      expect(createImage).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('serves library artwork only to the paired active phone', async () => {
    const credential = 'b'.repeat(43);
    const read = vi.fn(async (id) =>
      id === 'next'
        ? { body: webp, type: 'image/webp' }
        : id === 'other'
          ? null
          : { body: Buffer.from('jpeg'), type: 'image/jpeg' },
    );
    const authenticate = vi.fn((value) =>
      value === credential ? { id: 'phone' } : null,
    );
    let active = true;
    let handle;
    const server = createCompanionServer({
      address: '127.0.0.1',
      port: 19000,
      devices: { authenticate },
      readers: { isActive: () => active },
      artwork: {
        read,
        getSnapshot: () => ({
          state: {
            playback: { track: { id: 'current' } },
            queue: { items: [{ state: 'queued', track: { id: 'next' } }] },
          },
        }),
      },
      createHttpServer(listener) {
        handle = listener;
        return Object.assign(new EventEmitter(), {
          listen: (_port, _address, ready) => ready(),
        });
      },
    });
    await server.start();
    const request = (id, authorization) =>
      new Promise((resolve) => {
        let status;
        let headers;
        handle(
          {
            method: 'GET',
            url: `/m/api/v1/artwork?id=${id}`,
            headers: {
              host: '127.0.0.1:19000',
              authorization,
            },
          },
          {
            writeHead(code, result) {
              status = code;
              headers = result;
            },
            end: (body) => resolve({ status, headers, body }),
          },
        );
      });
    const authorization = `Bearer ${credential}`;
    expect((await request('current')).status).toBe(401);
    active = false;
    expect((await request('current', authorization)).status).toBe(404);
    expect(read).not.toHaveBeenCalled();
    active = true;
    // Not in the library: the reader finds nothing.
    expect((await request('other', authorization)).status).toBe(404);
    // Recent and catalog rows are not in the snapshot queue but still load.
    expect((await request('library', authorization)).status).toBe(200);
    read.mockClear();
    expect(await request('current', authorization)).toMatchObject({
      status: 200,
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
    });
    expect(await request('next', authorization)).toMatchObject({
      status: 200,
      headers: { 'Content-Type': 'image/webp', 'Content-Length': webp.length },
      body: webp,
    });
    expect(read.mock.calls).toEqual([['current'], ['next']]);
  });

  it('resolves published portrait tiles to assets and rechecks Output access after reading', async () => {
    const credential = 'a'.repeat(43);
    const asset = { body: Buffer.from('png'), type: 'image/png' };
    const read = vi.fn(async () => asset);
    let enabled = true;
    let handle;
    const server = createCompanionServer({
      address: '127.0.0.1',
      port: 19000,
      devices: {
        authenticate: (value) =>
          value === credential ? { id: 'phone' } : null,
      },
      readers: { isActive: () => true },
      portraitArtwork: {
        isEnabled: () => enabled,
        getSnapshot: () => ({
          state: { playback: { track: { id: 'current' } } },
          outputSlots: [
            {
              templateId: 'phantom-thieves',
              options: { phantomMode: 'side-card' },
              portraits: {
                items: [{ id: 'preset', phantomPortraitPhoto: 'asset' }],
              },
            },
          ],
        }),
        read,
      },
      createHttpServer(listener) {
        handle = listener;
        return Object.assign(new EventEmitter(), {
          listen: (_port, _address, ready) => ready(),
        });
      },
    });
    await server.start();
    const request = (id) =>
      new Promise((resolve) => {
        let status;
        handle(
          {
            method: 'GET',
            url: `/m/api/v1/output-portrait?id=${id}`,
            headers: {
              host: '127.0.0.1:19000',
              authorization: `Bearer ${credential}`,
            },
          },
          {
            writeHead(code) {
              status = code;
            },
            end: () => resolve(status),
          },
        );
      });
    expect(await request('asset')).toBe(404);
    expect(read).not.toHaveBeenCalled();
    expect(await request('preset')).toBe(200);
    expect(await request('')).toBe(200);
    expect(read.mock.calls).toEqual([
      ['custom', 'asset'],
      ['artist', 'current'],
    ]);
    read.mockImplementationOnce(async () => {
      enabled = false;
      return asset;
    });
    expect(await request('preset')).toBe(404);
  });
});
