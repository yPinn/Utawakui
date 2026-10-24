import { describe, expect, it } from 'vitest';
import {
  artistCreditLinks,
  artistSearchTexts,
  deriveArtistPage,
  isArtistSourceId,
  listSidebarArtists,
  orderReferenceItems,
} from './artistPage.js';

function track(id, title, releaseYear, thumbnailUrl) {
  return { id, title, releaseYear, thumbnailUrl };
}

const tracks = [
  track('y1', '夜に駆ける', 2019, 'thumb-y1'),
  track('y2', '群青', 2020),
  track('y3', 'アイドル', 2023),
  track('y4', '勇者', 2023),
  track('y5', 'Loose Single', 2024),
  track('m1', 'ミドリーズ曲', 2022),
  track('g1', 'Guest Only', 2021, 'thumb-g1'),
  track('e1', 'Eve 1', 2018),
  track('e2', 'Eve 2', 2019, 'thumb-e2'),
];
const tracksById = new Map(tracks.map((entry) => [entry.id, entry]));

const artistIndex = {
  artists: [
    {
      id: 'artist-yoasobi',
      name: 'YOASOBI',
      trackIds: ['y1', 'y2', 'y3', 'y4', 'y5', 'm1'],
    },
    { id: 'artist-midories', name: 'ミドリーズ', trackIds: ['m1'] },
    { id: 'artist-guest', name: 'Guest', trackIds: ['g1'] },
    { id: 'artist-eve', name: 'Eve', trackIds: ['e1', 'e2'] },
  ],
  trackArtistIds: {
    y1: ['artist-yoasobi'],
    y2: ['artist-yoasobi'],
    y3: ['artist-yoasobi'],
    y4: ['artist-yoasobi'],
    y5: ['artist-yoasobi'],
    m1: ['artist-yoasobi', 'artist-midories'],
    g1: ['artist-guest'],
    e1: ['artist-eve'],
    e2: ['artist-eve'],
  },
};

const albumEntries = [
  {
    collection: {
      id: 'album-book1',
      kind: 'album',
      name: 'THE BOOK',
      resolvedRelease: {
        type: 'album',
        date: { value: '2020', precision: 'year' },
      },
    },
    tracks: [tracksById.get('y1'), tracksById.get('y2')],
  },
  {
    collection: {
      id: 'album-book3',
      kind: 'album',
      name: 'THE BOOK 3',
      coverUrl: 'cover-book3',
      resolvedRelease: {
        type: 'album',
        date: { value: '2023', precision: 'year' },
      },
    },
    tracks: [tracksById.get('y4'), tracksById.get('y3'), tracksById.get('m1')],
  },
  {
    collection: { id: 'playlist-1', kind: 'playlist', name: 'Live' },
    tracks: [tracksById.get('g1')],
  },
];

describe('artistCreditLinks', () => {
  it('keeps release classification separate from kind and uses only effective release dates', () => {
    const page = deriveArtistPage({
      artistId: 'artist-yoasobi',
      artistIndex,
      tracksById,
      albumEntries: [
        {
          collection: { id: 'unknown', kind: 'album', name: 'Unknown' },
          tracks: [tracks[0]],
        },
        {
          collection: {
            id: 'single',
            kind: 'album',
            name: 'Single',
            resolvedRelease: {
              type: 'single',
              date: { value: '2026-07-25', precision: 'day' },
            },
          },
          tracks: [tracks[1]],
        },
      ],
    });
    expect(page.albums.find((item) => item.id === 'unknown')).toMatchObject({
      releaseType: 'unknown',
      releaseYear: undefined,
    });
    expect(page.albums.find((item) => item.id === 'single')).toMatchObject({
      releaseType: 'single',
      releaseYear: 2026,
    });
  });
  it('links a single credit with the canonical artist name', () => {
    expect(
      artistCreditLinks({ id: 'y1', artist: 'YOASOBI' }, artistIndex),
    ).toEqual([{ text: 'YOASOBI', artistId: 'artist-yoasobi' }]);
  });

  it('pairs multi-artist parts with ids in order', () => {
    expect(
      artistCreditLinks(
        { id: 'm1', artist: 'YOASOBI, ミドリーズ' },
        artistIndex,
      ),
    ).toEqual([
      { text: 'YOASOBI', artistId: 'artist-yoasobi' },
      { text: 'ミドリーズ', artistId: 'artist-midories' },
    ]);
  });

  it('uses one canonical name after cross-script credits are integrated', () => {
    const integrated = {
      artists: [
        {
          id: 'artist-lin',
          name: '林俊傑',
          credits: [
            { id: 'credit-jj', name: 'JJ Lin' },
            { id: 'credit-lin', name: '林俊傑' },
          ],
          trackIds: ['english', 'chinese'],
        },
      ],
      trackArtistIds: {
        english: ['artist-lin'],
        chinese: ['artist-lin'],
      },
    };

    expect(
      artistCreditLinks({ id: 'english', artist: 'JJ Lin' }, integrated),
    ).toEqual([{ text: '林俊傑', artistId: 'artist-lin' }]);
    expect(
      artistCreditLinks({ id: 'chinese', artist: '林俊傑' }, integrated),
    ).toEqual([{ text: '林俊傑', artistId: 'artist-lin' }]);
  });

  it('uses indexed entities without depending on source-credit punctuation', () => {
    expect(
      artistCreditLinks(
        { id: 'm1', artist: 'YOASOBI & ミドリーズ' },
        artistIndex,
      ),
    ).toEqual([
      { text: 'YOASOBI', artistId: 'artist-yoasobi' },
      { text: 'ミドリーズ', artistId: 'artist-midories' },
    ]);
  });

  it('keeps plain text when the artist index cannot resolve every entity', () => {
    expect(
      artistCreditLinks({ id: 'unknown', artist: 'Eve' }, artistIndex),
    ).toBe(null);
    expect(artistCreditLinks({ id: 'y1', artist: '' }, artistIndex)).toBe(null);
    expect(artistCreditLinks({ id: 'y1', artist: 'YOASOBI' }, null)).toBe(null);
  });
});

describe('artistSearchTexts', () => {
  it('lets every integrated credit find the complete canonical artist', () => {
    const integrated = {
      artists: [
        {
          id: 'artist-lin',
          name: '林俊傑',
          credits: [{ name: 'JJ Lin' }, { name: '林俊傑' }],
        },
      ],
      trackArtistIds: {
        english: ['artist-lin'],
        chinese: ['artist-lin'],
      },
    };

    expect(
      artistSearchTexts({ id: 'english', artist: 'JJ Lin' }, integrated),
    ).toEqual(['JJ Lin', '林俊傑']);
    expect(
      artistSearchTexts({ id: 'chinese', artist: '林俊傑' }, integrated),
    ).toEqual(['林俊傑', 'JJ Lin']);
  });

  it('falls back to the source credit before the artist index loads', () => {
    expect(artistSearchTexts({ id: 'raw', artist: 'JJ Lin' }, null)).toEqual([
      'JJ Lin',
    ]);
    expect(artistSearchTexts({ id: 'empty', artist: '' }, null)).toEqual([]);
  });
});

describe('isArtistSourceId', () => {
  it('recognizes derived artist ids only', () => {
    expect(isArtistSourceId('artist-0123456789abcdef')).toBe(true);
    expect(isArtistSourceId('3f2c9e0a-uuid')).toBe(false);
    expect(isArtistSourceId(null)).toBe(false);
  });
});

describe('listSidebarArtists', () => {
  it('lists album owners and artists with at least two tracks by name', () => {
    expect(
      listSidebarArtists({ artistIndex, albumEntries, tracksById }).map(
        (artist) => artist.name,
      ),
    ).toEqual(['Eve', 'YOASOBI']);
  });

  it('shows only the artist photo and never borrows an album cover', () => {
    const withPhoto = {
      ...artistIndex,
      artists: artistIndex.artists.map((artist) =>
        artist.id === 'artist-eve'
          ? { ...artist, photoUrl: 'utawakui-media://artist-photo/eve' }
          : artist,
      ),
    };
    const [eve, yoasobi] = listSidebarArtists({
      artistIndex: withPhoto,
      albumEntries,
      tracksById,
    });
    expect(yoasobi).toMatchObject({
      photoUrl: '',
      albumCount: 2,
      trackCount: 6,
    });
    expect(yoasobi).not.toHaveProperty('coverTracks');
    expect(eve.photoUrl).toBe('utawakui-media://artist-photo/eve');
  });

  it('lets a search reach single-track artists by name or track title', () => {
    expect(
      listSidebarArtists({
        artistIndex,
        albumEntries,
        tracksById,
        query: 'guest only',
      }).map((artist) => artist.name),
    ).toEqual(['Guest']);
    expect(
      listSidebarArtists({
        artistIndex,
        albumEntries,
        tracksById,
        query: 'ミドリ',
      }).map((artist) => artist.name),
    ).toEqual(['YOASOBI', 'ミドリーズ']);
  });

  it('lets every integrated credit find the canonical artist row', () => {
    const integrated = {
      artists: [
        {
          id: 'artist-lin',
          name: '林俊傑',
          credits: [{ name: 'JJ Lin' }, { name: '林俊傑' }],
          trackIds: ['english', 'chinese'],
        },
      ],
      trackArtistIds: {
        english: ['artist-lin'],
        chinese: ['artist-lin'],
      },
    };
    const integratedTracks = new Map([
      ['english', { id: 'english', title: '53 Dawns', artist: 'JJ Lin' }],
      ['chinese', { id: 'chinese', title: 'Always Online', artist: '林俊傑' }],
    ]);

    for (const query of ['jj lin', '林俊傑']) {
      expect(
        listSidebarArtists({
          artistIndex: integrated,
          albumEntries: [],
          tracksById: integratedTracks,
          query,
        }).map((artist) => artist.name),
      ).toEqual(['林俊傑']);
    }
  });

  it('returns nothing before the index loads', () => {
    expect(listSidebarArtists({ artistIndex: null })).toEqual([]);
  });
});

describe('orderReferenceItems', () => {
  const albumItems = [
    { id: 'album-book3', name: 'THE BOOK 3', trackIds: ['y4', 'y3', 'm1'] },
    { id: 'album-book1', name: 'THE BOOK', trackIds: ['y1', 'y2'] },
    { id: 'album-eve', name: 'Smile', trackIds: ['e1', 'e2'] },
  ];
  const artistItems = [
    { id: 'artist-eve', name: 'Eve' },
    { id: 'artist-yoasobi', name: 'YOASOBI' },
    { id: 'artist-aimer', name: 'Aimer' },
  ];

  it('groups each artist row ahead of its own albums by artist name', () => {
    const entries = orderReferenceItems({
      albumItems,
      artistItems,
      artistIndex,
      tracksById,
    });
    expect(entries.map((entry) => `${entry.kind}:${entry.item.id}`)).toEqual([
      'artist:artist-aimer',
      'artist:artist-eve',
      'album:album-eve',
      'artist:artist-yoasobi',
      'album:album-book3',
      'album:album-book1',
    ]);
    expect(entries[2].groupName).toBe('Eve');
  });

  it('falls back to the derived album artist before the index loads', () => {
    const entries = orderReferenceItems({
      albumItems: [albumItems[0]],
      artistItems: [],
      artistIndex: null,
      tracksById,
      fallbackAlbumArtistById: new Map([['album-book3', 'YOASOBI']]),
    });
    expect(entries[0]).toMatchObject({ kind: 'album', groupName: 'YOASOBI' });
  });
});

describe('deriveArtistPage', () => {
  it('redirects a legacy credit artist id to its stable entity', () => {
    const redirectedIndex = {
      ...artistIndex,
      artistRedirects: { 'artist-legacy': 'artist-yoasobi' },
    };

    const page = deriveArtistPage({
      artistId: 'artist-legacy',
      artistIndex: redirectedIndex,
      albumEntries,
      tracksById,
    });

    expect(page).toMatchObject({ id: 'artist-yoasobi', name: 'YOASOBI' });
  });

  it('orders albums newest first and tracks by album, then loose tracks', () => {
    const page = deriveArtistPage({
      artistId: 'artist-yoasobi',
      artistIndex,
      albumEntries,
      tracksById,
    });
    expect(page.albums.map((album) => album.id)).toEqual([
      'album-book3',
      'album-book1',
    ]);
    expect(page.tracks.map((entry) => entry.id)).toEqual([
      'y4',
      'y3',
      'm1',
      'y1',
      'y2',
      'y5',
    ]);
    expect(page).toMatchObject({
      name: 'YOASOBI',
      looseTrackCount: 1,
      yearStart: 2020,
      yearEnd: 2023,
    });
  });

  it('keeps a guest-credited track without claiming the album', () => {
    const page = deriveArtistPage({
      artistId: 'artist-midories',
      artistIndex,
      albumEntries,
      tracksById,
    });
    expect(page.albums).toEqual([]);
    expect(page.tracks.map((entry) => entry.id)).toEqual(['m1']);
  });

  it('returns null for an unknown artist', () => {
    expect(
      deriveArtistPage({
        artistId: 'artist-missing',
        artistIndex,
        albumEntries,
        tracksById,
      }),
    ).toBeNull();
  });
});
