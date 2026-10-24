import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { scanLibrary, classifyReleasePairs } from './scan.js';

const binding = (value = 'a') => ({
  kind: 'audio-content-sha256',
  value: value.repeat(64),
});
const trackId = 'XMWIJCaYx1M';
const local = () => ({
  id: 'local',
  name: 'RASEN',
  kind: 'album',
  trackIds: [trackId],
  releaseInfo: {
    revision: 0,
    observed: {},
    overrides: {
      type: 'single',
      date: { value: '2026-07-25', precision: 'day' },
    },
    localMemberBindings: { [trackId]: binding() },
  },
});
const source = (id = 'source', total = 1) => ({
  id,
  name: 'RASEN',
  kind: 'album',
  source: { platform: 'yt-music', id: `OLAK5uy_${id}` },
  trackIds: [trackId],
  releaseInfo: {
    revision: 0,
    observed: {},
    overrides: {},
    catalog: {
      manifest: {
        playlistId: `OLAK5uy_${id}`,
        browseId: 'MPREb_test',
        title: 'RASEN',
        artist: '9Lana',
        type: total === 1 ? 'single' : 'ep',
        year: '2026',
        reportedTotal: total,
        completeness: 'complete',
        slots: Array.from({ length: total }, (_, i) => ({
          position: i + 1,
          videoId: i === 0 ? trackId : 'CTdGQIeWQM0',
          title: 'Song',
          artist: '9Lana',
          duration: 191,
          available: true,
        })),
      },
      links: {
        'slot-1': {
          trackId,
          evidence: 'exact-source',
          slotIdentity: JSON.stringify([trackId, 'Song', '9Lana']),
        },
      },
      bindings: { [trackId]: binding() },
      rejected: [],
      fetchedAt: '2026-10-24T00:00:00.000Z',
    },
  },
});
export { binding, trackId, local, source };
let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-scan-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

it('classifies local single/source duplicates without collapsing an EP or different sources', () => {
  const media = new Map([[trackId, { status: 'present', binding: binding() }]]);
  const pairs = classifyReleasePairs(
    [local(), source(), source('ep', 6)],
    media,
  );
  expect(pairs).toHaveLength(3);
  expect(
    pairs.find((p) => p.leftId === 'local' && p.rightId === 'source'),
  ).toMatchObject({ kind: 'local-source', mergeable: true });
  expect(pairs.find((p) => p.rightId === 'ep')).toMatchObject({
    mergeable: false,
  });
});

it.each(['missing', 'changed'])(
  'never recommends merge for %s audio',
  (status) => {
    const media = new Map([
      [
        trackId,
        status === 'missing'
          ? { status }
          : { status: 'present', binding: binding('b') },
      ],
    ]);
    expect(classifyReleasePairs([local(), source()], media)[0]).toMatchObject({
      mergeable: false,
    });
  },
);

it('does not use a name or shared recording as proof of equal formal releases', () => {
  const media = new Map([[trackId, { status: 'present', binding: binding() }]]);
  expect(
    classifyReleasePairs([source('a'), source('b')], media)[0],
  ).toMatchObject({ kind: 'different-release', mergeable: false });
  const second = local();
  second.id = 'other';
  second.trackIds = ['CTdGQIeWQM0'];
  expect(classifyReleasePairs([local(), second], media)).toEqual([]);
});

it('keeps dismissal evidence stable across refresh timestamps and collection ordering', () => {
  const media = new Map([[trackId, { status: 'present', binding: binding() }]]);
  const a = local(),
    b = source();
  const before = classifyReleasePairs([a, b], media)[0].evidence;
  b.releaseInfo.revision = 99;
  b.releaseInfo.catalog.fetchedAt = '2026-10-25T00:00:00Z';
  expect(classifyReleasePairs([b, a], media)[0].evidence).toBe(before);
  a.name = 'Changed manual title';
  expect(classifyReleasePairs([a, b], media)[0].evidence).not.toBe(before);
});

it('blocks conflicting manual positions between complete same-source releases', () => {
  const a = source('same', 2),
    second = 'CTdGQIeWQM0';
  a.trackIds.push(second);
  a.releaseInfo.catalog.bindings[second] = binding('b');
  const slots = a.releaseInfo.catalog.manifest.slots;
  a.releaseInfo.catalog.links['slot-2'] = {
    trackId: second,
    evidence: 'manual',
    slotIdentity: JSON.stringify([
      slots[1].videoId,
      slots[1].title,
      slots[1].artist,
    ]),
  };
  const b = structuredClone(a);
  b.id = 'same-copy';
  b.releaseInfo.catalog.links['slot-1'].trackId = second;
  b.releaseInfo.catalog.links['slot-1'].evidence = 'manual';
  b.releaseInfo.catalog.links['slot-2'].trackId = trackId;
  const media = new Map([
    [trackId, { status: 'present', binding: binding() }],
    [second, { status: 'present', binding: binding('b') }],
  ]);
  expect(classifyReleasePairs([a, b], media)[0]).toMatchObject({
    kind: 'same-source',
    mergeable: false,
  });
});

it('scans actual structured/legacy audio read-only including unindexed files and duplicate bytes', async () => {
  fs.mkdirSync(path.join(dir, 'tracks', trackId), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tracks', trackId, 'audio.wav'), 'sound');
  fs.writeFileSync(path.join(dir, 'legacy.wav'), 'sound');
  fs.writeFileSync(
    path.join(dir, 'library.json'),
    JSON.stringify({
      version: 2,
      custom: 1,
      tracks: { [trackId]: { title: 'App title' } },
    }),
  );
  const before = fs.readFileSync(path.join(dir, 'library.json'));
  const readTags = vi.fn(async () => ({ title: 'File title' }));
  const result = await scanLibrary(dir, { readTags });
  expect(result.tracks.map((t) => t.id)).toEqual(['legacy', trackId].sort());
  expect(result.issues.some((i) => i.kind === 'duplicate-file')).toBe(true);
  expect(result.issues.some((i) => i.kind === 'metadata-difference')).toBe(
    true,
  );
  expect(fs.readFileSync(path.join(dir, 'library.json'))).toEqual(before);
  expect(fs.existsSync(path.join(dir, 'tracks', 'legacy'))).toBe(false);
  expect(result).not.toHaveProperty('dir');
});

it('honors cancellation and reports progress without writing or reading tags after abort', async () => {
  const controller = new AbortController();
  controller.abort();
  const readTags = vi.fn();
  await expect(
    scanLibrary(dir, { signal: controller.signal, readTags }),
  ).rejects.toMatchObject({ code: 'RECONCILIATION_CANCELLED' });
  expect(readTags).not.toHaveBeenCalled();
});
