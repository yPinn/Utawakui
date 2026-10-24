import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isReleaseArtworkUrl,
  acquireReleaseArtwork,
  saveReleaseArtwork,
} from './artwork.js';
it('allows fixed public cover hosts and rejects credentials, ports, deceptive hosts and local paths', () => {
  expect(isReleaseArtworkUrl('https://lh3.googleusercontent.com/a')).toBe(true);
  for (const url of [
    'file:///a',
    'http://lh3.googleusercontent.com/a',
    'https://lh3.googleusercontent.com.evil.test/a',
    'https://u:p@lh3.googleusercontent.com/a',
    'https://lh3.googleusercontent.com:8443/a',
    'https://localhost/a',
    'x'.repeat(2049),
  ])
    expect(isReleaseArtworkUrl(url)).toBe(false);
  expect(
    saveReleaseArtwork('unused', '../bad', {
      extension: '.png',
      buffer: Buffer.from('x'),
    }),
  ).toBeNull();
});
it('never follows a cover redirect outside the allowlist or lets image failure block text metadata', async () => {
  const fetch = vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://localhost/private' },
      }),
  );
  expect(
    await acquireReleaseArtwork('https://lh3.googleusercontent.com/a', {
      fetch,
    }),
  ).toBeNull();
  expect(fetch).toHaveBeenCalledOnce();
  expect(
    await acquireReleaseArtwork('https://localhost/a', { fetch }),
  ).toBeNull();
});
it('bounds and persists a verified cover without exposing a source path or overwriting text state', async () => {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.write('IHDR', 12);
  buffer.writeUInt32BE(64, 16);
  buffer.writeUInt32BE(64, 20);
  const image = await acquireReleaseArtwork(
    'https://lh3.googleusercontent.com/a',
    {
      fetch: async () =>
        new Response(buffer, { headers: { 'content-type': 'image/png' } }),
    },
  );
  expect(image).toMatchObject({ extension: '.png', width: 64, height: 64 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-cover-'));
  try {
    expect(saveReleaseArtwork(dir, 'album', image)).toBe('cover.png');
    expect(
      fs.readFileSync(path.join(dir, 'playlist-covers/album/cover.png')),
    ).toEqual(buffer);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  expect(
    await acquireReleaseArtwork('https://lh3.googleusercontent.com/a', {
      fetch: async () => {
        throw Error('offline');
      },
    }),
  ).toBeNull();
  expect(
    saveReleaseArtwork('unused', 'album', { extension: '.exe', buffer }),
  ).toBeNull();
});
