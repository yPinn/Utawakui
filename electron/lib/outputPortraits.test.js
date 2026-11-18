import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import portraits from './outputPortraits.js';
import artistIndex from './artists/artistIndex.js';
import artistPhotos from './artists/artistPhotos.js';
import metadataIndex from './library/metadataIndex.js';
import http from './outputServer/http.js';

const photo = fileURLToPath(
  new URL('../../overlay/assets/streamer-guide.png', import.meta.url),
);
const jpegPhoto = fileURLToPath(
  new URL(
    '../../src/assets/demo/track-thumb/track-thumb-crop-square.jpg',
    import.meta.url,
  ),
);
const {
  readOutputPortrait,
  resolveOutputPortrait,
  resolveTrackArtistPhoto,
  writeOutputPortrait,
} = portraits;

describe('Output portraits', () => {
  let directory;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-portraits-'));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it('imports a verified raster image and serves it by an opaque id', async () => {
    const { bytes, mimeType } = await readOutputPortrait(photo);
    expect(mimeType).toBe('image/png');
    expect(fs.existsSync(path.join(directory, 'output-portraits'))).toBe(false);
    const id = await writeOutputPortrait(directory, bytes);
    expect(id).toMatch(/^[0-9a-f-]{36}$/u);
    const saved = await resolveOutputPortrait(directory, id);
    expect(fs.readFileSync(saved)).toEqual(fs.readFileSync(photo));
    expect(await resolveOutputPortrait(directory, '../photo.png')).toBeNull();

    const invalid = path.join(directory, 'unsafe.png');
    fs.writeFileSync(invalid, '<svg />');
    expect(await readOutputPortrait(invalid)).toBeNull();
    expect(await writeOutputPortrait(directory, '../unsafe.png')).toBeNull();
    expect(
      await writeOutputPortrait(directory, Buffer.from('<svg />'), {
        edited: true,
      }),
    ).toBeNull();
  });

  it('preserves a selected JPEG and only accepts a bounded PNG as an edited image', async () => {
    const { bytes, mimeType } = await readOutputPortrait(jpegPhoto);
    expect(mimeType).toBe('image/jpeg');
    const id = await writeOutputPortrait(directory, bytes);
    expect(await resolveOutputPortrait(directory, id)).toMatch(/\.jpg$/u);
    expect(
      await writeOutputPortrait(directory, bytes, { edited: true }),
    ).toBeNull();

    const oversizedPng = Buffer.from(fs.readFileSync(photo));
    oversizedPng.writeUInt32BE(1025, 16);
    expect(
      await writeOutputPortrait(directory, oversizedPng, { edited: true }),
    ).toBeNull();
  });

  it('uses the first credited artist’s library photo', async () => {
    const trackDir = path.join(directory, 'tracks', 'recording');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'audio');
    metadataIndex.saveIndexEntry(directory, 'recording', { artist: 'Aster' });
    const index = artistIndex.buildArtistIndex([
      { id: 'recording', artist: 'Aster' },
    ]);
    const [artistId] = index.trackArtistIds.recording;
    expect(await resolveTrackArtistPhoto(directory, 'recording')).toBeNull();
    artistPhotos.writeArtistPhoto(directory, artistId, {
      buffer: fs.readFileSync(photo),
      extension: '.png',
      source: 'local-file',
    });
    const resolved = await resolveTrackArtistPhoto(directory, 'recording');
    expect(path.relative(directory, resolved)).toBe(
      path.join('artists', artistId, 'photo.png'),
    );
  });

  it('uses the read-only image route with content versioning', async () => {
    const resolvePortraitAsset = vi.fn(() => photo);
    const handle = http.createOutputHttpHandler({
      getSnapshot: () => ({}),
      resolvePortraitAsset,
    });
    async function request(url) {
      const response = { writeHead: vi.fn(), end: vi.fn() };
      await handle({ url, method: 'GET', headers: {} }, response);
      return response.writeHead.mock.calls[0];
    }
    const [status, headers] = await request(
      '/media/phantom-portrait/artist/recording',
    );
    expect(status).toBe(302);
    expect(headers.Location).toMatch(
      /^\/media\/phantom-portrait\/artist\/recording\/[a-f0-9]{64}$/u,
    );
    expect(await request('/media/phantom-portrait/artist/%2Fescape')).toEqual(
      expect.arrayContaining([404]),
    );
    expect(resolvePortraitAsset).toHaveBeenCalledExactlyOnceWith(
      'artist',
      'recording',
    );
  });
});
