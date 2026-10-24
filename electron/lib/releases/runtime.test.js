import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  createReleaseOrganizationRuntime,
  projectReleaseList,
} from './runtime.js';
import { createWorkOrganizationRuntime } from '../works/runtime.js';
import {
  loadPlaylists,
  setPlaylistKind,
  setPlaylistTracks,
  upsertAlbum,
  createLocalRelease,
} from '../playlists.js';
import { hashAudioFile } from '../works/trackBinding.js';
import { prepareTrackDeletion } from '../works/organization.js';
import { reconcileCatalog } from './catalog.js';

let dir, scope, workRuntime, runtime, inspectBinding, notifyChanged;
const source = { platform: 'youtube', id: 'release-source' };
const info = (extra) => ({
  revision: 0,
  observed: {},
  overrides: {},
  ...extra,
});
const album = (extra) => ({
  id: 'release-a',
  kind: 'album',
  name: 'Release',
  trackIds: ['one', 'two'],
  addedAt: {},
  ...extra,
});
function write(collections) {
  fs.writeFileSync(
    path.join(dir, 'playlists.json'),
    JSON.stringify({ version: 3, playlists: collections }),
  );
}
function audio(id, bytes = id) {
  const target = path.join(dir, 'tracks', id);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'audio.mp3'), bytes);
}
async function save(collectionId, extra = {}) {
  const snapshot = await runtime.get({ collectionId });
  return runtime.save({
    collectionId,
    expectedRevision: snapshot.release.revision,
    libraryEpoch: scope.epoch,
    ...extra,
  });
}
beforeEach(() => {
  fs.mkdirSync('.tmp', { recursive: true });
  dir = fs.mkdtempSync(path.resolve('.tmp/release-runtime-'));
  scope = { dir, epoch: 1 };
  workRuntime = createWorkOrganizationRuntime({ getDirectory: () => scope });
  inspectBinding = vi.fn((...args) => workRuntime.inspectBinding(...args));
  notifyChanged = vi.fn();
  runtime = createReleaseOrganizationRuntime({
    getDirectory: () => scope,
    inspectBinding,
    notifyChanged,
  });
  audio('one');
  audio('two');
  audio('three');
  write([album()]);
});

it('reports an exact local excluded slot as a candidate without admitting it or changing the saved library', async () => {
  const videoId = 'p1tsL0YmNqU';
  audio(videoId);
  const parent = reconcileCatalog(
    album({
      source: { platform: 'youtube', id: 'OLAK5uy_test' },
      trackIds: [],
      releaseInfo: info(),
    }),
    {
      playlistId: 'OLAK5uy_test',
      browseId: 'MPREb_test',
      title: '15',
      artist: 'tuki.',
      type: 'album',
      year: '2025',
      reportedTotal: 1,
      completeness: 'complete',
      slots: [
        {
          position: 1,
          videoId,
          title: 'Bansanka',
          artist: 'tuki.',
          duration: 218,
          available: true,
        },
      ],
    },
    {},
    '2026-10-24T00:00:00Z',
  );
  parent.releaseInfo.catalog.rejected.push(videoId);
  const file = path.join(dir, 'playlists.json');
  fs.writeFileSync(file, JSON.stringify({ version: 4, playlists: [parent] }));
  const before = fs.readFileSync(file);
  const page = await runtime.catalogPage({
    collectionId: parent.id,
    expectedRevision: parent.releaseInfo.revision,
    libraryEpoch: 1,
  });
  expect(page.catalog.availableCount).toBe(0);
  expect(page.catalog.rows[0]).toMatchObject({
    state: 'excluded',
    localTrackId: null,
    localCandidateTrackId: videoId,
  });
  expect(fs.readFileSync(file)).toEqual(before);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

it('keeps an accepted occurrence playable when another occurrence of the same source is excluded', async () => {
  const videoId = 'p1tsL0YmNqU';
  audio(videoId);
  const binding = await hashAudioFile(
    path.join(dir, 'tracks', videoId, 'audio.mp3'),
  );
  const parent = reconcileCatalog(
    album({
      source: { platform: 'youtube', id: 'OLAK5uy_test' },
      trackIds: [],
      releaseInfo: info(),
    }),
    {
      playlistId: 'OLAK5uy_test',
      browseId: 'MPREb_test',
      title: '15',
      artist: 'tuki.',
      type: 'album',
      year: '2025',
      reportedTotal: 2,
      completeness: 'complete',
      slots: [1, 2].map((position) => ({
        position,
        videoId,
        title: 'Bansanka',
        artist: 'tuki.',
        duration: 218,
        available: true,
      })),
    },
    { [videoId]: binding },
    '2026-10-24T00:00:00Z',
  );
  delete parent.releaseInfo.catalog.links['slot-2'];
  parent.releaseInfo.catalog.rejected.push(videoId);
  const file = path.join(dir, 'playlists.json');
  fs.writeFileSync(file, JSON.stringify({ version: 4, playlists: [parent] }));
  const before = fs.readFileSync(file);
  const page = await runtime.catalogPage({
    collectionId: parent.id,
    expectedRevision: parent.releaseInfo.revision,
    libraryEpoch: 1,
  });
  expect(page.catalog.availableCount).toBe(1);
  expect(page.catalog.rows).toMatchObject([
    { state: 'available', localTrackId: videoId, localCandidateTrackId: null },
    { state: 'excluded', localTrackId: null, localCandidateTrackId: videoId },
  ]);
  const intent = {
    collectionId: parent.id,
    expectedRevision: parent.releaseInfo.revision,
    libraryEpoch: 1,
    availabilityOnly: true,
  };
  const status = await runtime.catalogPage(intent);
  expect(status.catalog).toMatchObject({
    availabilityOnly: true,
    structureVersion: page.catalog.structureVersion,
    availableCount: 1,
  });
  expect(status.catalog.rows[0]).not.toHaveProperty('title');
  audio(videoId, 'replaced media');
  const changed = await runtime.catalogPage(intent);
  expect(changed.catalog.availableCount).toBe(0);
  expect(changed.catalog.structureVersion).toBe(page.catalog.structureVersion);
  expect(changed.catalog.rows[0].state).not.toBe('available');
  fs.unlinkSync(path.join(dir, 'tracks', videoId, 'audio.mp3'));
  expect((await runtime.catalogPage(intent)).catalog.rows[0].state).toBe(
    'missing',
  );
  await expect(
    runtime.catalogPage({ ...intent, availabilityOnly: 'true' }),
  ).rejects.toThrow();
  await expect(
    runtime.catalogPage({ ...intent, libraryEpoch: 99 }),
  ).rejects.toThrow();
  await expect(
    runtime.catalogPage({ ...intent, expectedRevision: 99 }),
  ).rejects.toThrow();
  expect(fs.readFileSync(file)).toEqual(before);
});

describe('release organization runtime', () => {
  it('projects legacy releases without inferring fields, writing data or hashing members', async () => {
    const before = fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8');
    const result = await runtime.get({ collectionId: 'release-a', limit: 1 });
    expect(result).toMatchObject({
      status: 'ok',
      libraryEpoch: 1,
      release: {
        id: 'release-a',
        revision: 0,
        sourceBacked: false,
        effective: { type: 'unknown', date: null, totalTrackCount: null },
        overrides: {},
        sourceValues: {},
        leadTrackId: null,
        memberTrackIds: ['one', 'two'],
        memberCount: 2,
        members: [{ trackId: 'one', bindingStatus: 'unverified' }],
        hasMore: true,
        nextOffset: 1,
        requiresMembershipVerification: false,
      },
    });
    expect(inspectBinding).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8')).toBe(
      before,
    );
    expect(fs.existsSync(path.join(dir, 'works.json'))).toBe(false);
  });
  it('requires explicit local initialization and preserves unrelated collection fields', async () => {
    await expect(
      save('release-a', { set: { type: 'single' } }),
    ).rejects.toMatchObject({ code: 'RELEASE_BINDINGS_REQUIRED' });
    const result = await save('release-a', {
      initializeBindings: true,
      set: { type: 'single', date: { value: '2026-10', precision: 'month' } },
      leadTrackId: 'two',
    });
    expect(result.release).toMatchObject({
      revision: 1,
      effective: {
        type: 'single',
        date: { value: '2026-10', precision: 'month' },
      },
      leadTrackId: 'two',
      requiresMembershipVerification: true,
      members: [
        { trackId: 'one', bindingStatus: 'current' },
        { trackId: 'two', bindingStatus: 'current' },
      ],
    });
    expect(loadPlaylists(dir)[0].trackIds).toEqual(['one', 'two']);
    expect(JSON.stringify(result)).not.toMatch(
      /audio-content-sha256|localMemberBindings|\.mp3|release-source/,
    );
  });
  it('does not silently rebind replacements and only accepts explicit selected reconfirmation', async () => {
    await save('release-a', { initializeBindings: true });
    audio('two', 'replacement');
    let result = await save('release-a', { set: { type: 'ep' } });
    expect(result.release.members).toEqual([
      { trackId: 'one', bindingStatus: 'current' },
      { trackId: 'two', bindingStatus: 'changed' },
    ]);
    let resolved = await runtime.resolveMembers({
      collectionId: 'release-a',
      expectedRevision: result.release.revision,
      libraryEpoch: 1,
    });
    expect(resolved.playableTrackIds).toEqual(['one']);
    result = await save('release-a', { reconfirmTrackIds: ['two'] });
    resolved = await runtime.resolveMembers({
      collectionId: 'release-a',
      expectedRevision: result.release.revision,
      libraryEpoch: 1,
    });
    expect(resolved.playableTrackIds).toEqual(['one', 'two']);
    expect(result.release.memberTrackIds).toEqual(['one', 'two']);
  });
  it('keeps missing members unresolved until explicit reconfirmation after media appears', async () => {
    fs.rmSync(path.join(dir, 'tracks', 'two'), { recursive: true });
    const initialized = await save('release-a', { initializeBindings: true });
    expect(initialized.release.members[1]).toEqual({
      trackId: 'two',
      bindingStatus: 'missing',
    });
    expect(
      loadPlaylists(dir)[0].releaseInfo.localMemberBindings.two,
    ).toBeNull();
    audio('two');
    expect(
      (await runtime.get({ collectionId: 'release-a' })).release.members[1]
        .bindingStatus,
    ).toBe('unresolved');
    await save('release-a', { reconfirmTrackIds: ['two'] });
    expect(
      (await runtime.get({ collectionId: 'release-a' })).release.members[1]
        .bindingStatus,
    ).toBe('current');
  });
  it('preserves provider facts, provenance and manual null versus removing an override', async () => {
    write([
      album({
        source,
        releaseInfo: info({
          observed: {
            type: {
              value: 'ep',
              provenance: { provider: source.platform, sourceId: source.id },
            },
            date: {
              value: { value: '2024', precision: 'year' },
              provenance: { provider: source.platform, sourceId: source.id },
            },
          },
        }),
      }),
    ]);
    let result = await save('release-a', {
      set: { type: 'single', date: null },
    });
    expect(result.release).toMatchObject({
      sourceBacked: true,
      effective: { type: 'single', date: null },
      sourceValues: { type: 'ep', date: { value: '2024', precision: 'year' } },
    });
    expect(inspectBinding).not.toHaveBeenCalled();
    result = await save('release-a', { remove: ['date'] });
    expect(result.release.effective.date).toEqual({
      value: '2024',
      precision: 'year',
    });
    await expect(
      save('release-a', { initializeBindings: true }),
    ).rejects.toMatchObject({ code: 'RELEASE_SOURCE_OWNED' });
    await expect(
      save('release-a', { reconfirmTrackIds: ['one'] }),
    ).rejects.toMatchObject({ code: 'RELEASE_SOURCE_OWNED' });
    expect(loadPlaylists(dir)[0].source).toEqual(source);
  });
  it('retains manual classifications after a trusted source reimport changes facts and membership order', async () => {
    write([album({ source })]);
    const saved = await save('release-a', { set: { type: 'single' } });
    upsertAlbum(dir, {
      source,
      trackIds: ['two', 'one'],
      releaseObservations: {
        type: {
          value: 'album',
          provenance: { provider: source.platform, sourceId: source.id },
        },
      },
    });
    const refreshed = await runtime.get({ collectionId: 'release-a' });
    expect(refreshed.release).toMatchObject({
      name: 'Release',
      memberTrackIds: ['two', 'one'],
      effective: { type: 'single' },
      sourceValues: { type: 'album' },
    });
    await expect(
      runtime.save({
        collectionId: 'release-a',
        expectedRevision: saved.release.revision,
        libraryEpoch: 1,
        set: { type: 'ep' },
      }),
    ).rejects.toMatchObject({ code: 'RELEASE_INFO_CONFLICT' });
    expect(inspectBinding).not.toHaveBeenCalled();
  });
  it('creates a persistent local Single in one write and returns all valid memberships in stable order', async () => {
    write([]);
    const first = await runtime.create({
      trackId: 'one',
      name: 'Single A',
      libraryEpoch: 1,
    });
    const second = await runtime.create({
      trackId: 'one',
      name: 'Single B',
      libraryEpoch: 1,
    });
    expect(first.release).toMatchObject({
      name: 'Single A',
      sourceBacked: false,
      effective: { type: 'single' },
      memberTrackIds: ['one'],
      leadTrackId: 'one',
    });
    expect(loadPlaylists(dir)).toHaveLength(2);
    inspectBinding.mockClear();
    expect(
      (await runtime.forTrack({ trackId: 'one' })).releases.map(
        (release) => release.id,
      ),
    ).toEqual([first.release.id, second.release.id]);
    expect(inspectBinding).toHaveBeenCalledTimes(1);
    audio('one', 'replacement');
    expect((await runtime.forTrack({ trackId: 'one' })).releases).toEqual([]);
  });
  it('paginates all valid containing releases after filtering stale members with one current-track hash per page', async () => {
    const binding = await hashAudioFile(
      path.join(dir, 'tracks', 'one', 'audio.mp3'),
    );
    write(
      Array.from({ length: 52 }, (_, index) =>
        album({
          id: `album-${index}`,
          trackIds: ['one'],
          releaseInfo: info({
            localMemberBindings: {
              one:
                index === 0 ? { ...binding, value: 'f'.repeat(64) } : binding,
            },
          }),
        }),
      ),
    );
    const first = await runtime.forTrack({
      trackId: 'one',
      offset: 0,
      limit: 50,
    });
    expect(first).toMatchObject({ hasMore: true, nextOffset: 50 });
    expect(first.releases).toHaveLength(50);
    expect(first.releases[0].id).toBe('album-1');
    expect(inspectBinding).toHaveBeenCalledTimes(1);
    const second = await runtime.forTrack({
      trackId: 'one',
      offset: 50,
      limit: 50,
    });
    expect(second).toMatchObject({
      releases: [{ id: 'album-51' }],
      hasMore: false,
      nextOffset: null,
    });
    expect(inspectBinding).toHaveBeenCalledTimes(2);
  });
  it('keeps a converted source-free playlist playable until explicit binding initialization', async () => {
    write([album({ kind: 'playlist' })]);
    setPlaylistKind(dir, 'release-a', 'album');
    expect(
      loadPlaylists(dir)[0].releaseInfo.localMemberBindings,
    ).toBeUndefined();
    const snapshot = await runtime.get({ collectionId: 'release-a' });
    expect(snapshot.release).toMatchObject({
      revision: 1,
      canInitializeBindings: true,
      requiresMembershipVerification: false,
    });
    const resolved = await runtime.resolveMembers({
      collectionId: 'release-a',
      expectedRevision: 1,
      libraryEpoch: 1,
    });
    expect(resolved.playableTrackIds).toEqual(['one', 'two']);
    expect(inspectBinding).not.toHaveBeenCalled();
  });
  it('returns a committed creation without performing a new fallible post-commit media read', async () => {
    inspectBinding.mockImplementation(async (...args) => {
      if (loadPlaylists(dir).length > 1)
        throw new Error('post-commit audio became inaccessible');
      return workRuntime.inspectBinding(...args);
    });
    const created = await runtime.create({
      trackId: 'one',
      name: 'Committed',
      libraryEpoch: 1,
    });
    expect(created.release).toMatchObject({
      name: 'Committed',
      members: [{ trackId: 'one', bindingStatus: 'current' }],
    });
    expect(notifyChanged).toHaveBeenCalledWith({
      libraryEpoch: 1,
      collectionIds: [created.release.id],
    });
  });
  it('prepares save response verification before the atomic commit', async () => {
    inspectBinding.mockImplementation(async (...args) => {
      if (loadPlaylists(dir)[0].releaseInfo)
        throw new Error('post-commit audio became inaccessible');
      return workRuntime.inspectBinding(...args);
    });
    const saved = await runtime.save({
      collectionId: 'release-a',
      expectedRevision: 0,
      libraryEpoch: 1,
      initializeBindings: true,
      set: { type: 'single' },
    });
    expect(saved.release).toMatchObject({
      revision: 1,
      effective: { type: 'single' },
      members: [
        { trackId: 'one', bindingStatus: 'current' },
        { trackId: 'two', bindingStatus: 'current' },
      ],
    });
  });
  it('projects public list membership safely without hashing or dropping raw members', async () => {
    await save('release-a', {
      initializeBindings: true,
      set: { type: 'single' },
    });
    const raw = loadPlaylists(dir);
    inspectBinding.mockClear();
    const projected = projectReleaseList(raw);
    expect(projected[0]).toMatchObject({
      trackIds: ['one', 'two'],
      resolvedRelease: { type: 'single' },
      requiresMembershipVerification: true,
      availableTrackIds: [],
    });
    expect(JSON.stringify(projected)).not.toMatch(
      /localMemberBindings|audio-content-sha256/,
    );
    expect(raw[0].releaseInfo.localMemberBindings).toBeDefined();
    expect(inspectBinding).not.toHaveBeenCalled();
  });
  it('paginates selected-release playback and checks revision and scope', async () => {
    await save('release-a', { initializeBindings: true });
    const first = await runtime.resolveMembers({
      collectionId: 'release-a',
      expectedRevision: 1,
      libraryEpoch: 1,
      limit: 1,
    });
    expect(first).toMatchObject({
      collectionId: 'release-a',
      revision: 1,
      playableTrackIds: ['one'],
      hasMore: true,
      nextOffset: 1,
    });
    expect(
      (
        await runtime.resolveMembers({
          collectionId: 'release-a',
          expectedRevision: 1,
          libraryEpoch: 1,
          offset: 1,
          limit: 1,
        })
      ).playableTrackIds,
    ).toEqual(['two']);
    await expect(
      runtime.resolveMembers({
        collectionId: 'release-a',
        expectedRevision: 0,
        libraryEpoch: 1,
      }),
    ).rejects.toMatchObject({ code: 'RELEASE_INFO_CONFLICT' });
    await expect(
      runtime.resolveMembers({
        collectionId: 'release-a',
        expectedRevision: 1,
        libraryEpoch: 0,
      }),
    ).rejects.toMatchObject({ code: 'RELEASE_SCOPE_STALE' });
  });
  it('rechecks revision after asynchronous binding work instead of overwriting membership changes', async () => {
    let changed = false;
    inspectBinding.mockImplementation(async (...args) => {
      if (!changed) {
        changed = true;
        setPlaylistTracks(dir, 'release-a', ['one', 'three']);
      }
      return workRuntime.inspectBinding(...args);
    });
    await expect(
      runtime.save({
        collectionId: 'release-a',
        expectedRevision: 0,
        libraryEpoch: 1,
        initializeBindings: true,
        set: { type: 'single' },
      }),
    ).rejects.toMatchObject({ code: 'RELEASE_INFO_CONFLICT' });
    expect(loadPlaylists(dir)[0].trackIds).toEqual(['one', 'three']);
    expect(loadPlaylists(dir)[0].releaseInfo.overrides).toEqual({});
  });
  it('shares the works lane and rejects late library epochs including A to B to A', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const admission = workRuntime.runImport({ dir }, async () => {
      await gate;
    });
    const creating = runtime.create({
      trackId: 'one',
      name: 'Late',
      libraryEpoch: 1,
    });
    await Promise.resolve();
    expect(inspectBinding).not.toHaveBeenCalled();
    release();
    await admission;
    await creating;
    scope = { ...scope, epoch: 3 };
    workRuntime.invalidate();
    runtime.invalidate();
    await expect(
      runtime.create({ trackId: 'two', name: 'Old', libraryEpoch: 1 }),
    ).rejects.toMatchObject({ code: 'RELEASE_SCOPE_STALE' });
  });
  it('fails closed on unavailable storage without initializing bindings or replacing bytes', async () => {
    const before = fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8');
    inspectBinding.mockRejectedValue(
      Object.assign(new Error('offline'), { code: 'WORKS_UNAVAILABLE' }),
    );
    await expect(
      runtime.save({
        collectionId: 'release-a',
        expectedRevision: 0,
        libraryEpoch: 1,
        initializeBindings: true,
      }),
    ).rejects.toThrow();
    expect(fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8')).toBe(
      before,
    );
  });
  it('keeps an initialized release unchanged on no-op saves and supports safe 255-bound collection IDs', async () => {
    const id = 'r'.repeat(201);
    write([album({ id })]);
    await save(id, { initializeBindings: true, set: { type: 'single' } });
    const before = fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8');
    const result = await save(id, { set: { type: 'single' } });
    expect(result.release.revision).toBe(1);
    expect(notifyChanged).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8')).toBe(
      before,
    );
  });
  it('rejects pending deletion members before accepting new release bindings', async () => {
    const binding = await hashAudioFile(
      path.join(dir, 'tracks', 'one', 'audio.mp3'),
    );
    prepareTrackDeletion(dir, { trackId: 'one', binding, expectedRevision: 0 });
    await expect(
      runtime.create({ trackId: 'one', name: 'Pending', libraryEpoch: 1 }),
    ).rejects.toMatchObject({ code: 'RELEASE_PENDING_DELETION' });
    await expect(
      runtime.save({
        collectionId: 'release-a',
        expectedRevision: 0,
        libraryEpoch: 1,
        initializeBindings: true,
      }),
    ).rejects.toMatchObject({ code: 'RELEASE_PENDING_DELETION' });
    expect(loadPlaylists(dir)).toHaveLength(1);
  });
  it('rejects an original replaced while another initialization member is hashing', async () => {
    let replaced = false;
    inspectBinding.mockImplementation(async (id, context) => {
      if (id === 'two' && !replaced) {
        replaced = true;
        audio('one', 'replacement during hash');
      }
      return workRuntime.inspectBinding(id, context);
    });
    await expect(
      runtime.save({
        collectionId: 'release-a',
        expectedRevision: 0,
        libraryEpoch: 1,
        initializeBindings: true,
      }),
    ).rejects.toMatchObject({ code: 'RELEASE_BINDING_MISMATCH' });
    expect(loadPlaylists(dir)[0].releaseInfo).toBeUndefined();
  });
  it('invalidates deferred binding reads without committing to an old epoch', async () => {
    let release, entered;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    inspectBinding.mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      return workRuntime.inspectBinding(...args);
    });
    const creating = runtime.create({
      trackId: 'one',
      name: 'Late',
      libraryEpoch: 1,
    });
    await started;
    scope = { ...scope, epoch: 2 };
    workRuntime.invalidate();
    runtime.invalidate();
    release();
    await expect(creating).rejects.toMatchObject({
      code: 'RELEASE_SCOPE_STALE',
    });
    expect(loadPlaylists(dir)).toHaveLength(1);
  });
  it('keeps empty replacement media out of bound-release playback without blocking its repair view', async () => {
    await save('release-a', { initializeBindings: true });
    audio('two', '');
    const result = await runtime.get({ collectionId: 'release-a' });
    expect(result.release.members[1]).toEqual({
      trackId: 'two',
      bindingStatus: 'changed',
    });
    expect(
      (
        await runtime.resolveMembers({
          collectionId: 'release-a',
          expectedRevision: 1,
          libraryEpoch: 1,
        })
      ).playableTrackIds,
    ).toEqual(['one']);
    await expect(
      save('release-a', { reconfirmTrackIds: ['two'] }),
    ).rejects.toMatchObject({ code: 'RELEASE_UNAVAILABLE' });
  });
  it('does not hash provider or legacy playback members and preserves missing membership', async () => {
    write([album({ source })]);
    fs.rmSync(path.join(dir, 'tracks', 'two'), { recursive: true });
    const resolved = await runtime.resolveMembers({
      collectionId: 'release-a',
      expectedRevision: 0,
      libraryEpoch: 1,
    });
    expect(resolved.playableTrackIds).toEqual(['one']);
    expect(inspectBinding).not.toHaveBeenCalled();
    expect(loadPlaylists(dir)[0].trackIds).toEqual(['one', 'two']);
  });
  it('admits only verified collection members into a synchronous Main consumer', async () => {
    write([album({ trackIds: ['one', 'two', 'three', 'missing'] })]);
    await save('release-a', { initializeBindings: true });
    audio('two', 'replacement');
    fs.rmSync(path.join(dir, 'tracks', 'three'), { recursive: true });
    audio('missing', 'late unconfirmed original');
    const consume = vi.fn(({ collection, context }) => ({
      ids: collection.trackIds,
      context,
    }));
    expect(
      await runtime.withPlayableCollection(
        { collectionId: 'release-a', libraryEpoch: 1 },
        consume,
      ),
    ).toEqual({ ids: ['one'], context: { dir, epoch: 1 } });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(loadPlaylists(dir)[0].trackIds).toEqual([
      'one',
      'two',
      'three',
      'missing',
    ]);
  });
  it('keeps legacy Main consumers hash-free and serializes admission before a queued media deletion', async () => {
    const consumed = await runtime.withPlayableCollection(
      { collectionId: 'release-a', libraryEpoch: 1 },
      ({ collection }) => collection.trackIds,
    );
    expect(consumed).toEqual(['one', 'two']);
    expect(inspectBinding).not.toHaveBeenCalled();
    await save('release-a', { initializeBindings: true });
    let release, entered;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    inspectBinding.mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      return workRuntime.inspectBinding(...args);
    });
    const admitted = runtime.withPlayableCollection(
      { collectionId: 'release-a', libraryEpoch: 1 },
      ({ collection }) => {
        expect(
          fs.existsSync(path.join(dir, 'tracks', 'one', 'audio.mp3')),
        ).toBe(true);
        return collection.trackIds;
      },
    );
    await started;
    const deleted = workRuntime.deleteTrack({ trackId: 'one' });
    release();
    expect(await admitted).toEqual(['one', 'two']);
    expect(await deleted).toBe(true);
  });
  it('rejects changed revisions and scopes before invoking a Main collection consumer', async () => {
    await save('release-a', { initializeBindings: true });
    const consume = vi.fn();
    inspectBinding.mockImplementationOnce(async (...args) => {
      setPlaylistTracks(dir, 'release-a', ['two']);
      return workRuntime.inspectBinding(...args);
    });
    await expect(
      runtime.withPlayableCollection(
        { collectionId: 'release-a', libraryEpoch: 1 },
        consume,
      ),
    ).rejects.toMatchObject({ code: 'RELEASE_INFO_CONFLICT' });
    expect(consume).not.toHaveBeenCalled();
    await expect(
      runtime.withPlayableCollection(
        { collectionId: 'release-a', libraryEpoch: 0 },
        consume,
      ),
    ).rejects.toMatchObject({ code: 'RELEASE_SCOPE_STALE' });
    expect(consume).not.toHaveBeenCalled();
  });
  it('does not invoke a Main consumer after an in-flight membership hash changes library scope', async () => {
    await save('release-a', { initializeBindings: true });
    let release, entered;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    inspectBinding.mockImplementationOnce(async (...args) => {
      entered();
      await gate;
      return workRuntime.inspectBinding(...args);
    });
    const consume = vi.fn();
    const admitted = runtime.withPlayableCollection(
      { collectionId: 'release-a', libraryEpoch: 1 },
      consume,
    );
    await started;
    scope = { ...scope, epoch: 2 };
    workRuntime.invalidate();
    runtime.invalidate();
    release();
    await expect(admitted).rejects.toMatchObject({
      code: 'RELEASE_SCOPE_STALE',
    });
    expect(consume).not.toHaveBeenCalled();
  });
  it('checks every page before a Main consumer receives a large legacy collection', async () => {
    write([
      album({
        trackIds: Array.from({ length: 101 }, (_, index) =>
          index === 0 ? 'one' : index === 100 ? 'three' : `missing-${index}`,
        ),
      }),
    ]);
    expect(
      await runtime.withPlayableCollection(
        { collectionId: 'release-a' },
        ({ collection }) => collection.trackIds,
      ),
    ).toEqual(['one', 'three']);
    expect(inspectBinding).not.toHaveBeenCalled();
  });
  it('rejects invalid saves and reconfirmation bounds without changing saved bytes', async () => {
    await save('release-a', { initializeBindings: true });
    const before = fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8');
    for (const extra of [
      { initializeBindings: 'yes' },
      { initializeBindings: true },
      { reconfirmTrackIds: ['one', 'one'] },
      { reconfirmTrackIds: ['missing'] },
      {
        reconfirmTrackIds: Array.from({ length: 101 }, (_, i) => `track-${i}`),
      },
      { set: { source: 'private' } },
      { leadTrackId: 'missing' },
    ])
      await expect(save('release-a', extra)).rejects.toThrow();
    expect(fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8')).toBe(
      before,
    );
  });
  it('rejects collection limits instead of returning a success for silently dropped creation', async () => {
    write(
      Array.from({ length: 500 }, (_, index) =>
        album({ id: `release-${index}` }),
      ),
    );
    await expect(
      runtime.create({ trackId: 'one', name: 'Overflow', libraryEpoch: 1 }),
    ).rejects.toMatchObject({ code: 'RELEASE_LIMIT_REACHED' });
    expect(loadPlaylists(dir)).toHaveLength(500);
  });
  it('preserves CAS across legacy membership changes and source-backed kind round trips', async () => {
    write([album({ source })]);
    setPlaylistTracks(dir, 'release-a', ['one']);
    expect(loadPlaylists(dir)[0].releaseInfo.revision).toBe(1);
    setPlaylistKind(dir, 'release-a', 'playlist');
    setPlaylistKind(dir, 'release-a', 'album');
    expect(loadPlaylists(dir)[0].releaseInfo.revision).toBe(3);
    await expect(
      runtime.save({
        collectionId: 'release-a',
        expectedRevision: 0,
        libraryEpoch: 1,
        set: { type: 'single' },
      }),
    ).rejects.toMatchObject({ code: 'RELEASE_INFO_CONFLICT' });
  });
  it('supports the atomic raw local-release writer without changing unrelated playlist APIs', async () => {
    const binding = await hashAudioFile(
      path.join(dir, 'tracks', 'one', 'audio.mp3'),
    );
    const result = createLocalRelease(dir, {
      name: 'Local',
      trackId: 'one',
      binding,
    });
    expect(result.playlistId).toBe(result.playlists.at(-1).id);
    expect(result.playlists.at(-1)).toMatchObject({
      name: 'Local',
      kind: 'album',
      trackIds: ['one'],
      releaseInfo: {
        overrides: { type: 'single' },
        localMemberBindings: { one: binding },
      },
    });
  });
  it.each([
    null,
    {},
    { collectionId: 'release-a', hash: 'private' },
    { collectionId: '../escape' },
    { collectionId: 'release-a', limit: 101 },
  ])('rejects invalid public read intent %j', async (input) => {
    await expect(runtime.get(input)).rejects.toMatchObject({
      code: 'RELEASE_INFO_INVALID',
    });
  });
});
