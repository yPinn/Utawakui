import { describe, expect, it, vi } from 'vitest';
import {
  parseYoutubeMusicRelease,
  fetchYoutubeMusicRelease,
  getYoutubeMusicRelease,
  youtubeMusicReleaseObservations,
} from './youtubeMusic.js';

const html = (type, extra = '') =>
  `<head><meta property="og:type" content="music.album"><meta property="og:description" content="${type} • Singer"><meta content="Song &amp; Friends" property="og:title"><meta property="og:image" content="https://yt3.googleusercontent.com/art=w544-h544">${extra}</head>`;

const playlistId = 'OLAK5uy_yearTest';
function albumPage(
  year,
  { id = playlistId, title = 'Song & Friends', type = 'EP' } = {},
) {
  const data = {
    microformat: {
      microformatDataRenderer: {
        urlCanonical: `https://music.youtube.com/playlist?list=${id}`,
        ogType: 'music.album',
      },
    },
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    {
                      musicResponsiveHeaderRenderer: {
                        title: { runs: [{ text: title }] },
                        subtitle: {
                          runs: [
                            { text: type },
                            { text: ' • ' },
                            { text: year },
                          ],
                        },
                        buttons: [
                          {
                            musicPlayButtonRenderer: {
                              playNavigationEndpoint: {
                                watchPlaylistEndpoint: { playlistId: id },
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    },
  };
  const encoded = JSON.stringify(data).replace(
    /["'{}]/g,
    (s) => `\\x${s.charCodeAt(0).toString(16)}`,
  );
  return (
    html('EP') +
    `<script>initialData.push({path: '\\/browse', params: JSON.parse('{}'), data: '${encoded}'});</script>`
  );
}

describe('YouTube Music release observations', () => {
  it('reads only the matching album header year without executing page scripts', () => {
    const page =
      albumPage('2024') + '<script>throw new Error("must not run")</script>';
    expect(parseYoutubeMusicRelease(page, playlistId).date).toEqual({
      value: '2024',
      precision: 'year',
    });
  });
  it.each(['', '0', '0000', '2024-01-01', '2024 remaster', '99999'])(
    'leaves invalid or missing header year %s unknown',
    (year) => {
      expect(
        parseYoutubeMusicRelease(albumPage(year), playlistId),
      ).not.toHaveProperty('date');
    },
  );
  it('rejects other release identities, titles, types and unrelated years', () => {
    for (const changes of [
      { id: 'OLAK5uy_other' },
      { title: 'Another release' },
      { type: 'Single' },
    ])
      expect(
        parseYoutubeMusicRelease(albumPage('2024', changes), playlistId),
      ).not.toHaveProperty('date');
    expect(
      parseYoutubeMusicRelease(
        html('EP') + '<script>const uploadYear=2026;</script>',
        playlistId,
      ),
    ).not.toHaveProperty('date');
  });
  it('builds partial observations, preserving more precise source dates and manual values', () => {
    const source = { platform: 'yt-music', id: playlistId };
    const release = { type: 'ep', date: { value: '2024', precision: 'year' } };
    expect(youtubeMusicReleaseObservations(release, source)).toEqual({
      type: {
        value: 'ep',
        provenance: { provider: source.platform, sourceId: source.id },
      },
      date: {
        value: release.date,
        provenance: { provider: source.platform, sourceId: source.id },
      },
    });
    const previous = {
      observed: { date: { value: { value: '2024-07-01', precision: 'day' } } },
      overrides: { date: null },
    };
    expect(
      youtubeMusicReleaseObservations(release, source, previous),
    ).not.toHaveProperty('date');
    expect(previous.overrides.date).toBeNull();
    expect(youtubeMusicReleaseObservations({}, source)).toEqual({});
    expect(
      youtubeMusicReleaseObservations(release, {
        platform: 'forged',
        id: playlistId,
      }),
    ).toEqual({});
  });
  it.each([
    ['Single', 'single'],
    ['EP', 'ep'],
    ['Album', 'album'],
  ])('reads explicit %s metadata', (label, type) => {
    expect(parseYoutubeMusicRelease(html(label))).toEqual({
      type,
      title: 'Song & Friends',
      thumbnailUrl: 'https://yt3.googleusercontent.com/art=w544-h544',
    });
  });
  it('does not classify playlists, titles, counts, body content or unknown labels', () => {
    expect(parseYoutubeMusicRelease(html('Mix'))).not.toHaveProperty('type');
    expect(
      parseYoutubeMusicRelease(
        html('Single').replace('music.album', 'music.playlist'),
      ),
    ).toEqual({});
    expect(parseYoutubeMusicRelease('<title>Single</title>1 song')).toEqual({});
    expect(parseYoutubeMusicRelease('<head></head>' + html('Album'))).toEqual(
      {},
    );
  });
  it.each(['constructor', 'toString', '__proto__'])(
    'treats prototype label %s as unknown',
    (label) => {
      expect(parseYoutubeMusicRelease(html(label))).not.toHaveProperty('type');
    },
  );
  it('rejects non-allowlisted artwork', () => {
    expect(
      parseYoutubeMusicRelease(
        html('EP').replace(
          'yt3.googleusercontent.com',
          'yt3.googleusercontent.com.evil.test',
        ),
      ),
    ).not.toHaveProperty('thumbnailUrl');
  });
  it('reads metadata after the page viewport self-closing tag', () => {
    expect(
      parseYoutubeMusicRelease(
        html('EP').replace(
          '<head>',
          '<head><meta name="viewport" content="width=device-width"/>',
        ),
      ),
    ).toMatchObject({ type: 'ep' });
  });
  it('fetches a fixed bounded page and retains Main-owned evidence for the source', async () => {
    const fetch = vi.fn(async () => new Response(html('EP')));
    const id = 'OLAK5uy_metadataTest';
    expect(await fetchYoutubeMusicRelease(id, { fetch })).toMatchObject({
      type: 'ep',
    });
    expect(fetch.mock.calls[0][0].href).toBe(
      `https://music.youtube.com/playlist?list=${id}&hl=en`,
    );
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    expect(getYoutubeMusicRelease({ platform: 'yt-music', id })).toMatchObject({
      type: 'ep',
    });
    expect(getYoutubeMusicRelease({ platform: 'forged', id })).toBeNull();
    expect(await fetchYoutubeMusicRelease('../bad', { fetch })).toEqual({});
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('expires observations rather than reusing stale provider facts', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000000);
    try {
      const id = 'OLAK5uy_expiryTest';
      await fetchYoutubeMusicRelease(id, {
        fetch: async () => new Response(html('EP')),
      });
      expect(getYoutubeMusicRelease({ platform: 'youtube', id })?.type).toBe(
        'ep',
      );
      now.mockReturnValue(1000000 + 16 * 60 * 1000);
      expect(getYoutubeMusicRelease({ platform: 'youtube', id })).toBeNull();
    } finally {
      now.mockRestore();
    }
  });
  it('can explicitly refresh an incomplete cached observation instead of serving it again', async () => {
    const id = 'OLAK5uy_explicitRefresh';
    await fetchYoutubeMusicRelease(id, {
      fetch: async () => new Response('<head></head>'),
    });
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(html('EP')));
    try {
      expect(await fetchYoutubeMusicRelease(id)).toEqual({});
      expect(network).not.toHaveBeenCalled();
      expect(await fetchYoutubeMusicRelease(id, { force: true })).toMatchObject(
        { type: 'ep' },
      );
      expect(network).toHaveBeenCalledOnce();
    } finally {
      network.mockRestore();
    }
  });
  it('leaves unavailable or oversized metadata unknown', async () => {
    expect(
      await fetchYoutubeMusicRelease('OLAK5uy_failure', {
        fetch: async () => {
          throw Error('offline');
        },
      }),
    ).toEqual({});
    expect(
      await fetchYoutubeMusicRelease('OLAK5uy_large', {
        fetch: async () =>
          new Response('x', { headers: { 'content-length': 3 * 1024 * 1024 } }),
      }),
    ).toEqual({});
  });
});
