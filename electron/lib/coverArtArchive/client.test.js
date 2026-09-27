import { describe, expect, it, vi } from 'vitest';
import {
  createCoverArtArchiveClient,
  isAllowedCoverArtUrl,
  normalizeCoverArtResponse,
} from './client.js';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

describe('Cover Art Archive client', () => {
  it('keeps one front image and only allowlisted HTTPS assets', () => {
    expect(
      normalizeCoverArtResponse({
        images: [
          {
            front: false,
            image: 'https://archive.org/download/x/back.jpg',
          },
          {
            front: true,
            image: 'https://archive.org/download/x/front.jpg',
            thumbnails: {
              250: 'https://coverartarchive.org/release/x/front-250',
              500: 'http://coverartarchive.org/release/x/front-500',
              1200: 'https://evil.example/front.jpg',
            },
          },
        ],
      }),
    ).toEqual({
      status: 'ok',
      front: {
        imageUrl: 'https://archive.org/download/x/front.jpg',
        previewUrl: 'https://coverartarchive.org/release/x/front-250',
        applyUrl: 'https://archive.org/download/x/front.jpg',
      },
    });
    expect(isAllowedCoverArtUrl('https://ia801.test.archive.org/a.jpg')).toBe(
      true,
    );
    expect(isAllowedCoverArtUrl('https://archive.org.evil.test/a.jpg')).toBe(
      false,
    );
  });

  it('upgrades legacy provider HTTP assets on allowlisted hosts to HTTPS', () => {
    expect(
      normalizeCoverArtResponse({
        images: [
          {
            front: true,
            image: 'http://archive.org/download/x/front.jpg',
            thumbnails: {
              250: 'http://coverartarchive.org/release/x/front-250',
              1200: 'http://ia801.test.archive.org/x/front-1200.jpg',
            },
          },
        ],
      }),
    ).toEqual({
      status: 'ok',
      front: {
        imageUrl: 'https://archive.org/download/x/front.jpg',
        previewUrl: 'https://coverartarchive.org/release/x/front-250',
        applyUrl: 'https://ia801.test.archive.org/x/front-1200.jpg',
      },
    });
  });

  it('uses fixed entity routes, caches successful lookups, and treats 404 as unavailable', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          images: [
            {
              front: true,
              image: 'https://archive.org/download/x/front.jpg',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}, 404));
    const client = createCoverArtArchiveClient({ fetch });
    const mbid = '11111111-1111-4111-8111-111111111111';

    await expect(
      client.lookupFront('release-group', mbid),
    ).resolves.toMatchObject({
      status: 'ok',
      front: { imageUrl: expect.any(String) },
    });
    await client.lookupFront('release-group', mbid);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0].href).toBe(
      `https://coverartarchive.org/release-group/${mbid}`,
    );
    expect(fetch.mock.calls[0][1].redirect).toBe('manual');

    await expect(
      client.lookupFront('release', '22222222-2222-4222-8222-222222222222'),
    ).resolves.toEqual({ status: 'unavailable', reason: 'not-found' });
  });

  it('follows only bounded allowlisted metadata redirects and upgrades legacy HTTP locations', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: {
            Location: 'http://archive.org/download/x/index.json',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          images: [
            {
              front: true,
              image: 'https://archive.org/download/x/front.jpg',
            },
          ],
        }),
      );
    const client = createCoverArtArchiveClient({ fetch });

    await expect(
      client.lookupFront('release', '33333333-3333-4333-8333-333333333333'),
    ).resolves.toMatchObject({ status: 'ok' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].redirect).toBe('manual');
    expect(fetch.mock.calls[1][0].href).toBe(
      'https://archive.org/download/x/index.json',
    );
  });

  it('rejects invalid entity types, MBIDs, oversized bodies, and unbounded image arrays', async () => {
    const fetch = vi.fn();
    const client = createCoverArtArchiveClient({ fetch });
    await expect(client.lookupFront('recording', 'x')).resolves.toEqual({
      status: 'error',
      reason: 'invalid-request',
    });
    expect(fetch).not.toHaveBeenCalled();

    expect(
      normalizeCoverArtResponse({
        images: Array.from({ length: 51 }, () => ({})),
      }),
    ).toEqual({ status: 'error', reason: 'response-too-large' });
  });
});
