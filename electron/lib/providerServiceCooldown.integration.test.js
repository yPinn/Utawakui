import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLrclibClient } from './lrclib/client.js';
import { createNeteaseClient } from './netease/client.js';
import { createBetterLyricsClient } from './betterlyrics/client.js';
import { createCoverArtArchiveClient } from './coverArtArchive/client.js';
import { downloadValidatedArtwork } from './artwork/image.js';
import { createFeedbackClient } from './feedback/client.js';
import { createUpdateManifestClient } from './updateManifestClient.js';
import { probeMusixmatchLyrics } from './musixmatch.js';
import { downloadPinned } from './lyricsResearch/download.js';
import { downloadArtifact } from './lyricsAcoustic/artifacts.js';
import { writePlaylistCoverFromUrl } from './library/playlistCovers.js';
import {
  downloadText,
  downloadBuffer,
} from './featureDependencies/download.js';

const scheduler = () => ({
  schedule: (operation) => operation(),
  deferFor: vi.fn(),
});
const query = { trackName: 'Song', artistName: 'Artist', duration: 180 };
const mbid = '11111111-1111-4111-8111-111111111111';
const consumers = [
  [
    'LRCLIB',
    (fetch) =>
      createLrclibClient({ fetch, scheduler: scheduler() }).getById(42),
  ],
  [
    'NetEase',
    (fetch) =>
      createNeteaseClient({ fetch, scheduler: scheduler() }).getLyrics(42),
  ],
  [
    'Better Lyrics',
    (fetch) =>
      createBetterLyricsClient({ fetch, scheduler: scheduler() }).getLyrics(
        query,
      ),
  ],
  [
    'Cover Art Archive',
    (fetch) =>
      createCoverArtArchiveClient({ fetch }).lookupFront('release', mbid),
  ],
  [
    'artwork',
    (fetch) =>
      downloadValidatedArtwork(
        `https://coverartarchive.org/release/${mbid}/front`,
        { fetch },
      ),
  ],
  [
    'feedback POST',
    (fetch) =>
      createFeedbackClient({
        fetch,
        baseUrl: 'https://feedback.example.test/submit',
      }).submit({ message: 'Test' }),
  ],
  [
    'update manifest',
    (fetch) => createUpdateManifestClient({ fetch }).fetchManifest('0.4.0'),
  ],
  [
    'Musixmatch probe',
    (fetch) =>
      probeMusixmatchLyrics(
        { title: 'Song', artist: 'Artist' },
        { fetch, apiKey: 'fixture-key' },
      ),
  ],
];

afterEach(() => vi.useRealTimers());

describe('external service cooldown wiring', () => {
  it('also cools pinned research downloads and source album thumbnails', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response('', { status: 503 })),
      );
    const artifact = {
      url: 'https://research.example.test/model',
      sizeBytes: 1,
      sha256: '0'.repeat(64),
    };
    await expect(
      downloadArtifact(artifact, { fetchImpl: fetch }),
    ).rejects.toThrow('download failed');
    await expect(
      downloadPinned(
        artifact,
        'tasks/external-services-20261020/unused-download-target',
        { fetchImpl: fetch },
      ),
    ).rejects.toThrow('download failed');
    expect(fetch).toHaveBeenCalledOnce();
    await writePlaylistCoverFromUrl(
      'tasks/external-services-20261020',
      'album-1',
      'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
      { fetchImpl: fetch },
    );
    await writePlaylistCoverFromUrl(
      'tasks/external-services-20261020',
      'album-2',
      'https://i.ytimg.com/vi/xyz/hqdefault.jpg',
      { fetchImpl: fetch },
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(consumers)(
    '%s honors a long Retry-After across new client instances without automatic retries',
    async (_name, invoke) => {
      vi.useFakeTimers();
      const fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response('{}', {
            status: 429,
            headers: { 'Retry-After': '3600' },
          }),
        ),
      );
      await invoke(fetch);
      await invoke(fetch);
      expect(fetch).toHaveBeenCalledOnce();
      vi.setSystemTime(Date.now() + 3_599_999);
      await invoke(fetch);
      expect(fetch).toHaveBeenCalledOnce();
      vi.setSystemTime(Date.now() + 1);
      await invoke(fetch);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it('does not repeatedly download a dependency or metadata while its host is cooling down', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response('', { status: 503 })),
      );
    await expect(
      downloadText('https://downloads.example.test/version', fetch),
    ).rejects.toThrow('HTTP 503');
    await expect(
      downloadBuffer('https://downloads.example.test/model', fetch),
    ).rejects.toThrow('HTTP 503');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('observes a NetEase application-level rate limit even when HTTP is 200', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('{"code":429}')));
    const client = createNeteaseClient({ fetch, scheduler: scheduler() });
    await expect(client.getLyrics(42)).resolves.toMatchObject({
      reason: 'rate-limited',
    });
    await expect(client.search(query)).resolves.toMatchObject({
      reason: 'rate-limited',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('observes a Musixmatch application-level rate limit without resubmitting the key', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response('{"message":{"header":{"status_code":429}}}'),
        ),
      );
    const invoke = () =>
      probeMusixmatchLyrics(
        { title: 'Song', artist: 'Artist' },
        { fetch, apiKey: 'fixture-key' },
      );
    await invoke();
    await invoke();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
