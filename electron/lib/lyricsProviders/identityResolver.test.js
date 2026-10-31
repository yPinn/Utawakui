import { describe, expect, it, vi } from 'vitest';
import { createLyricsIdentityResolver } from './identityResolver.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const track = { title: 'Hana No Uta', artist: 'Aimer', duration: 371 };
const original = {
  trackId: 12,
  artistId: 34,
  trackName: 'Hana No Uta',
  artistName: 'Aimer',
  trackTimeMillis: 371427,
};
const native = { ...original, trackName: '花の唄' };
const json = (results) =>
  new Response(JSON.stringify({ resultCount: results.length, results }));
describe('same-catalog cross-language identity evidence', () => {
  it('does not spend the per-HTTP timeout waiting for the shared 3.1-second source interval', async () => {
    vi.useFakeTimers();
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms) => {
        const c = new AbortController();
        setTimeout(
          () => c.abort(new DOMException('timeout', 'TimeoutError')),
          ms,
        );
        return c.signal;
      });
    try {
      let queued = 0;
      const fetch = vi.fn(async (url, { signal }) => {
        signal.throwIfAborted();
        return json(
          new URL(url).pathname === '/search' ? [original] : [native],
        );
      });
      const scheduler = {
        schedule: async (start) => {
          if (queued++ > 0)
            await new Promise((resolve) => setTimeout(resolve, 3100));
          return start();
        },
      };
      const result = createLyricsIdentityResolver({ fetch, scheduler }).resolve(
        track,
      );
      await vi.advanceTimersByTimeAsync(3101);
      expect((await result).aliases.title).toEqual(['花の唄']);
    } finally {
      timeout.mockRestore();
      vi.useRealTimers();
    }
  });
  it('reuses persisted evidence on restart, expires it, and ignores a corrupted cache', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-alias-'));
    try {
      let clock = 1000;
      const fetch = vi.fn(async (url) =>
        json(new URL(url).pathname === '/search' ? [original] : [native]),
      );
      const options = {
        fetch,
        now: () => clock,
        cacheDirectory: directory,
        scheduler: { schedule: (start) => start() },
      };
      const first = await createLyricsIdentityResolver(options).resolve(track);
      expect(first.expiresAt).toBe(clock + 30 * 24 * 60 * 60 * 1000);
      expect(
        (await createLyricsIdentityResolver(options).resolve(track)).aliases
          .title,
      ).toEqual(['花の唄']);
      expect(fetch).toHaveBeenCalledTimes(2);
      clock = first.expiresAt + 1;
      await createLyricsIdentityResolver(options).resolve(track);
      expect(fetch).toHaveBeenCalledTimes(4);
      fs.writeFileSync(path.join(directory, 'aliases-v1.json'), 'not json');
      clock += 31000;
      await createLyricsIdentityResolver(options).resolve(track);
      expect(fetch).toHaveBeenCalledTimes(6);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  it('does not spend metadata requests for an already native-script title', async () => {
    const fetch = vi.fn();
    const resolver = createLyricsIdentityResolver({ fetch });
    expect(
      (await resolver.resolve({ ...track, title: '花の唄' })).aliases.title,
    ).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('derives the native title from original input and same ids, ignoring a near-duration Live hit', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json([
          { ...original, trackId: 11, trackName: 'Hana No Uta (Live)' },
          original,
        ]),
      )
      .mockResolvedValueOnce(json([native]));
    const resolver = createLyricsIdentityResolver({
      fetch,
      scheduler: { schedule: (start) => start() },
    });
    const result = await resolver.resolve(track);
    expect(result.aliases.title).toEqual(['花の唄']);
    expect(result.evidence[0]).toMatchObject({
      trackId: 12,
      artistId: 34,
      original: 'Hana No Uta',
      localized: '花の唄',
    });
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('term')).toBe(
      'Hana No Uta Aimer',
    );
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get('id')).toBe('12');
    await resolver.resolve(track);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([
    { trackId: 99 },
    { artistId: 99 },
    { artistName: 'Cover Artist' },
    { trackTimeMillis: 372427 },
    { trackName: '花の唄 (Live)' },
  ])('rejects contradictory identity %j', async (change) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json([original]))
      .mockResolvedValueOnce(json([{ ...native, ...change }]));
    const result = await createLyricsIdentityResolver({
      fetch,
      scheduler: { schedule: (start) => start() },
    }).resolve(track);
    expect(result.aliases.title).toEqual([]);
  });
  it('does not use a primary artist id to drop a credited collaborator', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json([original]));
    const result = await createLyricsIdentityResolver({
      fetch,
      scheduler: { schedule: (start) => start() },
    }).resolve({ ...track, artist: 'Aimer, Guest' });
    expect(result.aliases.title).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('keeps ambiguous original titles untrusted and does not poll another backend', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json([original, { ...original, trackId: 13 }]))
      .mockResolvedValueOnce(
        json([native, { ...native, trackId: 13, trackName: '別の曲' }]),
      );
    const result = await createLyricsIdentityResolver({
      fetch,
      scheduler: { schedule: (start) => start() },
    }).resolve(track);
    expect(result.aliases.title).toEqual([]);
    expect(result.reason).toBe('ambiguous-identity');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
