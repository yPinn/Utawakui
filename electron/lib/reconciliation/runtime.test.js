import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { hashAudioFile } from '../works/trackBinding.js';
import { createReconciliationService } from './runtime.js';
import { createReleaseCatalogService } from '../releases/catalogRuntime.js';
import { importLocalAudioFiles } from '../library/importLocal.js';
import { saveProviderIndexEntry } from '../library/metadataIndex.js';
import {
  loadPlaylists,
  loadCatalogCollections,
  writeReleaseCatalog,
  upsertAlbum,
} from '../playlists.js';

let dir, scope, service, binding, notify;
const id = 'XMWIJCaYx1M';
function write(name, data) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
}
function read(name) {
  return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
}
function makeCollections() {
  return [
    {
      id: 'local',
      kind: 'album',
      name: 'My RASEN',
      description: 'Manual',
      coverImage: 'cover.png',
      custom: 'preserved',
      trackIds: [id],
      addedAt: { [id]: '2026-01-01T00:00:00Z' },
      releaseInfo: {
        revision: 2,
        observed: {},
        overrides: {
          type: 'single',
          date: { value: '2026-07-25', precision: 'day' },
        },
        leadTrackId: id,
        localMemberBindings: { [id]: binding },
      },
    },
    {
      id: 'source',
      kind: 'album',
      name: 'RASEN',
      trackIds: [id],
      addedAt: {},
      source: { platform: 'yt-music', id: 'OLAK5uy_rasen' },
      releaseInfo: {
        revision: 1,
        overrides: {},
        observed: {
          date: {
            value: { value: '2026', precision: 'year' },
            provenance: { provider: 'yt-music', sourceId: 'OLAK5uy_rasen' },
          },
        },
        catalog: {
          manifest: {
            playlistId: 'OLAK5uy_rasen',
            browseId: 'MPREb_rasen',
            title: 'RASEN',
            artist: '9Lana',
            type: 'single',
            year: '2026',
            reportedTotal: 1,
            completeness: 'complete',
            slots: [
              {
                position: 1,
                videoId: id,
                title: 'Song',
                artist: '9Lana',
                duration: 191,
                available: true,
              },
            ],
          },
          links: {
            'slot-1': {
              trackId: id,
              evidence: 'exact-source',
              slotIdentity: JSON.stringify([id, 'Song', '9Lana']),
            },
          },
          bindings: { [id]: binding },
          rejected: [],
          fetchedAt: '2026-10-24T00:00:00Z',
        },
      },
    },
  ];
}
beforeEach(async () => {
  fs.mkdirSync('.tmp', { recursive: true });
  dir = fs.mkdtempSync(path.resolve('.tmp/reconcile-runtime-'));
  fs.mkdirSync(path.join(dir, 'tracks', id), { recursive: true });
  const file = path.join(dir, 'tracks', id, 'audio.wav');
  fs.writeFileSync(file, 'original audio');
  binding = await hashAudioFile(file);
  scope = { dir, epoch: 1 };
  notify = vi.fn();
  write('playlists.json', {
    version: 4,
    custom: { keep: true },
    playlists: makeCollections(),
  });
  write('library.json', {
    version: 2,
    custom: 5,
    tracks: {
      [id]: {
        title: 'Manual title',
        titleOrigin: 'manual',
        album: 'App album',
      },
    },
  });
  service = createReconciliationService({
    getDirectory: () => scope,
    notifyChanged: notify,
    scanOptions: {
      readTags: async () => ({ title: 'File title', album: 'File album' }),
    },
  });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
async function preview(kind) {
  const scan = await service.scan();
  const item = scan.items.find((item) => item.kind === kind);
  return service.preview({ scanId: scan.scanId, itemId: item.itemId });
}

it('exposes only bounded projections, supports pagination and cancellation', async () => {
  const scan = await service.scan();
  const json = JSON.stringify(scan);
  expect(json).not.toContain(dir);
  expect(json).not.toContain(binding.value);
  expect(json).not.toContain('localMemberBindings');
  expect(
    service.page({ scanId: scan.scanId, offset: 0, limit: 1 }).items,
  ).toHaveLength(1);
  expect(() => service.page({ scanId: scan.scanId, limit: 101 })).toThrow();
  expect(() => service.scan({ path: 'private' })).toThrow();
  expect(() => service.page({ scanId: 'unknown' })).toThrow();
});
it('merges into the local UUID, preserves precise manual metadata/raw fields and can undo', async () => {
  const p = await preview('release-pair');
  expect(p).toMatchObject({
    kind: 'release-pair',
    mergeable: true,
    kept: { id: 'local' },
    retired: { id: 'source' },
  });
  const committed = await service.commit({ previewId: p.previewId });
  const doc = read('playlists.json');
  expect(doc.custom).toEqual({ keep: true });
  expect(doc.playlists).toHaveLength(1);
  expect(doc.playlists[0]).toMatchObject({
    id: 'local',
    name: 'My RASEN',
    custom: 'preserved',
    coverImage: 'cover.png',
    source: { id: 'OLAK5uy_rasen' },
    releaseInfo: {
      overrides: { date: { value: '2026-07-25', precision: 'day' } },
      catalog: { bindings: { [id]: binding } },
    },
  });
  expect(doc.playlists[0].releaseInfo).not.toHaveProperty(
    'localMemberBindings',
  );
  expect(doc.reconciliation.redirects.source).toBe('local');
  expect(notify).toHaveBeenCalled();
  await service.undo({ mergeId: committed.mergeId, libraryEpoch: 1 });
  expect(read('playlists.json').playlists.map((c) => c.id)).toEqual([
    'local',
    'source',
  ]);
  expect(read('library.json').custom).toBe(5);
});
it('reuses the merged UUID for later album imports across provider aliases without reverting manual release data', async () => {
  const p = await preview('release-pair');
  await service.commit({ previewId: p.previewId });
  const merged = read('playlists.json').playlists[0];
  for (const platform of ['youtube', 'yt-music']) {
    upsertAlbum(dir, {
      name: 'Provider name',
      source: { ...merged.source, platform },
      trackIds: [id],
      releaseObservations: {
        type: {
          value: 'single',
          provenance: { provider: platform, sourceId: merged.source.id },
        },
        date: {
          value: { value: '2020', precision: 'year' },
          provenance: { provider: platform, sourceId: merged.source.id },
        },
      },
    });
    const after = read('playlists.json');
    expect(after.playlists).toHaveLength(1);
    expect(after.playlists[0]).toMatchObject({
      id: 'local',
      name: 'My RASEN',
      description: 'Manual',
      coverImage: 'cover.png',
      custom: 'preserved',
      releaseInfo: {
        overrides: merged.releaseInfo.overrides,
        catalog: merged.releaseInfo.catalog,
      },
    });
    expect(after.reconciliation.redirects.source).toBe('local');
  }
});
it('skips an identical single-file reimport after merging without replacing checked track metadata', async () => {
  const p = await preview('release-pair');
  await service.commit({ previewId: p.previewId });
  const index = read('library.json');
  index.tracks[id].contentHash = binding.value;
  write('library.json', index);
  fs.mkdirSync(path.join(dir, 'incoming'));
  const file = path.join(dir, 'incoming', 'copy.wav');
  fs.copyFileSync(path.join(dir, 'tracks', id, 'audio.wav'), file);
  const imported = await importLocalAudioFiles(dir, [file], {
    readAudioMetadata: async () => ({
      title: 'Embedded replacement',
      album: 'Other',
      duration: 1,
    }),
  });
  expect(imported.imported).toEqual([]);
  expect(imported.skipped).toEqual([
    expect.objectContaining({
      reason: 'duplicate-content',
      existingTrackId: id,
    }),
  ]);
  expect(read('library.json')).toEqual(index);
  expect(loadPlaylists(dir).map((p) => p.id)).toEqual(['local']);
});
it('keeps a merged Single, its checked metadata and a different EP separate through download and source refresh', async () => {
  const p = await preview('release-pair');
  await service.commit({ previewId: p.previewId });
  const original = read('playlists.json').playlists[0];
  const ep = structuredClone(original);
  ep.id = 'other-ep';
  ep.name = 'RASEN EP';
  ep.source = { platform: 'yt-music', id: 'OLAK5uy_other_ep' };
  ep.releaseInfo.overrides = { type: 'ep' };
  ep.releaseInfo.observed = {};
  ep.releaseInfo.catalog.manifest.playlistId = ep.source.id;
  ep.releaseInfo.catalog.manifest.type = 'ep';
  ep.releaseInfo.catalog.manifest.reportedTotal = 6;
  ep.releaseInfo.catalog.manifest.slots = Array.from({ length: 6 }, (_, i) => ({
    ...original.releaseInfo.catalog.manifest.slots[0],
    position: i + 1,
    ...(i
      ? {
          videoId: `E${String(i).padStart(10, '0')}`,
          title: `EP track ${i + 1}`,
        }
      : {}),
  }));
  const doc = read('playlists.json');
  doc.playlists.push(ep);
  write('playlists.json', doc);
  const checked = read('library.json');
  const manifest = {
    ...original.releaseInfo.catalog.manifest,
    title: 'Provider rename',
    year: '2020',
  };
  const catalog = createReleaseCatalogService({
    getDirectory: () => scope,
    requireProvider: () => {},
    runWorker: async (request) => ({
      status: 'ok',
      manifest:
        request.playlistId === ep.source.id
          ? ep.releaseInfo.catalog.manifest
          : manifest,
    }),
    inspectBinding: async (trackId) => ({
      status: 'present',
      binding: await hashAudioFile(
        path.join(dir, 'tracks', trackId, 'audio.wav'),
      ),
    }),
    listTracks: () => [
      { id, title: 'Manual title', artist: '9Lana', album: 'App album' },
    ],
  });
  const target = catalog.prepareDownload({
    collectionId: 'local',
    expectedRevision: original.releaseInfo.revision,
    libraryEpoch: 1,
    slotKey: 'slot-1',
  });
  saveProviderIndexEntry(dir, id, {
    title: 'Download title',
    titleOrigin: 'provider',
    artist: '9Lana',
    artistOrigin: 'provider',
    album: 'Download album',
  });
  expect(await catalog.attachDownload(target)).toMatchObject({
    status: 'ok',
    collectionId: 'local',
  });
  expect(read('library.json').tracks[id].title).toBe(checked.tracks[id].title);
  expect(read('library.json').tracks[id].album).toBe('App album');
  expect(await catalog.refresh({ collectionId: 'local' })).toMatchObject({
    status: 'complete',
    unresolved: 0,
  });
  expect(await catalog.enqueue(id)).toMatchObject({
    status: 'complete',
    unresolved: 0,
  });
  const after = read('playlists.json');
  expect(after.playlists.map((p) => p.id)).toEqual(['local', 'other-ep']);
  expect(after.playlists[0]).toMatchObject({
    name: original.name,
    description: original.description,
    coverImage: original.coverImage,
    releaseInfo: {
      overrides: original.releaseInfo.overrides,
      catalog: {
        manifest: { title: 'Provider rename' },
        links: original.releaseInfo.catalog.links,
        bindings: original.releaseInfo.catalog.bindings,
      },
    },
  });
  expect(after.reconciliation.redirects.source).toBe('local');
  expect(after.playlists[1].releaseInfo.catalog.manifest.slots).toHaveLength(6);
  expect(loadCatalogCollections(dir)).toHaveLength(2);
  expect(after.reconciliation.pendingReleases).toEqual([]);
});
it('attaches a newly downloaded missing slot to the merged release without creating another album', async () => {
  const newId = 'rgNdeflYdYw';
  const p = await preview('release-pair');
  await service.commit({ previewId: p.previewId });
  const original = read('playlists.json').playlists[0];
  const manifest = structuredClone(original.releaseInfo.catalog.manifest);
  manifest.reportedTotal = 2;
  manifest.slots.push({
    ...manifest.slots[0],
    position: 2,
    videoId: newId,
    title: 'Second song',
  });
  const catalog = createReleaseCatalogService({
    getDirectory: () => scope,
    requireProvider: () => {},
    runWorker: async () => ({ status: 'ok', manifest }),
    listTracks: () => [{ id }],
    inspectBinding: async (trackId) => ({
      status: 'present',
      binding: await hashAudioFile(
        path.join(dir, 'tracks', trackId, 'audio.wav'),
      ),
    }),
  });
  expect(await catalog.refresh({ collectionId: 'local' })).toMatchObject({
    status: 'complete',
  });
  const merged = read('playlists.json').playlists[0];
  const target = catalog.prepareDownload({
    collectionId: 'local',
    libraryEpoch: 1,
    expectedRevision: merged.releaseInfo.revision,
    slotKey: 'slot-2',
  });
  expect(target.videoId).toBe(newId);
  // The provider installs the original file before Main admits the saved slot.
  fs.mkdirSync(path.join(dir, 'tracks', newId), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'tracks', newId, 'audio.wav'),
    'new downloaded audio',
  );
  saveProviderIndexEntry(dir, newId, {
    title: 'Second song',
    titleOrigin: 'provider',
  });
  expect(await catalog.attachDownload(target)).toMatchObject({
    status: 'ok',
    collectionId: 'local',
  });
  const after = read('playlists.json');
  expect(after.playlists).toHaveLength(1);
  expect(after.playlists[0]).toMatchObject({
    id: 'local',
    name: merged.name,
    description: merged.description,
    coverImage: merged.coverImage,
    trackIds: [id, newId],
    releaseInfo: {
      overrides: merged.releaseInfo.overrides,
      catalog: { manifest, links: { 'slot-2': { trackId: newId } } },
    },
  });
  expect(after.reconciliation.redirects.source).toBe('local');
  expect(read('library.json').tracks[id].title).toBe('Manual title');
});
it('applies field decisions with file evidence and refuses replay', async () => {
  const p = await preview('metadata');
  expect(p.fields.title).toMatchObject({
    value: 'Manual title',
    observed: 'File title',
    origin: 'manual',
  });
  await service.commit({
    previewId: p.previewId,
    decisions: { title: { action: 'source' }, album: { action: 'clear' } },
  });
  expect(read('library.json')).toMatchObject({
    custom: 5,
    tracks: {
      [id]: {
        title: 'File title',
        titleOrigin: 'manual',
        album: '',
        albumOrigin: 'manual',
      },
    },
  });
  await expect(
    service.commit({ previewId: p.previewId }),
  ).rejects.toMatchObject({ code: 'RECONCILIATION_EXPIRED' });
});
it.each(['metadata', 'release-pair'])(
  'rejects %s confirmation after an external edit or scope change',
  async (kind) => {
    let p = await preview(kind);
    write('library.json', { ...read('library.json'), external: true });
    await expect(
      service.commit({ previewId: p.previewId }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_CONFLICT' });
    p = await preview(kind);
    scope = { ...scope, epoch: 2 };
    await expect(
      service.commit({ previewId: p.previewId }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_STALE' });
  },
);
it('rejects changed media and does not reaccept previously stale bindings', async () => {
  const p = await preview('release-pair');
  fs.writeFileSync(
    path.join(dir, 'tracks', id, 'audio.wav'),
    'replacement audio',
  );
  await expect(
    service.commit({ previewId: p.previewId }),
  ).rejects.toMatchObject({ code: 'RECONCILIATION_CONFLICT' });
  const scan = await service.scan();
  expect(scan.items.find((i) => i.kind === 'release-pair')).toMatchObject({
    mergeable: false,
  });
});
it('persists dismiss/reopen decisions without hiding changed evidence', async () => {
  let scan = await service.scan();
  let item = scan.items.find((i) => i.kind === 'release-pair');
  await service.decide({
    scanId: scan.scanId,
    itemId: item.itemId,
    action: 'dismiss',
  });
  scan = await service.scan();
  expect(scan.items.some((i) => i.kind === 'release-pair')).toBe(false);
  item = service
    .page({ scanId: scan.scanId, kind: 'reviewed' })
    .items.find((i) => i.kind === 'release-pair');
  expect(item.dismissed).toBe(true);
  await service.decide({
    scanId: scan.scanId,
    itemId: item.itemId,
    action: 'review',
  });
  scan = await service.scan();
  expect(scan.items.find((i) => i.kind === 'release-pair').dismissed).toBe(
    false,
  );
});
it('moves folder objects without changing photo asset keys and detects rollback conflicts', async () => {
  write('folder-page-assets.json', {
    version: 4,
    custom: true,
    objects: [
      {
        key: 'note:a',
        page: { kind: 'album', id: 'local' },
        source: 'user',
        type: 'note',
        order: 1,
      },
      {
        key: 'photo:b',
        page: { kind: 'album', id: 'source' },
        source: 'user',
        type: 'photo',
        order: 1,
      },
    ],
  });
  const p = await preview('release-pair');
  const result = await service.commit({ previewId: p.previewId });
  expect(read('folder-page-assets.json')).toMatchObject({
    custom: true,
    objects: [
      { key: 'note:a', page: { id: 'local' } },
      { key: 'photo:b', page: { id: 'local' } },
    ],
  });
  const changed = read('playlists.json');
  changed.playlists[0].name = 'Later edit';
  write('playlists.json', changed);
  await expect(
    service.undo({ mergeId: result.mergeId, libraryEpoch: 1 }),
  ).rejects.toMatchObject({ code: 'RECONCILIATION_CONFLICT' });
});

it('keeps a matching source proposal out of the library until the user confirms it', async () => {
  const [local, source] = makeCollections();
  write('playlists.json', { version: 4, playlists: [local] });
  writeReleaseCatalog(dir, source, null);
  expect(loadPlaylists(dir).map((c) => c.id)).toEqual(['local']);
  expect(loadCatalogCollections(dir).map((c) => c.id)).toEqual([
    'local',
    'source',
  ]);
  // Legacy provider collection creation must not bypass the pending proposal.
  upsertAlbum(dir, { name: 'RASEN', source: source.source, trackIds: [id] });
  expect(loadPlaylists(dir).map((c) => c.id)).toEqual(['local']);
  const p = await preview('release-pair');
  await service.commit({ previewId: p.previewId });
  expect(loadPlaylists(dir)).toHaveLength(1);
  expect(loadCatalogCollections(dir)).toHaveLength(1);
});

it('supports legacy album-import admission and publishes a pending source when keeping releases separate', async () => {
  const [local, source] = makeCollections();
  write('playlists.json', { version: 4, playlists: [local] });
  upsertAlbum(dir, { name: 'RASEN', source: source.source, trackIds: [id] });
  const pending = loadCatalogCollections(dir).find((c) => c.source);
  expect(loadPlaylists(dir)).toHaveLength(1);
  writeReleaseCatalog(
    dir,
    { ...source, id: pending.id },
    pending.releaseInfo?.revision ?? 0,
  );
  const scan = await service.scan(),
    item = scan.items.find((i) => i.kind === 'release-pair');
  expect(item.mergeable).toBe(true);
  await service.decide({
    scanId: scan.scanId,
    itemId: item.itemId,
    action: 'dismiss',
  });
  expect(loadPlaylists(dir)).toHaveLength(2);
  expect(read('playlists.json').reconciliation.pendingReleases).toHaveLength(0);
  const repeated = await service.scan();
  expect(repeated.items.some((i) => i.kind === 'release-pair')).toBe(false);
  expect(
    service.page({ scanId: repeated.scanId, kind: 'reviewed' }).items,
  ).toHaveLength(1);
});
