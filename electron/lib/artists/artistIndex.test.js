import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildArtistIndex,
  createArtistIndexCache,
  readSidecarTrackFacts,
} from './artistIndex.js';

function byName(index, name) {
  return index.artists.find((artist) => artist.name === name);
}

describe('buildArtistIndex', () => {
  it('groups credited forms that share a provider-neutral key', () => {
    const index = buildArtistIndex([
      { id: 'a', artist: 'YOASOBI' },
      { id: 'b', artist: 'ＹＯＡＳＯＢＩ' },
      { id: 'c', artist: 'yoasobi' },
      { id: 'd', artist: 'YOASOBI' },
    ]);
    expect(index.artists).toHaveLength(1);
    expect(index.artists[0]).toMatchObject({
      name: 'YOASOBI',
      trackIds: ['a', 'b', 'c', 'd'],
    });
    expect(index.artists[0].id).toMatch(/^artist-[0-9a-f]{16}$/u);
  });

  it('uses sidecar performer parts that reproduce the stored artist', () => {
    const index = buildArtistIndex(
      [{ id: 't1', artist: '王以太, 艾热AIR, 艾热' }],
      new Map([['t1', ['王以太', '艾热AIR', '艾热']]]),
    );
    expect(index.artists.map((artist) => artist.name)).toEqual([
      '王以太',
      '艾热AIR',
      '艾热',
    ]);
    expect(index.trackArtistIds.t1).toEqual(
      index.artists.map((artist) => artist.id),
    );
  });

  it('keeps a manual or legacy artist value as one credit', () => {
    const index = buildArtistIndex(
      [{ id: 't1', artist: 'AC/DC' }],
      new Map([['t1', ['AC', 'DC']]]),
    );
    expect(index.artists.map((artist) => artist.name)).toEqual(['AC/DC']);
  });

  it('does not re-split a flat artist string without sidecar parts', () => {
    const index = buildArtistIndex([{ id: 't1', artist: 'Aimer, Vaundy' }]);
    expect(index.artists.map((artist) => artist.name)).toEqual([
      'Aimer, Vaundy',
    ]);
  });

  it('shows the most frequent credited form and keeps ids stable', () => {
    const tracks = [
      { id: 'a', artist: 'lisa' },
      { id: 'b', artist: 'LiSA' },
      { id: 'c', artist: 'LiSA' },
    ];
    const first = buildArtistIndex(tracks);
    const second = buildArtistIndex([...tracks].reverse());
    expect(byName(first, 'LiSA').trackIds).toEqual(['a', 'b', 'c']);
    expect(byName(second, 'LiSA').id).toBe(byName(first, 'LiSA').id);
  });

  it('skips tracks without artist', () => {
    const index = buildArtistIndex([{ id: 'a' }, { id: 'b', artist: '  ' }]);
    expect(index).toEqual({
      artists: [],
      trackArtistIds: {},
      artistRedirects: {},
      organizationRevision: 0,
      canUndoOrganization: false,
    });
  });

  it('projects cross-script credits through one persisted artist entity', () => {
    const stableId = 'artist-123e4567-e89b-42d3-a456-426614174000';
    const index = buildArtistIndex(
      [
        { id: 'english', artist: 'JJ Lin' },
        { id: 'chinese', artist: '林俊傑' },
      ],
      new Map(),
      {
        version: 1,
        revision: 4,
        artists: [
          {
            id: stableId,
            displayNameOverride: '林俊傑',
            credits: [
              {
                id: 'credit-jj',
                key: 'jj lin',
                raw: 'JJ Lin',
                normalizerVersion: 1,
                source: 'user',
              },
              {
                id: 'credit-lin',
                key: '林俊傑',
                raw: '林俊傑',
                normalizerVersion: 1,
                source: 'user',
              },
            ],
          },
        ],
        redirects: [
          {
            from: 'artist-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            to: stableId,
          },
        ],
        trackLinks: [],
        dismissed: [],
        history: [],
      },
    );

    expect(index.artists).toEqual([
      expect.objectContaining({
        id: stableId,
        name: '林俊傑',
        trackIds: ['english', 'chinese'],
        credits: [
          { id: 'credit-jj', name: 'JJ Lin', trackCount: 1 },
          { id: 'credit-lin', name: '林俊傑', trackCount: 1 },
        ],
      }),
    ]);
    expect(index.trackArtistIds).toEqual({
      english: [stableId],
      chinese: [stableId],
    });
    expect(index.artistRedirects).toEqual({
      'artist-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': stableId,
      'artist-68d52f69a4a24a1a': stableId,
      'artist-882cd3bcbb49699f': stableId,
    });
    expect(index.organizationRevision).toBe(4);
  });

  it('projects only a bounded identity-resolved flag from stored catalog facts', () => {
    const stableId = 'artist-123e4567-e89b-42d3-a456-426614174000';
    const index = buildArtistIndex(
      [{ id: 'english', artist: 'JJ Lin' }],
      new Map(),
      {
        version: 1,
        revision: 1,
        artists: [
          {
            id: stableId,
            catalog: {
              mbid: '11111111-1111-4111-8111-111111111111',
              name: '林俊傑',
              aliases: [],
              fetchedAt: '2026-10-12T03:00:00.000Z',
            },
            credits: [
              {
                id: 'credit-jj',
                key: 'jj lin',
                raw: 'JJ Lin',
                normalizerVersion: 1,
                source: 'musicbrainz',
              },
            ],
          },
        ],
        redirects: [],
        trackLinks: [],
        dismissed: [],
        history: [],
      },
    );

    expect(index.artists[0]).toMatchObject({
      id: stableId,
      name: '林俊傑',
      identityResolved: true,
    });
    expect(index.artists[0]).not.toHaveProperty('catalog');
  });
});

const ADO_CHANNEL = 'UC5DHwv9N4OQ9AWtKr8YSefw';
const TOPIC_CHANNEL = 'UCmfq2-6nkZFvS5LYtshQmEw';

function cacheWith(factsByTrackId, photoUrls = new Map(), options = {}) {
  const readFacts = vi.fn(
    async (_dir, trackId) => factsByTrackId[trackId] ?? null,
  );
  const listPhotoUrls = vi.fn(() => photoUrls);
  return {
    readFacts,
    listPhotoUrls,
    cache: createArtistIndexCache({ readFacts, listPhotoUrls, ...options }),
  };
}

describe('createArtistIndexCache', () => {
  it('reads sidecars only for new or re-credited tracks', async () => {
    const { cache, readFacts } = cacheWith({
      b: { parts: ['Kenshi Yonezu', 'Hatsune Miku'] },
    });
    const tracks = [
      { id: 'a', artist: 'Aimer' },
      { id: 'b', artist: 'Kenshi Yonezu, Hatsune Miku' },
    ];

    const first = await cache.getIndex('/lib', tracks);
    expect(first.artists.map((artist) => artist.name)).toEqual([
      'Aimer',
      'Kenshi Yonezu',
      'Hatsune Miku',
    ]);
    expect(readFacts).toHaveBeenCalledTimes(2);

    await cache.getIndex('/lib', tracks);
    expect(readFacts).toHaveBeenCalledTimes(2);

    await cache.getIndex('/lib', [...tracks, { id: 'c', artist: 'Eve' }]);
    expect(readFacts).toHaveBeenCalledTimes(3);
    expect(readFacts).toHaveBeenLastCalledWith('/lib', 'c');

    await cache.getIndex('/lib', [{ id: 'a', artist: 'Aimer (edited)' }]);
    expect(readFacts).toHaveBeenLastCalledWith('/lib', 'a');
  });

  it('drops cached facts when the library directory changes', async () => {
    const { cache, readFacts } = cacheWith({});
    const tracks = [{ id: 'a', artist: 'Aimer' }];
    await cache.getIndex('/one', tracks);
    await cache.getIndex('/two', tracks);
    expect(readFacts).toHaveBeenCalledTimes(2);
  });

  it('projects stored photo URLs and leaves the rest empty', async () => {
    const { cache } = cacheWith({});
    const tracks = [
      { id: 'a', artist: 'Ado' },
      { id: 'b', artist: 'Eve' },
    ];
    const adoId = (await cache.getIndex('/lib', tracks)).artists[0].id;
    const { cache: withPhoto } = cacheWith(
      {},
      new Map([[adoId, 'utawakui-media://artist-photo/x/photo.jpg?v=1']]),
    );
    const index = await withPhoto.getIndex('/lib', tracks);
    expect(index.artists.map((artist) => artist.photoUrl)).toEqual([
      'utawakui-media://artist-photo/x/photo.jpg?v=1',
      '',
    ]);
  });

  it('uses a source-credit photo for a stable artist unless removal was explicit', async () => {
    const stableId = 'artist-11111111-1111-4111-8111-111111111111';
    const sourceId = 'artist-68d52f69a4a24a1a';
    const organization = {
      schemaVersion: 1,
      normalizerVersion: 1,
      revision: 1,
      artists: [
        {
          id: stableId,
          credits: [
            {
              id: 'credit-68d52f69a4a24a1a',
              key: 'jj lin',
              raw: 'JJ Lin',
              normalizerVersion: 1,
              source: 'manual',
            },
          ],
        },
      ],
      history: [],
    };
    const photoUrls = new Map([
      [sourceId, 'utawakui-media://legacy/photo.jpg'],
    ]);
    const common = {
      loadOrganization: () => organization,
    };
    const tracks = [{ id: 'english', artist: 'JJ Lin' }];
    const { cache: withFallback } = cacheWith({}, photoUrls, {
      ...common,
      isPhotoRemoved: () => false,
    });
    const { cache: afterRemoval } = cacheWith({}, photoUrls, {
      ...common,
      isPhotoRemoved: () => true,
    });

    await expect(withFallback.getIndex('/lib', tracks)).resolves.toMatchObject({
      artists: [
        { id: stableId, photoUrl: 'utawakui-media://legacy/photo.jpg' },
      ],
    });
    await expect(afterRemoval.getIndex('/lib', tracks)).resolves.toMatchObject({
      artists: [{ id: stableId, photoUrl: '' }],
    });
  });

  it('promotes source photo state after creating a merged stable artist', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-artist-merge-'),
    );
    const promotePhotoState = vi.fn(() => ({ changed: true, state: 'photo' }));
    try {
      const tracks = [
        { id: 'english', artist: 'JJ Lin' },
        { id: 'chinese', artist: '林俊傑' },
      ];
      const { cache } = cacheWith({}, new Map(), { promotePhotoState });
      const before = await cache.getIndex(dir, tracks);
      const selectedIds = before.artists.map((artist) => artist.id);
      const uuid = '11111111-1111-4111-8111-111111111111';

      const result = await cache.mergeArtists(dir, tracks, selectedIds, {
        expectedRevision: 0,
        randomUUID: () => uuid,
      });

      expect(result).toMatchObject({
        status: 'ok',
        artistId: `artist-${uuid}`,
        revision: 1,
      });
      expect(promotePhotoState).toHaveBeenCalledWith(
        dir,
        selectedIds,
        `artist-${uuid}`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('includes existing stable ids when promoting photos across a later merge', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-artist-remerge-'),
    );
    const promotePhotoState = vi.fn(() => ({ changed: true, state: 'photo' }));
    try {
      const tracks = [
        { id: 'english', artist: 'JJ Lin' },
        { id: 'chinese', artist: '林俊傑' },
      ];
      const { cache } = cacheWith({}, new Map(), { promotePhotoState });
      const initial = await cache.getIndex(dir, tracks);
      const english = initial.artists.find(
        (artist) => artist.name === 'JJ Lin',
      );
      const chinese = initial.artists.find(
        (artist) => artist.name === '林俊傑',
      );
      const firstStableId = 'artist-11111111-1111-4111-8111-111111111111';
      const secondStableId = 'artist-22222222-2222-4222-8222-222222222222';

      await cache.setDisplayName(dir, tracks, english.id, 'JJ Lin', {
        expectedRevision: 0,
        randomUUID: () => firstStableId.slice('artist-'.length),
      });
      await cache.setDisplayName(dir, tracks, chinese.id, '林俊傑', {
        expectedRevision: 1,
        randomUUID: () => secondStableId.slice('artist-'.length),
      });
      promotePhotoState.mockClear();

      const result = await cache.mergeArtists(
        dir,
        tracks,
        [firstStableId, secondStableId],
        { expectedRevision: 2 },
      );

      expect(result).toMatchObject({ status: 'ok', artistId: firstStableId });
      expect(promotePhotoState).toHaveBeenCalledWith(
        dir,
        expect.arrayContaining([
          english.id,
          chinese.id,
          firstStableId,
          secondStableId,
        ]),
        firstStableId,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('photo channel derivation', () => {
  async function photoChannel(tracks, facts, name) {
    const { cache } = cacheWith(facts);
    const index = await cache.getIndex('/lib', tracks);
    const artist = index.artists.find((entry) => entry.name === name);
    return cache.getPhotoChannel('/lib', tracks, artist.id);
  }

  it('uses the majority official channel of first-credit tracks', async () => {
    const tracks = [
      { id: 'a', artist: 'Ado' },
      { id: 'b', artist: 'Ado' },
      { id: 'c', artist: 'Ado' },
    ];
    const facts = {
      a: { parts: ['Ado'], channelId: ADO_CHANNEL, channelName: 'Ado' },
      b: { parts: ['Ado'], channelId: ADO_CHANNEL, channelName: 'Ado' },
      c: { parts: ['Ado'], channelId: TOPIC_CHANNEL, channelName: 'Other' },
    };
    await expect(photoChannel(tracks, facts, 'Ado')).resolves.toBe(ADO_CHANNEL);
  });

  it('skips Topic channels whose avatar is an album cover', async () => {
    const tracks = [{ id: 'a', artist: '王以太' }];
    const facts = {
      a: {
        parts: ['王以太'],
        channelId: TOPIC_CHANNEL,
        channelName: 'Yitai Wang - Topic',
      },
    };
    await expect(photoChannel(tracks, facts, '王以太')).resolves.toBe(null);
  });

  it('never gives a guest the headliner channel', async () => {
    const tracks = [{ id: 'a', artist: '河南说唱之神, 荨麻疹' }];
    const facts = {
      a: {
        parts: ['河南说唱之神', '荨麻疹'],
        channelId: ADO_CHANNEL,
        channelName: '河南说唱之神',
      },
    };
    await expect(photoChannel(tracks, facts, '荨麻疹')).resolves.toBe(null);
    await expect(photoChannel(tracks, facts, '河南说唱之神')).resolves.toBe(
      ADO_CHANNEL,
    );
  });

  it('returns null for unknown artists', async () => {
    const { cache } = cacheWith({});
    await expect(
      cache.getPhotoChannel('/lib', [], 'artist-0123456789abcdef'),
    ).resolves.toBe(null);
  });
});

describe('photo search evidence derivation', () => {
  it('returns a deterministic bounded context without trusting renderer metadata', async () => {
    const tracks = [
      { id: 'a', artist: 'Ado' },
      { id: 'b', artist: 'Guest, Ado' },
      { id: 'c', artist: 'Ado' },
      { id: 'd', artist: 'Ado' },
    ];
    const facts = {
      a: {
        parts: ['Ado'],
        videoId: 'AAAAAAAAAAA',
        channelId: ADO_CHANNEL,
        channelName: 'Ado',
      },
      b: {
        parts: ['Guest', 'Ado'],
        videoId: 'BBBBBBBBBBB',
        channelId: TOPIC_CHANNEL,
        channelName: 'Guest',
      },
      c: {
        parts: ['Ado'],
        videoId: 'CCCCCCCCCCC',
        channelId: ADO_CHANNEL,
        channelName: 'Ado',
      },
      d: {
        parts: ['Ado'],
        videoId: 'DDDDDDDDDDD',
        channelId: ADO_CHANNEL,
        channelName: 'Ado',
      },
    };
    const { cache } = cacheWith(facts);
    const index = await cache.getIndex('/lib', tracks);
    const artistId = byName(index, 'Ado').id;

    await expect(
      cache.getPhotoSearchContext('/lib', tracks, artistId),
    ).resolves.toEqual({
      artistName: 'Ado',
      recordings: [
        { videoId: 'AAAAAAAAAAA', channelId: ADO_CHANNEL },
        { videoId: 'BBBBBBBBBBB', channelId: null },
        { videoId: 'CCCCCCCCCCC', channelId: ADO_CHANNEL },
      ],
    });
  });

  it('returns null for unknown artists and omits malformed provider ids', async () => {
    const tracks = [{ id: 'local-track', artist: 'Ado' }];
    const { cache } = cacheWith({
      'local-track': {
        parts: ['Ado'],
        videoId: null,
        channelId: null,
        channelName: '',
      },
    });
    const index = await cache.getIndex('/lib', tracks);
    await expect(
      cache.getPhotoSearchContext('/lib', tracks, index.artists[0].id),
    ).resolves.toEqual({ artistName: 'Ado', recordings: [] });
    await expect(
      cache.getPhotoSearchContext('/lib', tracks, 'artist-ffffffffffffffff'),
    ).resolves.toBe(null);
  });

  it('can bypass cached sidecar facts for the final apply verification', async () => {
    const tracks = [{ id: 'a', artist: 'Ado' }];
    const facts = {
      a: {
        parts: ['Ado'],
        videoId: 'AAAAAAAAAAA',
        channelId: ADO_CHANNEL,
        channelName: 'Ado',
      },
    };
    const { cache, readFacts } = cacheWith(facts);
    const index = await cache.getIndex('/lib', tracks);
    const artistId = index.artists[0].id;
    facts.a = {
      ...facts.a,
      channelId: TOPIC_CHANNEL,
      channelName: 'Ado alternate',
    };

    await expect(
      cache.getPhotoSearchContext('/lib', tracks, artistId),
    ).resolves.toMatchObject({
      recordings: [{ channelId: ADO_CHANNEL }],
    });
    await expect(
      cache.getPhotoSearchContext('/lib', tracks, artistId, { fresh: true }),
    ).resolves.toMatchObject({
      recordings: [{ channelId: TOPIC_CHANNEL }],
    });
    expect(readFacts).toHaveBeenCalledTimes(2);
  });
});

describe('readSidecarTrackFacts', () => {
  let dir;

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('projects performer parts and the uploading channel from info.json', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-artists-'));
    const trackDir = path.join(dir, 'tracks', 'abcdefghijk');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(
      path.join(trackDir, 'info.json'),
      JSON.stringify({
        id: 'abcdefghijk',
        title: 'Blue Blood',
        track: 'Blue Blood',
        artists: ['IVE', 'Nick Hahn'],
        uploader: 'IVE',
        channel: 'IVE',
        channel_id: ADO_CHANNEL,
        description: 'Producer: Nick Hahn\nAuto-generated by YouTube.',
      }),
    );
    await expect(readSidecarTrackFacts(dir, 'abcdefghijk')).resolves.toEqual({
      parts: ['IVE'],
      videoId: 'abcdefghijk',
      channelId: ADO_CHANNEL,
      channelName: 'IVE',
    });
  });

  it('drops malformed channel ids and returns null for missing or unsafe tracks', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-artists-'));
    const trackDir = path.join(dir, 'tracks', 'abcdefghijk');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(
      path.join(trackDir, 'info.json'),
      JSON.stringify({ artist: 'Eve', channel_id: '../x' }),
    );
    await expect(readSidecarTrackFacts(dir, 'abcdefghijk')).resolves.toEqual({
      parts: ['Eve'],
      videoId: null,
      channelId: null,
      channelName: '',
    });
    await expect(readSidecarTrackFacts(dir, 'missing')).resolves.toBe(null);
    await expect(readSidecarTrackFacts(dir, '../escape')).resolves.toBe(null);
  });
});
