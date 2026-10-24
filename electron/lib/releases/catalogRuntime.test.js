import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createReleaseCatalogService } from './catalogRuntime.js';
import { loadPlaylists, upsertAlbum, setPlaylistCover } from '../playlists.js';
import { createReleaseOrganizationRuntime } from './runtime.js';
const video = 'rgNdeflYdYw',
  second = 'qFeKKGDoF2E';
const binding = { kind: 'audio-content-sha256', value: 'a'.repeat(64) };
const manifest = () => ({
  playlistId: 'OLAK5uy_test',
  browseId: 'MPREb_test',
  title: 'Album',
  artist: 'Artist',
  type: 'album',
  year: '2021',
  reportedTotal: 2,
  completeness: 'complete',
  slots: [second, video].map((videoId, index) => ({
    position: index + 1,
    videoId,
    title: 'Song',
    artist: 'Artist',
    duration: 200,
    available: true,
  })),
});
let dir, scope, tracks, gate, runWorker, service;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-runtime-'));
  scope = { dir, epoch: 1 };
  tracks = [{ id: video, title: 'Song', artist: 'Artist', album: 'Album' }];
  gate = vi.fn();
  runWorker = vi.fn(async () => ({ status: 'ok', manifest: manifest() }));
  service = createReleaseCatalogService({
    getDirectory: () => scope,
    requireProvider: gate,
    runWorker,
    inspectBinding: async (id) =>
      tracks.some((track) => track.id === id)
        ? { status: 'present', binding }
        : { status: 'missing' },
    listTracks: () => tracks,
  });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
it('explicitly includes held audio even when the source slot is no longer online', async () => {
  await service.refresh({ trackId: video });
  let saved = loadPlaylists(dir)[0];
  await service.unlink({
    collectionId: saved.id,
    expectedRevision: saved.releaseInfo.revision,
    libraryEpoch: 1,
    slotKey: 'slot-2',
  });
  const file = path.join(dir, 'playlists.json'),
    document = JSON.parse(fs.readFileSync(file));
  document.playlists[0].releaseInfo.catalog.manifest.slots[1].available = false;
  fs.writeFileSync(file, JSON.stringify(document));
  saved = loadPlaylists(dir)[0];
  expect(
    await service.linkLocal({
      collectionId: saved.id,
      expectedRevision: saved.releaseInfo.revision,
      libraryEpoch: 1,
      slotKey: 'slot-2',
    }),
  ).toMatchObject({ status: 'ok' });
  const linked = loadPlaylists(dir)[0];
  expect(linked.trackIds).toContain(video);
  expect(linked.releaseInfo.catalog.links['slot-2'].trackId).toBe(video);
  expect(linked.releaseInfo.catalog.manifest.slots[1].available).toBe(false);
});
it('explicitly restores an exact local slot without a provider query or overwriting other exclusions', async () => {
  tracks.push({ id: second, title: 'Song' });
  await service.refresh({ trackId: video });
  let saved = loadPlaylists(dir)[0];
  await service.unlink({
    collectionId: saved.id,
    expectedRevision: saved.releaseInfo.revision,
    libraryEpoch: 1,
    slotKey: 'slot-1',
  });
  saved = loadPlaylists(dir)[0];
  await service.unlink({
    collectionId: saved.id,
    expectedRevision: saved.releaseInfo.revision,
    libraryEpoch: 1,
    slotKey: 'slot-2',
  });
  saved = loadPlaylists(dir)[0];
  runWorker.mockClear();
  gate.mockImplementation(() => {
    throw Error('offline');
  });
  const request = {
    collectionId: saved.id,
    expectedRevision: saved.releaseInfo.revision,
    libraryEpoch: 1,
    slotKey: 'slot-2',
  };
  expect(saved.releaseInfo.catalog.rejected).toContain(video);
  expect(await service.linkLocal(request)).toMatchObject({ status: 'ok' });
  const linked = loadPlaylists(dir)[0];
  expect(linked.trackIds).toContain(video);
  expect(linked.releaseInfo.catalog.links['slot-2'].trackId).toBe(video);
  expect(linked.releaseInfo.catalog.rejected).not.toContain(video);
  expect(linked.releaseInfo.catalog.rejected).toContain(second);
  expect(runWorker).not.toHaveBeenCalled();
});

it('refuses changed accepted media and changed slot identity instead of replacing their proofs', async () => {
  await service.refresh({ trackId: video });
  let saved = loadPlaylists(dir)[0];
  saved.releaseInfo.catalog.bindings[video] = {
    ...binding,
    value: 'b'.repeat(64),
  };
  const documentPath = path.join(dir, 'playlists.json');
  let document = JSON.parse(fs.readFileSync(documentPath));
  document.playlists[0] = saved;
  fs.writeFileSync(documentPath, JSON.stringify(document));
  const request = {
    collectionId: saved.id,
    expectedRevision: saved.releaseInfo.revision,
    libraryEpoch: 1,
    slotKey: 'slot-2',
  };
  const bytes = fs.readFileSync(documentPath);
  await expect(service.linkLocal(request)).rejects.toMatchObject({
    code: 'RELEASE_BINDING_MISMATCH',
  });
  expect(fs.readFileSync(documentPath)).toEqual(bytes);
  const target = service.prepareDownload({ ...request, slotKey: 'slot-1' });
  document = JSON.parse(fs.readFileSync(documentPath));
  document.playlists[0].releaseInfo.catalog.manifest.slots[0].title =
    'A different recording';
  fs.writeFileSync(documentPath, JSON.stringify(document));
  await expect(service.attachDownload(target)).rejects.toMatchObject({
    code: 'RELEASE_INFO_CONFLICT',
  });
  expect(() =>
    service.prepareDownload({ ...request, url: 'https://untrusted' }),
  ).toThrow();
});

it('rechecks a captured download slot and never rebinds accepted changed media', async () => {
  await service.refresh({ trackId: video });
  let saved = loadPlaylists(dir)[0];
  const input = {
    collectionId: saved.id,
    expectedRevision: saved.releaseInfo.revision,
    libraryEpoch: 1,
    slotKey: 'slot-1',
  };
  const target = service.prepareDownload(input);
  tracks.push({ id: second, title: 'Song' });
  await service.attachDownload(target);
  saved = loadPlaylists(dir)[0];
  expect(saved.trackIds).toEqual([second, video]);
  expect(await service.attachDownload(target)).toMatchObject({ status: 'ok' });
  scope = { dir, epoch: 2 };
  await expect(service.attachDownload(target)).rejects.toMatchObject({
    code: 'RELEASE_SCOPE_STALE',
  });
});
it('never overwrites a user cover chosen while a source catalog is being verified', async () => {
  const previous = upsertAlbum(dir, {
    name: 'Album',
    source: { platform: 'yt-music', id: 'OLAK5uy_test' },
    trackIds: [video],
  })[0];
  const value = manifest();
  value.artworkUrl = 'https://lh3.googleusercontent.com/cover';
  const coverDir = path.join(dir, 'playlist-covers', previous.id);
  let inspections = 0;
  const current = createReleaseCatalogService({
    getDirectory: () => scope,
    requireProvider: gate,
    runWorker: async () => ({ status: 'ok', manifest: value }),
    listTracks: () => tracks,
    acquireArtwork: async () => ({
      extension: '.jpg',
      buffer: Buffer.from('source cover'),
    }),
    inspectBinding: async () => {
      if (++inspections === 2) {
        fs.mkdirSync(coverDir, { recursive: true });
        fs.writeFileSync(path.join(coverDir, 'cover.jpg'), 'user cover');
        setPlaylistCover(dir, previous.id, 'cover.jpg');
      }
      return { status: 'present', binding };
    },
  });
  expect(await current.refresh({ collectionId: previous.id })).toMatchObject({
    status: 'complete',
    updated: 1,
  });
  expect(fs.readFileSync(path.join(coverDir, 'cover.jpg'), 'utf8')).toBe(
    'user cover',
  );
  expect(loadPlaylists(dir)[0].coverImage).toBe('cover.jpg');
});
it('bounds candidate intent, empty legacy scans and cancelled pending import work', async () => {
  tracks = [{ id: 'local-file', title: 'Song', artist: 'Artist' }];
  expect(await service.refresh()).toMatchObject({
    total: 0,
    needsConfirmation: 1,
  });
  expect(await service.refresh({ trackId: 'local-file' })).toMatchObject({
    total: 0,
    needsConfirmation: 1,
  });
  expect(() => service.refresh({ trackId: video, url: 'private' })).toThrow();
  await expect(
    service.preview({ candidateId: 'expired' }),
  ).rejects.toMatchObject({ code: 'RELEASE_CANDIDATE_EXPIRED' });
  expect(() =>
    service.accept({ candidateId: 'expired', position: 1, offset: 0 }),
  ).toThrow();
  runWorker.mockResolvedValueOnce({ status: 'error' });
  expect(await service.search({ trackId: 'local-file' })).toEqual({
    status: 'unavailable',
    candidates: [],
  });
  runWorker.mockResolvedValueOnce({
    status: 'ok',
    candidates: [
      { browseId: 'MPREb_test', title: 'Album', artist: 'Artist', year: '' },
    ],
  });
  const { candidates } = await service.search({ trackId: 'local-file' });
  await expect(
    service.preview({ candidateId: candidates[0].candidateId, limit: 101 }),
  ).rejects.toMatchObject({ code: 'RELEASE_CATALOG_INVALID' });
  expect(() =>
    service.accept({ candidateId: candidates[0].candidateId, position: 1 }),
  ).toThrow();
  await expect(
    service.unlink({
      collectionId: 'absent',
      expectedRevision: 0,
      libraryEpoch: 1,
      slotKey: 'slot-1',
    }),
  ).rejects.toMatchObject({ code: 'RELEASE_INFO_CONFLICT' });
});
it('keeps changed source positions out of Main playback, and deduplicates cached import reconciliation', async () => {
  await service.refresh({ trackId: video });
  runWorker.mockClear();
  tracks.push({ id: second, title: 'Song' });
  const first = service.enqueue(second),
    duplicate = service.enqueue(second);
  expect(first).toBe(duplicate);
  await first;
  expect(runWorker).not.toHaveBeenCalled();
  const collection = loadPlaylists(dir)[0];
  collection.releaseInfo.catalog.manifest.slots[1].title = 'New edition';
  fs.writeFileSync(
    path.join(dir, 'playlists.json'),
    JSON.stringify({ version: 4, playlists: [collection] }),
  );
  const runtime = createReleaseOrganizationRuntime({
    getDirectory: () => scope,
    inspectBinding: async () => ({ status: 'present', binding }),
  });
  expect(await runtime.forTrack({ trackId: video })).toMatchObject({
    releases: [],
  });
  expect(
    await runtime.withPlayableCollection(
      { collectionId: collection.id },
      ({ collection: value }) => value.trackIds,
    ),
  ).toEqual([second]);
});
it('creates one source album after a single and merges another import in original order', async () => {
  expect(await service.refresh({ trackId: video })).toMatchObject({
    status: 'complete',
    updated: 1,
  });
  const first = loadPlaylists(dir)[0];
  tracks.push({ id: second, title: 'Song' });
  await service.refresh({ trackId: second });
  const next = loadPlaylists(dir)[0];
  expect(next.id).toBe(first.id);
  expect(next.trackIds).toEqual([second, video]);
  expect(next.releaseInfo.observed.totalTrackCount.value).toBe(2);
  expect(next.releaseInfo.catalog.links['slot-2'].trackId).toBe(video);
  upsertAlbum(dir, {
    name: 'Album',
    source: { platform: 'youtube', id: 'OLAK5uy_test' },
    trackIds: [video],
  });
  expect(loadPlaylists(dir)).toHaveLength(1);
  expect(loadPlaylists(dir)[0].id).toBe(first.id);
  expect(await service.refresh({ collectionId: first.id })).toMatchObject({
    status: 'complete',
    unresolved: 0,
  });
});
it('includes old source albums even when type and date already exist', async () => {
  await service.refresh({ trackId: video });
  await service.refresh();
  await service.refresh({ collectionId: loadPlaylists(dir)[0].id });
  expect(runWorker).toHaveBeenLastCalledWith(
    { action: 'album', playlistId: 'OLAK5uy_test' },
    expect.any(Object),
  );
});
it('never commits after a gate change or A-B-A epoch change', async () => {
  runWorker.mockImplementationOnce(async () => {
    scope = { dir, epoch: 3 };
    return { status: 'ok', manifest: manifest() };
  });
  expect(await service.refresh({ trackId: video })).toMatchObject({
    status: 'interrupted',
    updated: 0,
  });
  expect(loadPlaylists(dir)).toEqual([]);
  runWorker.mockImplementationOnce(async () => {
    gate.mockImplementation(() => {
      throw Error('disabled');
    });
    return { status: 'ok', manifest: manifest() };
  });
  expect(await service.refresh({ trackId: video })).toMatchObject({
    status: 'interrupted',
    updated: 0,
  });
});
it('retains committed snapshots after provider failure and makes cancellation prevent commit', async () => {
  await service.refresh({ trackId: video });
  const collectionId = loadPlaylists(dir)[0].id;
  const before = fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8');
  runWorker.mockResolvedValueOnce({
    status: 'error',
    reason: 'provider-unavailable',
  });
  expect(await service.refresh({ collectionId })).toMatchObject({
    status: 'complete',
    unresolved: 1,
  });
  expect(fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8')).toBe(
    before,
  );
  runWorker.mockImplementationOnce(async () => {
    service.cancel();
    return { status: 'ok', manifest: manifest() };
  });
  expect(await service.refresh({ collectionId })).toMatchObject({
    status: 'cancelled',
  });
  expect(fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8')).toBe(
    before,
  );
});
it('uses opaque manual candidates and persists a rejected association', async () => {
  tracks = [
    { id: 'local-track', title: 'Song', artist: 'Artist', album: 'Album' },
  ];
  runWorker.mockResolvedValueOnce({
    status: 'ok',
    candidates: [
      {
        browseId: 'MPREb_test',
        title: 'Album',
        artist: 'Artist',
        year: '2021',
      },
    ],
  });
  const search = await service.search({ trackId: 'local-track' });
  expect(JSON.stringify(search)).not.toContain('MPREb_');
  const candidateId = search.candidates[0].candidateId;
  const detail = await service.preview({ candidateId });
  expect(detail.rows).toHaveLength(2);
  await service.accept({ candidateId, position: 2 });
  const collection = loadPlaylists(dir)[0];
  expect(collection.releaseInfo.catalog.links['slot-2'].evidence).toBe(
    'manual',
  );
  gate.mockImplementation(() => {
    throw Error('offline gate');
  });
  await service.unlink({
    collectionId: collection.id,
    expectedRevision: collection.releaseInfo.revision,
    libraryEpoch: scope.epoch,
    slotKey: 'slot-2',
  });
  expect(loadPlaylists(dir)[0].releaseInfo.catalog.rejected).toContain(
    'local-track',
  );
});
it('validates source catalog media for track releases, page and every Main collection consumer', async () => {
  await service.refresh({ trackId: video });
  const collection = loadPlaylists(dir)[0];
  let currentBinding = binding;
  const runtime = createReleaseOrganizationRuntime({
    getDirectory: () => scope,
    inspectBinding: async () => ({
      status: 'present',
      binding: currentBinding,
    }),
  });
  expect(await runtime.forTrack({ trackId: video })).toMatchObject({
    status: 'ok',
    releases: [{ id: collection.id }],
  });
  const input = {
    collectionId: collection.id,
    libraryEpoch: scope.epoch,
    expectedRevision: collection.releaseInfo.revision,
  };
  expect(await runtime.catalogPage(input)).toMatchObject({
    catalog: {
      availableCount: 1,
      rows: [{ state: 'not-imported' }, { state: 'available' }],
    },
  });
  const projected = runtime.projectList([collection])[0];
  expect(projected).toMatchObject({
    hasSourceCatalog: true,
    requiresMembershipVerification: true,
    availableTrackIds: [],
  });
  expect(projected.releaseInfo).not.toHaveProperty('catalog');
  expect(
    await runtime.catalogDownload({ ...input, slotKey: 'slot-1' }),
  ).toEqual({
    status: 'ok',
    libraryEpoch: 1,
    input: `https://music.youtube.com/watch?v=${second}`,
  });
  await expect(
    runtime.catalogDownload({ ...input, slotKey: 'slot-9999' }),
  ).rejects.toMatchObject({ code: 'RELEASE_UNAVAILABLE' });
  await expect(
    runtime.catalogDownload({ ...input, slotKey: 'slot-1', videoId: 'forged' }),
  ).rejects.toMatchObject({ code: 'RELEASE_INFO_INVALID' });
  currentBinding = { ...binding, value: 'b'.repeat(64) };
  expect(await runtime.forTrack({ trackId: video })).toMatchObject({
    releases: [],
  });
  expect(
    await runtime.withPlayableCollection(
      { collectionId: collection.id, libraryEpoch: scope.epoch },
      ({ collection: value }) => value.trackIds,
    ),
  ).toEqual([]);
});
it('rejects manual acceptance against a different partial snapshot instead of saving a broken link', async () => {
  await service.refresh({ trackId: video });
  tracks.push({ id: 'local-track', title: 'Song', album: 'Album' });
  runWorker.mockResolvedValueOnce({
    status: 'ok',
    candidates: [
      {
        browseId: 'MPREb_test',
        title: 'Album',
        artist: 'Artist',
        year: '2021',
      },
    ],
  });
  const search = await service.search({ trackId: 'local-track' });
  const candidateId = search.candidates[0].candidateId;
  const partial = manifest();
  partial.completeness = 'partial';
  partial.slots[1].title = 'Changed';
  runWorker.mockResolvedValueOnce({ status: 'ok', manifest: partial });
  await service.preview({ candidateId });
  await expect(
    service.accept({ candidateId, position: 2 }),
  ).rejects.toMatchObject({ code: 'RELEASE_INFO_CONFLICT' });
  expect(loadPlaylists(dir)[0].trackIds).toEqual([video]);
});
