import { expect, it } from 'vitest';
import {
  mergedCollection,
  chooseSurvivor,
  mergeFields,
  mergeFolderDocument,
} from './merge.js';
const collection = (id, year) => ({
  id,
  name: id,
  kind: 'album',
  source: { platform: 'yt-music', id: 'OLAK5uy_test' },
  trackIds: [],
  addedAt: {},
  releaseInfo: {
    revision: 0,
    observed: {
      date: {
        value: { value: year, precision: 'year' },
        provenance: { provider: 'yt-music', sourceId: 'OLAK5uy_test' },
      },
    },
    overrides: {},
    catalog: {
      manifest: {
        playlistId: 'OLAK5uy_test',
        browseId: 'MPREb_test',
        title: 'Album',
        artist: 'Artist',
        type: 'album',
        year,
        reportedTotal: 1,
        completeness: 'complete',
        slots: [
          {
            position: 1,
            videoId: 'XMWIJCaYx1M',
            title: 'Song',
            artist: 'Artist',
            duration: 190,
            available: true,
          },
        ],
      },
      links: {},
      bindings: {},
      rejected: [],
      fetchedAt: '2026-10-24T00:00:00Z',
    },
  },
});
it('commits the effective date the user selected even when it was observed rather than overridden', () => {
  const left = collection('a', '2025'),
    right = collection('b', '2026');
  expect(
    mergedCollection(left, right, { date: 'other' }).releaseInfo.overrides.date,
  ).toEqual({ value: '2026', precision: 'year' });
  expect(
    mergedCollection(left, right, { date: 'keep' }).releaseInfo.overrides.date,
  ).toEqual({ value: '2025', precision: 'year' });
});

it('preserves lead/artwork and bounds explicit choices without inventing another catalog', () => {
  const left = collection('a', '2025'),
    right = collection('b', '2026');
  left.trackIds = ['XMWIJCaYx1M'];
  left.coverImage = 'cover.png';
  left.releaseInfo.leadTrackId = 'XMWIJCaYx1M';
  right.trackIds = [...left.trackIds];
  expect(chooseSurvivor({ ...left, source: undefined }, right)[0].id).toBe('a');
  expect(chooseSurvivor(left, { ...right, source: undefined })[0].id).toBe('b');
  expect(chooseSurvivor(left, right)[0].id).toBe('a');
  const merged = mergedCollection(left, right, {
    name: 'other',
    description: 'other',
  });
  expect(merged).toMatchObject({
    name: 'b',
    coverImage: 'cover.png',
    releaseInfo: { leadTrackId: 'XMWIJCaYx1M' },
  });
  expect(
    mergeFields(left, right, merged).find((f) => f.field === 'date'),
  ).toMatchObject({ kept: { value: '2025' }, other: { value: '2026' } });
  expect(() => mergedCollection(left, right, { name: 'bad' })).toThrow();
  expect(() =>
    mergedCollection(
      { ...left, releaseInfo: {} },
      { ...right, releaseInfo: {} },
    ),
  ).toThrow();
});

it('preserves folder user objects/keys, drops duplicate derived projections and blocks unsafe unions', () => {
  expect(mergeFolderDocument({ raw: null }, 'a', 'b')).toEqual({
    raw: null,
    moved: 0,
  });
  const a = {
    key: 'cover',
    page: { kind: 'album', id: 'a' },
    source: 'derived',
    order: 1,
  };
  const b = {
    key: 'cover',
    page: { kind: 'album', id: 'b' },
    source: 'derived',
    order: 1,
  };
  const note = {
    key: 'note:a',
    page: { kind: 'album', id: 'b' },
    source: 'user',
    order: 2,
  };
  const data = { version: 4, custom: true, objects: [a, b, note] };
  const result = mergeFolderDocument(
    { raw: JSON.stringify(data), data },
    'a',
    'b',
  );
  expect(result.moved).toBe(1);
  expect(JSON.parse(result.raw)).toMatchObject({
    custom: true,
    objects: [{ key: 'cover' }, { key: 'note:a', page: { id: 'a' } }],
  });
  expect(
    mergeFolderDocument(
      { raw: 'unchanged', data: { version: 4, objects: [a] } },
      'a',
      'b',
    ).raw,
  ).toBe('unchanged');
  expect(() =>
    mergeFolderDocument(
      { raw: '{}', data: { version: 3, assets: [] } },
      'a',
      'b',
    ),
  ).toThrow();
  expect(() =>
    mergeFolderDocument(
      {
        raw: '{}',
        data: { version: 4, objects: [a, { ...b, source: 'user' }] },
      },
      'a',
      'b',
    ),
  ).toThrow();
  expect(() =>
    mergeFolderDocument(
      {
        raw: '{}',
        data: {
          version: 4,
          objects: Array.from({ length: 13 }, (_, i) => ({
            ...note,
            key: `note:${i}`,
          })),
        },
      },
      'a',
      'b',
    ),
  ).toThrow();
});
