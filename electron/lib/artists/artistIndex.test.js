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
    expect(index).toEqual({ artists: [], trackArtistIds: {} });
  });
});

const ADO_CHANNEL = 'UC5DHwv9N4OQ9AWtKr8YSefw';
const TOPIC_CHANNEL = 'UCmfq2-6nkZFvS5LYtshQmEw';

function cacheWith(factsByTrackId, photoUrls = new Map()) {
  const readFacts = vi.fn(
    async (_dir, trackId) => factsByTrackId[trackId] ?? null,
  );
  const listPhotoUrls = vi.fn(() => photoUrls);
  return {
    readFacts,
    listPhotoUrls,
    cache: createArtistIndexCache({ readFacts, listPhotoUrls }),
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
