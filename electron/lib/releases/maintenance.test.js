import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPlaylists, fillPlaylistReleaseMetadata } from '../playlists.js';
import { createReleaseMetadataMaintenance } from './maintenance.js';

const source = { platform: 'yt-music', id: 'OLAK5uy_test' };
const fact = (value, origin = source) => ({
  value,
  provenance: { provider: origin.platform, sourceId: origin.id },
});
const year = (value = '2026') => ({ value, precision: 'year' });
const album = (id, extra = {}) => ({
  id,
  name: id,
  kind: 'album',
  source,
  trackIds: ['song'],
  addedAt: {},
  ...extra,
});
const info = (observed = {}, overrides = {}) => ({
  revision: 2,
  observed,
  overrides,
});
let dir;
const read = () =>
  JSON.parse(fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8'));
const write = (playlists) =>
  fs.writeFileSync(
    path.join(dir, 'playlists.json'),
    JSON.stringify({ version: 3, playlists }),
  );
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-release-maintenance-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function setup(options = {}) {
  let scope = { dir, epoch: 1 };
  const notifyChanged = vi.fn();
  const onProgress = vi.fn();
  const requireProvider = vi.fn();
  const resolveRelease = vi.fn(async () => ({ type: 'ep', date: year() }));
  const service = createReleaseMetadataMaintenance({
    getDirectory: () => scope,
    notifyChanged,
    onProgress,
    requireProvider,
    resolveRelease,
    ...options,
  });
  return {
    service,
    resolveRelease,
    notifyChanged,
    onProgress,
    requireProvider,
    changeScope: (next) => {
      scope = next;
    },
  };
}

describe('release metadata fill storage', () => {
  it('retains unknown top-level document fields during a v3 patch', () => {
    const document = {
      version: 3,
      playlists: [album('one')],
      futureLocalField: { keep: true },
    };
    fs.writeFileSync(
      path.join(dir, 'playlists.json'),
      JSON.stringify(document),
    );
    fillPlaylistReleaseMetadata(dir, [
      { collectionId: 'one', source, observed: { type: fact('ep') } },
    ]);
    expect(read().futureLocalField).toEqual(document.futureLocalField);
  });
  it('patches only absent facts while retaining raw fields, manual choices, precise dates and two Singles', () => {
    const single = album('single', {
      source: undefined,
      releaseInfo: info(
        {},
        { type: 'single', date: { value: '2026-07-25', precision: 'day' } },
      ),
    });
    const original = [
      album('missing', { description: undefined, custom: 'preserve' }),
      album('manual', {
        releaseInfo: info({}, { type: 'unknown', date: null }),
      }),
      album('precise', {
        releaseInfo: info({
          type: fact('album'),
          date: fact({ value: '2024-02-01', precision: 'day' }),
        }),
      }),
      single,
      { ...single, id: 'acoustic' },
    ];
    write(original);
    const updates = original.map((a) => ({
      collectionId: a.id,
      source,
      observed: { type: fact('ep'), date: fact(year()) },
    }));
    expect(fillPlaylistReleaseMetadata(dir, updates)).toEqual(['missing']);
    const result = read().playlists;
    expect(result.slice(1)).toEqual(
      JSON.parse(JSON.stringify(original.slice(1))),
    );
    expect(result[0]).toEqual({
      ...JSON.parse(JSON.stringify(original[0])),
      releaseInfo: {
        revision: 1,
        observed: { type: fact('ep'), date: fact(year()) },
        overrides: {},
      },
    });
    const bytes = fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8');
    expect(fillPlaylistReleaseMetadata(dir, updates)).toEqual([]);
    expect(fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8')).toBe(
      bytes,
    );
  });
  it('rejects mismatched sources and never recreates a removed collection', () => {
    write([album('a')]);
    expect(
      fillPlaylistReleaseMetadata(dir, [
        {
          collectionId: 'a',
          source: { ...source, id: 'OLAK5uy_other' },
          observed: { type: fact('ep') },
        },
        { collectionId: 'deleted', source, observed: { type: fact('ep') } },
      ]),
    ).toEqual([]);
    expect(read().playlists).toEqual([album('a')]);
  });
  it('backs up a legacy document before a normal schema migration', () => {
    fs.writeFileSync(
      path.join(dir, 'playlists.json'),
      JSON.stringify({ version: 2, playlists: [album('a')] }),
    );
    expect(
      fillPlaylistReleaseMetadata(dir, [
        { collectionId: 'a', source, observed: { type: fact('ep') } },
      ]),
    ).toEqual(['a']);
    expect(read().version).toBe(4);
    expect(
      fs
        .readdirSync(dir)
        .some((name) => name.startsWith('playlists.json.backup-v2-')),
    ).toBe(true);
  });
});

describe('release metadata maintenance', () => {
  it('keeps saved facts when publishing fails and continues after a provider failure', async () => {
    write([
      album('one'),
      album('two', { source: { ...source, id: 'OLAK5uy_two' } }),
    ]);
    const recordFailure = vi.fn();
    const current = setup({
      notifyChanged: () => {
        throw Error('closed window');
      },
      onProgress: () => {
        throw Error('closed window');
      },
      recordFailure,
    });
    current.resolveRelease.mockRejectedValueOnce(
      new Error('private provider failure'),
    );
    const result = await current.service.refreshFromSources();
    expect(result).toMatchObject({
      status: 'complete',
      completed: 2,
      updated: 1,
      unresolved: 1,
    });
    expect(
      loadPlaylists(dir).find((a) => a.id === 'two').releaseInfo.observed.type
        .value,
    ).toBe('ep');
    expect(recordFailure).toHaveBeenCalledOnce();
  });
  it('retries offline replay after a transient write failure without modifying the original bytes', async () => {
    write([
      album('saved', { releaseInfo: info({ type: fact('ep') }) }),
      album('old'),
    ]);
    const { service } = setup();
    const before = fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8');
    const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw Error('temporary lock');
    });
    try {
      await expect(service.organizeSaved()).rejects.toThrow('temporary lock');
    } finally {
      rename.mockRestore();
    }
    expect(fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8')).toBe(
      before,
    );
    expect(await service.organizeSaved()).toEqual({ updated: 1 });
  });
  it('does not restore a collection removed during source lookup or diagnose expected gate changes', async () => {
    write([album('one')]);
    const recordFailure = vi.fn();
    const current = setup({ recordFailure });
    current.resolveRelease.mockImplementationOnce(async () => {
      write([]);
      return { type: 'ep', date: year() };
    });
    expect(await current.service.refreshFromSources()).toMatchObject({
      status: 'complete',
      updated: 0,
    });
    expect(loadPlaylists(dir)).toEqual([]);
    write([album('one')]);
    current.resolveRelease.mockImplementationOnce(async () => {
      current.requireProvider.mockImplementation(() => {
        throw Error('disabled');
      });
      return { type: 'ep' };
    });
    expect(await current.service.refreshFromSources()).toMatchObject({
      status: 'interrupted',
      updated: 0,
    });
    expect(recordFailure).not.toHaveBeenCalled();
  });
  it('reuses only unambiguous saved facts from the identical source, offline and once per session', async () => {
    write([
      album('saved', {
        releaseInfo: info({ type: fact('ep'), date: fact(year()) }),
      }),
      album('old'),
      album('other', { source: { ...source, id: 'OLAK5uy_other' } }),
      album('local', { source: undefined }),
    ]);
    const { service, resolveRelease, requireProvider, notifyChanged } = setup();
    expect(await service.organizeSaved()).toEqual({ updated: 1 });
    expect(
      loadPlaylists(dir).find((a) => a.id === 'old').releaseInfo.observed,
    ).toEqual({ type: fact('ep'), date: fact(year()) });
    expect(await service.organizeSaved()).toEqual({ updated: 0 });
    expect(resolveRelease).not.toHaveBeenCalled();
    expect(requireProvider).not.toHaveBeenCalled();
    expect(notifyChanged).toHaveBeenCalledWith({
      libraryEpoch: 1,
      collectionIds: ['old'],
    });
  });
  it('leaves ambiguous saved fields and unproven track years untouched', async () => {
    write([
      album('one', {
        releaseInfo: info({ type: fact('ep'), date: fact(year('2024')) }),
      }),
      album('two', {
        releaseInfo: info({ type: fact('album'), date: fact(year()) }),
      }),
      album('old'),
    ]);
    const before = fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8');
    expect(await setup().service.organizeSaved()).toEqual({ updated: 0 });
    expect(fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8')).toBe(
      before,
    );
  });
  it('queries only missing supported source releases, fills dates independently, and deduplicates a source', async () => {
    write([
      album('one'),
      album('two', { releaseInfo: info({ type: fact('album') }) }),
      album('full', {
        source: { ...source, id: 'OLAK5uy_full' },
        releaseInfo: info({
          type: fact('album', { ...source, id: 'OLAK5uy_full' }),
          date: fact(year('2024'), { ...source, id: 'OLAK5uy_full' }),
        }),
      }),
      album('manual', {
        source: { ...source, id: 'OLAK5uy_manual' },
        releaseInfo: info({}, { type: 'unknown', date: null }),
      }),
      album('unsupported', { source: { platform: 'youtube', id: 'PLtest' } }),
      album('single', {
        source: undefined,
        releaseInfo: info({}, { type: 'single' }),
      }),
    ]);
    const { service, resolveRelease, onProgress } = setup();
    const result = await service.refreshFromSources();
    expect(result).toMatchObject({
      status: 'complete',
      total: 1,
      completed: 1,
      updated: 2,
      unresolved: 0,
    });
    expect(resolveRelease).toHaveBeenCalledTimes(1);
    expect(
      loadPlaylists(dir).find((a) => a.id === 'two').releaseInfo.observed.type
        .value,
    ).toBe('album');
    expect(onProgress).toHaveBeenLastCalledWith(result);
  });
  it('retains prior updates when a source has no usable facts', async () => {
    write([
      album('one'),
      album('two', { source: { ...source, id: 'OLAK5uy_two' } }),
    ]);
    const { service, resolveRelease } = setup();
    resolveRelease
      .mockResolvedValueOnce({ type: 'ep', date: year() })
      .mockResolvedValueOnce({});
    expect(await service.refreshFromSources()).toMatchObject({
      updated: 1,
      unresolved: 1,
      completed: 2,
    });
  });
  it('rereads manual edits and membership at commit instead of restoring stale data', async () => {
    write([album('one')]);
    const { service, resolveRelease } = setup();
    resolveRelease.mockImplementationOnce(async () => {
      write([
        album('one', {
          name: 'Edited',
          trackIds: ['new'],
          releaseInfo: info({}, { type: 'single' }),
        }),
      ]);
      return { type: 'ep', date: year() };
    });
    expect(await service.refreshFromSources()).toMatchObject({ updated: 1 });
    expect(loadPlaylists(dir)[0]).toMatchObject({
      name: 'Edited',
      trackIds: ['new'],
      releaseInfo: {
        overrides: { type: 'single' },
        observed: { date: fact(year()) },
      },
    });
  });
  it('stops commits after cancellation, changing library, or disabling the gate', async () => {
    for (const reason of ['cancel', 'scope', 'gate']) {
      write([
        album('one'),
        album('two', { source: { ...source, id: 'OLAK5uy_two' } }),
      ]);
      const current = setup();
      const bytes = fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8');
      current.resolveRelease.mockImplementationOnce(async () => {
        if (reason === 'cancel') current.service.cancel();
        if (reason === 'scope') current.changeScope({ dir, epoch: 2 });
        if (reason === 'gate')
          current.requireProvider.mockImplementation(() => {
            throw Error('disabled');
          });
        return { type: 'ep' };
      });
      const result = await current.service.refreshFromSources();
      expect(result.status).toBe(
        reason === 'cancel' ? 'cancelled' : 'interrupted',
      );
      expect(current.resolveRelease).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync(path.join(dir, 'playlists.json'), 'utf8')).toBe(
        bytes,
      );
    }
  });
  it('shares an active refresh and keeps network outside the mutation lane', async () => {
    write([album('one')]);
    let release;
    const { service, resolveRelease } = setup();
    resolveRelease.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = service.refreshFromSources();
    const second = service.refreshFromSources();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(await service.organizeSaved()).toEqual({ updated: 0 });
    release({ type: 'ep', date: year() });
    expect(await first).toEqual(await second);
    expect(resolveRelease).toHaveBeenCalledTimes(1);
  });
});
