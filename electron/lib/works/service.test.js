import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createWorkOrganizationService } from './service.js';
import {
  loadWorks,
  prepareTrackDeletion,
  markTrackMediaDeleted,
  saveWorks,
} from './organization.js';

const binding = { kind: 'audio-content-sha256', value: 'a'.repeat(64) };
const other = { kind: 'audio-content-sha256', value: 'b'.repeat(64) };
let dir;
let context;
let tracks;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const setup = (overrides = {}) => {
  const callbacks = {
    getLibraryContext: () => context,
    resolveTrack: vi.fn(async (id) =>
      tracks[id] ? { binding: tracks[id], stamp: 'stamp' } : null,
    ),
    deleteMedia: vi.fn(async (id) => {
      delete tracks[id];
    }),
    cleanupReferences: vi.fn(async () => {}),
    inspectBinding: vi.fn(async (id) =>
      tracks[id]
        ? { status: 'present', binding: tracks[id] }
        : { status: 'missing' },
    ),
    ...overrides,
  };
  return { service: createWorkOrganizationService(callbacks), callbacks };
};
const createInput = {
  expectedRevision: 0,
  title: '作品',
  tracks: [
    { trackId: 'one', relationship: 'original' },
    {
      trackId: 'two',
      relationship: 'cover',
      versionInfo: { arrangement: 'acoustic', performance: 'live' },
    },
  ],
};
beforeEach(() => {
  fs.mkdirSync('.tmp', { recursive: true });
  dir = fs.mkdtempSync(path.resolve('.tmp/works-service-'));
  context = { dir, epoch: 1 };
  tracks = { one: binding, two: other };
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('library-scoped work organization service', () => {
  it('derives bindings, supports version edits/link/unlink/rename and returns only valid profiles', async () => {
    const { service } = setup();
    let doc = await service.createAndLink(createInput);
    const workId = Object.keys(doc.works)[0];
    doc = await service.saveProfile({
      expectedRevision: 1,
      trackId: 'one',
      versionInfo: { label: 'Live' },
      workLink: { workId, relationship: 'cover' },
    });
    expect(doc.trackProfiles.one.versionInfo.label).toBe('Live');
    await service.rename({ expectedRevision: 2, workId, title: 'New' });
    await service.unlink({ expectedRevision: 3, trackId: 'two' });
    expect((await service.getProfile('two')).versionInfo.performance).toBe(
      'live',
    );
    tracks.two = binding;
    expect(await service.getProfile('two')).toBeNull();
    delete tracks.one;
    expect(await service.getProfile('one')).toBeNull();
  });
  it('serializes concurrent writes per library including separate owner instances', async () => {
    const first = setup();
    const second = setup();
    const results = await Promise.allSettled([
      first.service.createAndLink(createInput),
      second.service.createAndLink(createInput),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected').reason.code,
    ).toBe('WORKS_STALE');
    expect(loadWorks(dir).revision).toBe(1);
  });
  it('rejects stale epochs and media replacement after async binding resolution', async () => {
    const gate = deferred();
    const { service } = setup({
      resolveTrack: async () => {
        await gate.promise;
        return { binding };
      },
    });
    const pending = service.createAndLink(createInput);
    await Promise.resolve();
    context = { ...context, epoch: 2 };
    gate.resolve();
    await expect(pending).rejects.toMatchObject({ code: 'WORKS_STALE' });
    expect(loadWorks(dir).revision).toBe(0);
    let reads = 0;
    const changed = setup({
      resolveTrack: async () => ({ binding: ++reads === 1 ? binding : other }),
    });
    await expect(
      changed.service.saveProfile({
        expectedRevision: 0,
        trackId: 'one',
        versionInfo: {},
      }),
    ).rejects.toMatchObject({ code: 'WORKS_BINDING_MISMATCH' });
  });
  it('invalidates work in flight and re-reads a switched-back library', async () => {
    const gate = deferred();
    const { service } = setup({
      resolveTrack: async () => {
        await gate.promise;
        return { binding };
      },
    });
    const pending = service.getProfile('one');
    await Promise.resolve();
    service.invalidate();
    gate.resolve();
    await expect(pending).rejects.toMatchObject({ code: 'WORKS_STALE' });
    const regular = setup();
    await regular.service.createAndLink(createInput);
    context = { dir: path.join(dir, 'other'), epoch: 2 };
    expect(await regular.service.getProfile('one')).toBeNull();
    context = { dir, epoch: 3 };
    expect((await regular.service.getProfile('one')).workLink).toBeDefined();
  });
  it.each([
    { ...createInput, binding },
    { ...createInput, path: 'private' },
    { ...createInput, tracks: [{ trackId: 'one', binding }] },
    { ...createInput, tracks: [] },
    { ...createInput, tracks: null },
  ])(
    'rejects arbitrary private fields or invalid commands %#',
    async (input) => {
      await expect(setup().service.createAndLink(input)).rejects.toThrow();
      expect(loadWorks(dir).revision).toBe(0);
    },
  );
  it('rejects missing canonical tracks and malformed boundaries', async () => {
    delete tracks.one;
    await expect(
      setup().service.createAndLink(createInput),
    ).rejects.toMatchObject({ code: 'WORKS_NOT_FOUND' });
    expect(() => createWorkOrganizationService({})).toThrow();
    const { service } = setup();
    await expect(
      service.saveProfile({
        expectedRevision: 0,
        trackId: 'one',
        hash: binding.value,
      }),
    ).rejects.toThrow();
    await expect(
      service.unlink({
        expectedRevision: 0,
        trackId: 'one',
        url: 'https://example.test',
      }),
    ).rejects.toThrow();
    await expect(
      service.rename({
        expectedRevision: 0,
        workId: 'x',
        title: 'x',
        private: true,
      }),
    ).rejects.toThrow();
  });
});

describe('explicit deletion and startup reconciliation', () => {
  it('recovers prepared receipt when phase persistence fails after successful media deletion', async () => {
    const { service, callbacks } = setup();
    await service.createAndLink(createInput);
    const realSync = fs.fsyncSync;
    let writes = 0;
    const sync = vi.spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
      if (++writes === 2) throw new Error('phase flush failed');
      return realSync(fd);
    });
    await expect(
      service.deleteTrack({ expectedRevision: 1, trackId: 'one' }),
    ).rejects.toThrow('phase flush failed');
    sync.mockRestore();
    expect(tracks.one).toBeUndefined();
    expect(Object.values(loadWorks(dir).pendingTrackDeletions)[0].phase).toBe(
      'prepared',
    );
    await service.reconcile();
    expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
    expect(callbacks.deleteMedia).toHaveBeenCalledOnce();
  });
  it('durably prepares before media deletion and completes bound cleanup', async () => {
    const { service, callbacks } = setup();
    await service.createAndLink(createInput);
    callbacks.deleteMedia.mockImplementation(async (id, observed) => {
      const receipt = Object.values(loadWorks(dir).pendingTrackDeletions)[0];
      expect(receipt).toMatchObject({
        trackId: id,
        binding: observed,
        phase: 'prepared',
      });
      delete tracks[id];
    });
    callbacks.cleanupReferences.mockImplementation(async () => {
      expect(Object.values(loadWorks(dir).pendingTrackDeletions)[0].phase).toBe(
        'media-deleted',
      );
    });
    const doc = await service.deleteTrack({
      expectedRevision: 1,
      trackId: 'one',
    });
    expect(doc.revision).toBe(4);
    expect(doc.trackProfiles.one).toBeUndefined();
    expect(doc.pendingTrackDeletions).toEqual({});
    expect(callbacks.cleanupReferences).toHaveBeenCalledWith(
      'one',
      binding,
      expect.objectContaining({ dir, epoch: 1 }),
    );
  });
  it('never deletes media if receipt persistence fails', async () => {
    const { service, callbacks } = setup();
    await service.createAndLink(createInput);
    vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
      throw new Error('disk');
    });
    await expect(
      service.deleteTrack({ expectedRevision: 1, trackId: 'one' }),
    ).rejects.toThrow('disk');
    expect(callbacks.deleteMedia).not.toHaveBeenCalled();
    expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
  });
  it('retains receipt after media deletion/metadata failure and retries idempotently', async () => {
    const { service, callbacks } = setup();
    await service.createAndLink(createInput);
    callbacks.cleanupReferences.mockRejectedValueOnce(
      new Error('sidecar unavailable'),
    );
    await expect(
      service.deleteTrack({ expectedRevision: 1, trackId: 'one' }),
    ).rejects.toThrow('sidecar unavailable');
    expect(Object.values(loadWorks(dir).pendingTrackDeletions)[0].phase).toBe(
      'media-deleted',
    );
    expect(await service.getProfile('one')).toBeNull();
    await service.reconcile();
    await service.reconcile();
    expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
    expect(callbacks.deleteMedia).toHaveBeenCalledOnce();
    expect(callbacks.cleanupReferences).toHaveBeenCalledTimes(2);
  });
  it('withdraws a prepared receipt while the same media exists without retrying deletion', async () => {
    const { service, callbacks } = setup();
    await service.createAndLink(createInput);
    prepareTrackDeletion(dir, { expectedRevision: 1, trackId: 'one', binding });
    await service.reconcile();
    expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
    expect(loadWorks(dir).trackProfiles.one).toBeDefined();
    expect(callbacks.deleteMedia).not.toHaveBeenCalled();
    expect(callbacks.cleanupReferences).not.toHaveBeenCalled();
  });
  it('recovers a crash between media delete and phase write, deferring unavailable disks', async () => {
    const { service, callbacks } = setup();
    await service.createAndLink(createInput);
    prepareTrackDeletion(dir, { expectedRevision: 1, trackId: 'one', binding });
    delete tracks.one;
    callbacks.inspectBinding.mockResolvedValueOnce({ status: 'unavailable' });
    await service.reconcile();
    expect(Object.keys(loadWorks(dir).pendingTrackDeletions)).toHaveLength(1);
    await service.reconcile();
    expect(loadWorks(dir).trackProfiles.one).toBeUndefined();
    expect(callbacks.deleteMedia).not.toHaveBeenCalled();
  });
  it('never deletes replacement media or its new profile during old-receipt cleanup', async () => {
    const { service, callbacks } = setup();
    await service.createAndLink(createInput);
    let doc = prepareTrackDeletion(dir, {
      expectedRevision: 1,
      trackId: 'one',
      binding,
    });
    const operationId = Object.keys(doc.pendingTrackDeletions)[0];
    doc = markTrackMediaDeleted(dir, { expectedRevision: 2, operationId });
    doc.trackProfiles.one.binding = other;
    doc.revision++;
    saveWorks(dir, doc, 3);
    tracks.one = other;
    await service.reconcile({ trackId: 'one' });
    expect(loadWorks(dir).trackProfiles.one.binding).toEqual(other);
    expect(callbacks.deleteMedia).not.toHaveBeenCalled();
    expect(callbacks.cleanupReferences).toHaveBeenCalledWith(
      'one',
      binding,
      expect.anything(),
    );
  });
  it('retains prepared receipt on media failure and rejects deletion without injected boundary', async () => {
    const { service } = setup({
      deleteMedia: async () => {
        throw new Error('busy');
      },
    });
    await expect(
      service.deleteTrack({ expectedRevision: 0, trackId: 'one' }),
    ).rejects.toThrow('busy');
    expect(Object.values(loadWorks(dir).pendingTrackDeletions)[0].phase).toBe(
      'prepared',
    );
    const { service: disabled } = setup({ deleteMedia: undefined });
    await expect(
      disabled.deleteTrack({ expectedRevision: 1, trackId: 'two' }),
    ).rejects.toThrow();
  });
});
