import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolvePlaylistCoverPath,
  writePlaylistCoverFile,
  writePlaylistCoverFromUrl,
  deletePlaylistCoverDir,
} from './playlistCovers.js';

describe('writePlaylistCoverFile / resolvePlaylistCoverPath / deletePlaylistCoverDir', () => {
  let dir;
  let sourceDir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-cover-test-'));
    sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-cover-src-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  });

  it('copies a chosen image into playlist-covers/<id>/cover.<ext> and resolves it back', () => {
    const sourcePath = path.join(sourceDir, 'picked.png');
    fs.writeFileSync(sourcePath, 'image-bytes');

    const filename = writePlaylistCoverFile(dir, 'playlist-1', sourcePath);
    expect(filename).toBe('cover.png');
    expect(
      fs.readFileSync(
        path.join(dir, 'playlist-covers', 'playlist-1', 'cover.png'),
        'utf8',
      ),
    ).toBe('image-bytes');

    expect(resolvePlaylistCoverPath(dir, 'playlist-1', 'cover.png')).toBe(
      path.join(
        path.resolve(dir),
        'playlist-covers',
        'playlist-1',
        'cover.png',
      ),
    );
  });

  it('rejects a non-image source extension', () => {
    const sourcePath = path.join(sourceDir, 'not-an-image.txt');
    fs.writeFileSync(sourcePath, 'nope');

    expect(writePlaylistCoverFile(dir, 'playlist-1', sourcePath)).toBe(null);
  });

  it('replaces a previous cover of a different extension instead of leaving both', () => {
    fs.writeFileSync(path.join(sourceDir, 'first.png'), 'a');
    fs.writeFileSync(path.join(sourceDir, 'second.jpg'), 'b');

    writePlaylistCoverFile(
      dir,
      'playlist-1',
      path.join(sourceDir, 'first.png'),
    );
    const filename = writePlaylistCoverFile(
      dir,
      'playlist-1',
      path.join(sourceDir, 'second.jpg'),
    );

    expect(filename).toBe('cover.jpg');
    const coverDir = path.join(dir, 'playlist-covers', 'playlist-1');
    expect(fs.readdirSync(coverDir)).toEqual(['cover.jpg']);
  });

  it('rejects traversal attempts via playlistId or coverFilename', () => {
    fs.writeFileSync(path.join(sourceDir, 'ok.png'), 'x');
    writePlaylistCoverFile(dir, 'playlist-1', path.join(sourceDir, 'ok.png'));

    expect(resolvePlaylistCoverPath(dir, '../evil', 'cover.png')).toBe(null);
    expect(resolvePlaylistCoverPath(dir, 'playlist-1', '../cover.png')).toBe(
      null,
    );
    expect(
      writePlaylistCoverFile(dir, '../evil', path.join(sourceDir, 'ok.png')),
    ).toBe(null);
  });

  it('returns null for a filename that does not match what is actually on disk', () => {
    fs.writeFileSync(path.join(sourceDir, 'ok.png'), 'x');
    writePlaylistCoverFile(dir, 'playlist-1', path.join(sourceDir, 'ok.png'));

    expect(resolvePlaylistCoverPath(dir, 'playlist-1', 'cover.jpg')).toBe(null);
  });

  it('deletePlaylistCoverDir removes the whole cover directory', () => {
    fs.writeFileSync(path.join(sourceDir, 'ok.png'), 'x');
    writePlaylistCoverFile(dir, 'playlist-1', path.join(sourceDir, 'ok.png'));

    deletePlaylistCoverDir(dir, 'playlist-1');

    expect(fs.existsSync(path.join(dir, 'playlist-covers', 'playlist-1'))).toBe(
      false,
    );
    expect(resolvePlaylistCoverPath(dir, 'playlist-1', 'cover.png')).toBe(null);
  });
});

describe('writePlaylistCoverFromUrl', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-cover-url-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  function stubFetch(response) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  }

  function fakeResponse({
    ok = true,
    status = 200,
    contentType = 'image/jpeg',
    body = 'image-bytes',
  } = {}) {
    return {
      ok,
      status,
      headers: {
        get: (name) => (name === 'content-type' ? contentType : null),
      },
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    };
  }

  it('downloads and writes the cover using the content-type extension', async () => {
    stubFetch(fakeResponse({ contentType: 'image/png' }));

    const filename = await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
    );

    expect(filename).toBe('cover.png');
    expect(
      fs.readFileSync(
        path.join(dir, 'playlist-covers', 'album-1', 'cover.png'),
        'utf8',
      ),
    ).toBe('image-bytes');
  });

  it('falls back to the URL extension when content-type is unrecognized', async () => {
    stubFetch(fakeResponse({ contentType: 'application/octet-stream' }));

    const filename = await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
    );

    expect(filename).toBe('cover.jpg');
  });

  it('returns null when neither content-type nor URL extension is a recognized image type', async () => {
    stubFetch(fakeResponse({ contentType: 'application/octet-stream' }));

    const filename = await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://i.ytimg.com/vi/xyz/hqdefault',
    );

    expect(filename).toBe(null);
  });

  it('returns null on a non-ok response instead of throwing', async () => {
    stubFetch(fakeResponse({ ok: false, status: 404 }));

    const filename = await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
    );

    expect(filename).toBe(null);
  });

  it('returns null when fetch itself throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const filename = await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
    );

    expect(filename).toBe(null);
  });

  it('aborts a cover request that does not make progress before the deadline', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(
        (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason));
          }),
      );
      const pending = writePlaylistCoverFromUrl(
        dir,
        'album-1',
        'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
        { fetchImpl, timeoutMs: 1_000 },
      );

      await vi.advanceTimersByTimeAsync(1_000);

      await expect(pending).resolves.toBe(null);
      expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an oversized cover before reading its body', async () => {
    const arrayBuffer = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name) =>
          name === 'content-type'
            ? 'image/jpeg'
            : name === 'content-length'
              ? String(11 * 1024 * 1024)
              : null,
      },
      arrayBuffer,
    });

    await expect(
      writePlaylistCoverFromUrl(
        dir,
        'album-1',
        'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
        { fetchImpl },
      ),
    ).resolves.toBe(null);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects a non-allowlisted host without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const filename = await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://evil.example.com/a.png',
    );

    expect(filename).toBe(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a traversal playlistId without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const filename = await writePlaylistCoverFromUrl(
      dir,
      '../evil',
      'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
    );

    expect(filename).toBe(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('replaces a previous cover of a different extension', async () => {
    stubFetch(fakeResponse({ contentType: 'image/png' }));
    await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://i.ytimg.com/vi/xyz/a.png',
    );

    stubFetch(fakeResponse({ contentType: 'image/jpeg' }));
    const filename = await writePlaylistCoverFromUrl(
      dir,
      'album-1',
      'https://i.ytimg.com/vi/xyz/a.jpg',
    );

    // image/jpeg maps to .jpeg here, not .jpg — IMAGE_MIME_TYPES has both
    // extensions pointing at the same MIME type, and the reverse lookup
    // keeps whichever is later in that map.
    expect(filename).toBe('cover.jpeg');
    const coverDir = path.join(dir, 'playlist-covers', 'album-1');
    expect(fs.readdirSync(coverDir)).toEqual(['cover.jpeg']);
  });
});
