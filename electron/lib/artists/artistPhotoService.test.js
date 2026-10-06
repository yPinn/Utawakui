import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createArtistPhotoService } from './artistPhotoService.js';
import {
  clearArtistPhoto,
  isArtistPhotoRemoved,
  readArtistPhoto,
  writeArtistPhoto,
} from './artistPhotos.js';

const ARTIST_ID = 'artist-0123456789abcdef';
const CHANNEL_ID = 'UC5DHwv9N4OQ9AWtKr8YSefw';
const AVATAR_URL = 'https://yt3.googleusercontent.com/avatar=s900';

function pngBuffer(width, height) {
  const buffer = Buffer.alloc(32);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-photo-service-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function createService(overrides = {}) {
  const artistIndexCache = {
    getPhotoChannel: vi.fn().mockResolvedValue(CHANNEL_ID),
  };
  const fetchAvatarUrl = vi
    .fn()
    .mockResolvedValue({ status: 'ok', url: AVATAR_URL });
  const downloadImage = vi.fn().mockResolvedValue({
    status: 'ok',
    image: { buffer: pngBuffer(900, 900), extension: '.png' },
  });
  const getRunner = vi.fn().mockResolvedValue(vi.fn());
  const deps = {
    artistIndexCache,
    fetchAvatarUrl,
    downloadImage,
    ...overrides,
  };
  return { ...deps, getRunner, service: createArtistPhotoService(deps) };
}

describe('resolveFromChannel', () => {
  it('stores the official channel avatar through the YouTube allowlist', async () => {
    const { service, downloadImage, fetchAvatarUrl, getRunner } =
      createService();

    await expect(
      service.resolveFromChannel(dir, [], ARTIST_ID, { getRunner }),
    ).resolves.toEqual({ status: 'ok', changed: true });

    expect(fetchAvatarUrl).toHaveBeenCalledWith(CHANNEL_ID, {
      runner: expect.any(Function),
    });
    const [url, options] = downloadImage.mock.calls[0];
    expect(url).toBe(AVATAR_URL);
    expect(options.isAllowedUrl('https://coverartarchive.org/x')).toBe(false);
    expect(options.isAllowedUrl(AVATAR_URL)).toBe(true);
    expect(readArtistPhoto(dir, ARTIST_ID)).toMatchObject({
      filename: 'photo.png',
      source: 'youtube-channel',
    });
  });

  it('reports artists without an official channel without running yt-dlp', async () => {
    const { service, getRunner, fetchAvatarUrl } = createService({
      artistIndexCache: { getPhotoChannel: vi.fn().mockResolvedValue(null) },
    });
    await expect(
      service.resolveFromChannel(dir, [], ARTIST_ID, { getRunner }),
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'no-official-channel',
    });
    expect(getRunner).not.toHaveBeenCalled();
    expect(fetchAvatarUrl).not.toHaveBeenCalled();
  });

  it('tries each artist at most once per session and serializes requests', async () => {
    let releaseFirst;
    const fetchAvatarUrl = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = () =>
              resolve({ status: 'error', reason: 'avatar-unavailable' });
          }),
      )
      .mockResolvedValue({ status: 'ok', url: AVATAR_URL });
    const { service, getRunner } = createService({ fetchAvatarUrl });
    const other = 'artist-fedcba9876543210';

    const first = service.resolveFromChannel(dir, [], ARTIST_ID, { getRunner });
    const second = service.resolveFromChannel(dir, [], other, { getRunner });
    await vi.waitFor(() => expect(fetchAvatarUrl).toHaveBeenCalledTimes(1));
    releaseFirst();

    await expect(first).resolves.toEqual({
      status: 'unavailable',
      reason: 'avatar-unavailable',
    });
    await expect(second).resolves.toEqual({ status: 'ok', changed: true });
    await expect(
      service.resolveFromChannel(dir, [], ARTIST_ID, { getRunner }),
    ).resolves.toEqual({ status: 'skipped' });
    expect(fetchAvatarUrl).toHaveBeenCalledTimes(2);
  });

  it('never replaces an existing photo or brings back a removed one', async () => {
    const { service, getRunner, fetchAvatarUrl } = createService();
    writeArtistPhoto(dir, ARTIST_ID, {
      buffer: pngBuffer(100, 100),
      extension: '.png',
      source: 'local-file',
    });
    await expect(
      service.resolveFromChannel(dir, [], ARTIST_ID, { getRunner }),
    ).resolves.toEqual({ status: 'ok', changed: false });

    clearArtistPhoto(dir, ARTIST_ID);
    await expect(
      service.resolveFromChannel(dir, [], ARTIST_ID, { getRunner }),
    ).resolves.toEqual({ status: 'skipped' });
    expect(fetchAvatarUrl).not.toHaveBeenCalled();
  });

  it('lets a removal made during the request win', async () => {
    const downloadImage = vi.fn(async () => {
      clearArtistPhoto(dir, ARTIST_ID);
      return {
        status: 'ok',
        image: { buffer: pngBuffer(900, 900), extension: '.png' },
      };
    });
    const { service, getRunner } = createService({ downloadImage });
    await expect(
      service.resolveFromChannel(dir, [], ARTIST_ID, { getRunner }),
    ).resolves.toEqual({ status: 'ok', changed: false });
    expect(isArtistPhotoRemoved(dir, ARTIST_ID)).toBe(true);
  });

  it('maps an unavailable provider runtime to a bounded reason', async () => {
    const { service } = createService();
    await expect(
      service.resolveFromChannel(dir, [], ARTIST_ID, {
        getRunner: vi.fn().mockRejectedValue(new Error('/private/runtime')),
      }),
    ).resolves.toEqual({
      status: 'unavailable',
      reason: 'provider-unavailable',
    });
  });
});

describe('chooseLocal and clear', () => {
  it('stores a validated local image and rejects non-images', async () => {
    const { service } = createService();
    const imagePath = path.join(dir, 'picked.png');
    fs.writeFileSync(imagePath, pngBuffer(400, 400));
    const textPath = path.join(dir, 'picked.txt');
    fs.writeFileSync(textPath, 'not an image');

    await expect(
      service.chooseLocal(dir, ARTIST_ID, imagePath),
    ).resolves.toEqual({ status: 'ok', changed: true });
    expect(readArtistPhoto(dir, ARTIST_ID).source).toBe('local-file');
    await expect(
      service.chooseLocal(dir, ARTIST_ID, textPath),
    ).resolves.toEqual({ status: 'error', reason: 'invalid-image' });
    await expect(
      service.chooseLocal(dir, '../escape', imagePath),
    ).resolves.toEqual({ status: 'error', reason: 'invalid-artist' });
  });

  it('clears into a remembered removal', () => {
    const { service } = createService();
    expect(service.clear(dir, ARTIST_ID)).toEqual({
      status: 'ok',
      changed: true,
    });
    expect(isArtistPhotoRemoved(dir, ARTIST_ID)).toBe(true);
    expect(service.clear(dir, 'nope')).toEqual({
      status: 'error',
      reason: 'invalid-artist',
    });
  });
});
