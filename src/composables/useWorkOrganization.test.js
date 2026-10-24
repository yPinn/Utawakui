import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const versionInfo = {
  arrangement: 'unspecified',
  performance: 'unspecified',
  vocal: 'unspecified',
  label: '',
  note: '',
};
const snapshot = (id = 'a', extra = {}) => ({
  status: 'ok',
  trackId: id,
  libraryEpoch: 1,
  revision: 1,
  bindingStatus: 'unlinked',
  work: null,
  relationship: 'unknown',
  versionInfo,
  relatedVersions: [],
  ...extra,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let owner;
let bridge;
let changed;

beforeEach(async () => {
  vi.resetModules();
  bridge = {
    getWorkOrganization: vi.fn(({ trackId }) =>
      Promise.resolve(snapshot(trackId)),
    ),
    searchWorkOrganization: vi.fn(() =>
      Promise.resolve({
        status: 'ok',
        libraryEpoch: 1,
        revision: 1,
        works: [],
        tracks: [],
      }),
    ),
    saveWorkOrganization: vi.fn(() =>
      Promise.resolve(snapshot('a', { revision: 2 })),
    ),
    renameWork: vi.fn(() =>
      Promise.resolve({ status: 'ok', libraryEpoch: 1, revision: 2 }),
    ),
    onWorkOrganizationChanged: vi.fn((callback) => {
      changed = callback;
      return vi.fn();
    }),
  };
  vi.stubGlobal('window', { Utawakui: bridge });
  owner = (await import('./useWorkOrganization.js')).useWorkOrganization();
  owner.initialize();
});
afterEach(() => {
  owner?.dispose();
  vi.unstubAllGlobals();
});

describe('shared works and version editing owner', () => {
  it('keeps source binding and drafts intact when the selected target media changed', async () => {
    await owner.open({ id: 'a', title: '夜航' });
    owner.select({ kind: 'track', targetTrackId: 'b' });
    owner.updateVersion('note', '保留草稿');
    bridge.saveWorkOrganization.mockResolvedValueOnce({
      status: 'target-changed',
    });
    expect(await owner.save()).toBe(false);
    expect(owner.state.snapshot.bindingStatus).toBe('unlinked');
    expect(owner.state.error).toContain('所選曲目');
    expect(owner.state.versionInfo.note).toBe('保留草稿');
    expect(owner.state.selection).toEqual({
      kind: 'track',
      targetTrackId: 'b',
    });
    expect(owner.state.needsReload).toBe(false);
  });
  it('searches by title on open without writing or dirtying the draft', async () => {
    await owner.open({ id: 'a', title: '夜航 Acoustic Ver.' });
    expect(bridge.searchWorkOrganization).toHaveBeenCalledWith({
      trackId: 'a',
      query: '夜航 Acoustic Ver.',
      limit: 30,
    });
    expect(owner.state.searched).toBe(true);
    expect(owner.isDirty.value).toBe(false);
    expect(bridge.saveWorkOrganization).not.toHaveBeenCalled();
    expect(bridge.renameWork).not.toHaveBeenCalled();
    owner.updateQuery('另一首');
    expect(owner.state.searched).toBe(false);
  });
  it('keeps editing available after an automatic search failure and ignores its late result after switching tracks', async () => {
    bridge.searchWorkOrganization.mockRejectedValueOnce(new Error('private'));
    expect(await owner.open({ id: 'a', title: '夜航' })).toBe(true);
    expect(owner.state.snapshot.trackId).toBe('a');
    expect(owner.state.searchError).not.toBe('');
    expect(owner.state.error).toBe('');
    const pending = deferred();
    bridge.searchWorkOrganization.mockReturnValueOnce(pending.promise);
    const first = owner.open({ id: 'a', title: '舊歌' });
    await Promise.resolve();
    await Promise.resolve();
    await owner.open({ id: 'b', title: '新歌' });
    pending.resolve({
      status: 'ok',
      libraryEpoch: 1,
      works: [{ id: 'old', title: '舊歌' }],
      tracks: [],
    });
    await first;
    expect(owner.state.track.id).toBe('b');
    expect(owner.state.query).toBe('新歌');
    expect(owner.state.results.works).toEqual([]);
    expect(owner.state.searched).toBe(true);
  });
  it('restores a link without losing its relationship or independent version draft', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot('a', { work: { id: 'w', title: '歌' }, relationship: 'cover' }),
    );
    await owner.open({ id: 'a' });
    owner.select({ kind: 'none' });
    owner.select({ kind: 'keep' });
    expect(owner.state.relationship).toBe('cover');
    expect(owner.isDirty.value).toBe(false);
    owner.setRelationship('original');
    owner.updateVersion('note', '保留備註');
    owner.select({ kind: 'none' });
    owner.select({ kind: 'keep' });
    await owner.save();
    expect(bridge.saveWorkOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { kind: 'keep' },
        relationship: 'original',
        versionInfo: { ...versionInfo, note: '保留備註' },
      }),
    );
  });
  it('retries title suggestions after a failed read and invalidates earlier search responses on reload', async () => {
    bridge.getWorkOrganization.mockRejectedValueOnce(new Error('private'));
    await owner.open({ id: 'a', title: '夜航' });
    expect(bridge.searchWorkOrganization).not.toHaveBeenCalled();
    expect(await owner.reload()).toBe(true);
    expect(owner.state.query).toBe('夜航');
    expect(owner.state.searched).toBe(true);
    const pending = deferred();
    bridge.searchWorkOrganization.mockReturnValueOnce(pending.promise);
    const old = owner.search('夜航');
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot('a', { revision: 2 }),
    );
    await owner.reload();
    pending.resolve({
      status: 'ok',
      libraryEpoch: 1,
      revision: 1,
      works: [{ id: 'old', title: 'old' }],
      tracks: [],
    });
    await old;
    expect(owner.state.snapshot.revision).toBe(2);
    expect(owner.state.results.works).toEqual([]);
    expect(owner.state.searched).toBe(true);
  });
  it('guards commands without a selected track and unsupported selection fields', async () => {
    expect(await owner.open(null)).toBe(false);
    expect(await owner.open({ id: 123 })).toBe(false);
    expect(await owner.reload()).toBe(false);
    expect(await owner.search('')).toBe(false);
    expect(await owner.save()).toBe(false);
    expect(await owner.loadMore()).toBe(false);
    owner.select(null);
    owner.updateVersion('unsupported', 'bad');
    changed({ libraryEpoch: 1, revision: 2 });
    owner.initialize();
    expect(bridge.onWorkOrganizationChanged).toHaveBeenCalledOnce();
  });
  it.each(['stale', 'not-found', 'invalid-intent', 'binding-mismatch'])(
    'handles expected read outcome %s without exposing private errors',
    async (status) => {
      bridge.getWorkOrganization.mockResolvedValueOnce({ status });
      expect(await owner.open({ id: 'a' })).toBe(false);
      if (status === 'stale') expect(owner.state.track).toBe(null);
      else expect(owner.state.error).not.toBe('');
    },
  );
  it('reports a failed read and supports retrying in the same editor', async () => {
    bridge.getWorkOrganization.mockRejectedValueOnce(new Error('private'));
    await owner.open({ id: 'a' });
    expect(owner.state.error).not.toContain('private');
    expect(await owner.reload()).toBe(true);
    expect(owner.state.error).toBe('');
  });
  it('closes on a different library read and ignores old same-library events', async () => {
    await owner.open({ id: 'a' });
    changed({ libraryEpoch: 1, revision: 1 });
    expect(bridge.getWorkOrganization).toHaveBeenCalledOnce();
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot('a', { libraryEpoch: 2 }),
    );
    await owner.reload();
    expect(owner.state.track).toBe(null);
  });
  it.each(['conflict', 'binding-mismatch', 'invalid-intent', 'stale'])(
    'handles expected save outcome %s and preserves local version input',
    async (status) => {
      await owner.open({ id: 'a' });
      owner.updateVersion('note', 'draft');
      bridge.saveWorkOrganization.mockResolvedValueOnce({ status });
      expect(await owner.save()).toBe(false);
      if (status === 'stale') expect(owner.state.track).toBe(null);
      else expect(owner.state.versionInfo.note).toBe('draft');
      if (status === 'binding-mismatch')
        expect(owner.state.snapshot.bindingStatus).toBe('changed');
    },
  );
  it('handles search errors, null query and scope changes without changing the draft revision', async () => {
    await owner.open({ id: 'a' });
    bridge.searchWorkOrganization.mockRejectedValueOnce(new Error('private'));
    expect(await owner.search(null)).toBe(false);
    expect(owner.state.query).toBe('');
    expect(owner.state.searchError).not.toContain('private');
    bridge.searchWorkOrganization.mockResolvedValueOnce({
      status: 'invalid-intent',
    });
    expect(await owner.search('')).toBe(false);
    bridge.searchWorkOrganization.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      revision: 99,
    });
    expect(await owner.search('works')).toBe(true);
    expect(owner.state.snapshot.revision).toBe(1);
    bridge.searchWorkOrganization.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 2,
    });
    expect(await owner.search('works')).toBe(false);
    expect(owner.state.track).toBe(null);
  });
  it('refreshes clean editors on a new organization revision', async () => {
    await owner.open({ id: 'a' });
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot('a', { revision: 2 }),
    );
    changed({ libraryEpoch: 1, revision: 2 });
    await Promise.resolve();
    expect(owner.state.snapshot.revision).toBe(2);
  });
  it('keeps the internal work name read-only while saving the current version', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot('a', { work: { id: 'w', title: 'Legacy group title' } }),
    );
    await owner.open({
      id: 'a',
      title: 'Song feat. Guest',
      artist: 'Singer & Guest',
    });
    expect(owner.setWorkTitle).toBeUndefined();
    expect(owner.rename).toBeUndefined();
    expect(owner.state).not.toHaveProperty('workTitle');
    owner.updateVersion('label', 'Live');
    bridge.saveWorkOrganization.mockResolvedValueOnce(
      snapshot('a', {
        revision: 2,
        work: { id: 'w', title: 'Legacy group title' },
        versionInfo: { ...versionInfo, label: 'Live' },
      }),
    );
    expect(await owner.save()).toBe(true);
    expect(owner.state.track).toMatchObject({
      title: 'Song feat. Guest',
      artist: 'Singer & Guest',
    });
    expect(owner.state.snapshot.work.title).toBe('Legacy group title');
    expect(owner.isDirty.value).toBe(false);
    expect(bridge.renameWork).not.toHaveBeenCalled();
  });
  it.each(['epoch', 'revision', 'error', 'conflict'])(
    'handles invalidated pagination: %s',
    async (kind) => {
      bridge.getWorkOrganization.mockResolvedValueOnce(
        snapshot('a', {
          hasMore: true,
          nextOffset: 100,
          relatedVersions: [{ trackId: 'b' }],
        }),
      );
      await owner.open({ id: 'a' });
      if (kind === 'error')
        bridge.getWorkOrganization.mockRejectedValueOnce(new Error('private'));
      else
        bridge.getWorkOrganization.mockResolvedValueOnce(
          kind === 'conflict'
            ? { status: 'conflict' }
            : snapshot(
                'a',
                kind === 'epoch' ? { libraryEpoch: 2 } : { revision: 3 },
              ),
        );
      expect(await owner.loadMore()).toBe(false);
      if (kind === 'epoch') expect(owner.state.track).toBe(null);
      else {
        expect(owner.state.snapshot.relatedVersions).toEqual([
          { trackId: 'b' },
        ]);
        expect(owner.state.error).not.toContain('private');
      }
    },
  );
  it('keeps a newer event that arrives while a save is in flight', async () => {
    await owner.open({ id: 'a' });
    owner.updateVersion('note', 'draft');
    const result = deferred();
    bridge.saveWorkOrganization.mockReturnValueOnce(result.promise);
    const saving = owner.save();
    changed({ libraryEpoch: 1, revision: 3 });
    result.resolve(
      snapshot('a', {
        revision: 2,
        versionInfo: { ...versionInfo, note: 'draft' },
      }),
    );
    await saving;
    expect(owner.state.needsReload).toBe(true);
  });
  it('shares one editor and saves version information without a work or media operation', async () => {
    const other = (
      await import('./useWorkOrganization.js')
    ).useWorkOrganization();
    await owner.open({ id: 'a', title: 'RASEN' });
    owner.updateVersion('arrangement', 'acoustic');
    owner.updateVersion('performance', 'live');
    owner.updateVersion('label', '翻唱🎵');
    expect(other.state.track.id).toBe('a');
    await owner.save();
    expect(bridge.saveWorkOrganization).toHaveBeenCalledWith({
      trackId: 'a',
      expectedRevision: 1,
      libraryEpoch: 1,
      selection: { kind: 'keep' },
      relationship: 'unknown',
      versionInfo: {
        ...versionInfo,
        arrangement: 'acoustic',
        performance: 'live',
        label: '翻唱🎵',
      },
    });
    expect(owner.isDirty.value).toBe(false);
  });
  it('ignores late opens and searches after changing track or closing', async () => {
    const first = deferred();
    bridge.getWorkOrganization.mockImplementationOnce(() => first.promise);
    const opening = owner.open({ id: 'a' });
    await owner.open({ id: 'b' });
    first.resolve(snapshot('a'));
    await opening;
    expect(owner.state.track.id).toBe('b');
    const result = deferred();
    bridge.searchWorkOrganization.mockReturnValueOnce(result.promise);
    const searching = owner.search('RASEN');
    owner.dispose();
    result.resolve({
      status: 'ok',
      libraryEpoch: 1,
      works: [{ id: 'wrong' }],
      tracks: [],
    });
    await searching;
    expect(owner.state.track).toBe(null);
    expect(owner.state.results.works).toEqual([]);
  });
  it('retains conflict drafts and reloads only on explicit recovery', async () => {
    await owner.open({ id: 'a' });
    owner.updateVersion('note', 'retain me');
    bridge.saveWorkOrganization.mockResolvedValueOnce({ status: 'conflict' });
    expect(await owner.save()).toBe(false);
    expect(owner.state.versionInfo.note).toBe('retain me');
    expect(owner.state.needsReload).toBe(true);
    await owner.reload();
    expect(owner.state.versionInfo.note).toBe('');
  });
  it('guards pending duplicate saves and ignores a save after the library scope changes', async () => {
    await owner.open({ id: 'a' });
    owner.select({ kind: 'new', title: '作品' });
    const result = deferred();
    bridge.saveWorkOrganization.mockReturnValueOnce(result.promise);
    const saving = owner.save();
    await owner.save();
    expect(bridge.saveWorkOrganization).toHaveBeenCalledOnce();
    changed({ libraryEpoch: 2, revision: 0 });
    result.resolve(snapshot());
    await saving;
    expect(owner.state.track).toBe(null);
    expect(owner.state.saving).toBe(false);
  });
  it('preserves versions when unlinking and explicitly reconfirms a changed binding', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot('a', {
        bindingStatus: 'changed',
        work: { id: 'work-1', title: '作品' },
        versionInfo: { ...versionInfo, label: 'Live' },
      }),
    );
    await owner.open({ id: 'a' });
    owner.select({ kind: 'none' });
    expect(await owner.save()).toBe(false);
    await owner.save({ reconfirm: true });
    expect(bridge.saveWorkOrganization.mock.calls[0][0]).toMatchObject({
      reconfirm: true,
      selection: { kind: 'none' },
      versionInfo: { ...versionInfo, label: 'Live' },
    });
  });
  it('keeps local drafts when an external same-library update arrives', async () => {
    await owner.open({ id: 'a' });
    owner.updateVersion('label', 'Demo');
    changed({ libraryEpoch: 1, revision: 2 });
    expect(owner.state.versionInfo.label).toBe('Demo');
    expect(owner.state.needsReload).toBe(true);
  });
  it('requires a name for new works, retains public error copy, and bounds fields', async () => {
    await owner.open({ id: 'a' });
    owner.select({ kind: 'new', title: '' });
    expect(await owner.save()).toBe(false);
    expect(bridge.saveWorkOrganization).not.toHaveBeenCalled();
    owner.select({ kind: 'keep' });
    owner.updateVersion('label', 'x'.repeat(121));
    expect(owner.state.versionInfo.label).toHaveLength(120);
    bridge.saveWorkOrganization.mockRejectedValueOnce(
      new Error('private path'),
    );
    await owner.save();
    expect(owner.state.error).not.toContain('private path');
  });
  it('uses the shared confirmation to cancel dirty close', async () => {
    await owner.open({ id: 'a' });
    owner.updateVersion('label', 'Draft');
    const closing = owner.close();
    const confirmation = (
      await import('./useAppConfirmation.js')
    ).useAppConfirmation();
    expect(confirmation.state.request.title).toContain('捨棄');
    confirmation.cancel();
    await closing;
    expect(owner.state.track.id).toBe('a');
    const accepted = owner.close();
    confirmation.accept();
    await accepted;
    expect(owner.state.track).toBe(null);
  });
  it('ignores previous query results immediately on typing a new query', async () => {
    await owner.open({ id: 'a' });
    const result = deferred();
    bridge.searchWorkOrganization.mockReturnValueOnce(result.promise);
    const searching = owner.search('old');
    owner.updateQuery('new');
    result.resolve({
      status: 'ok',
      libraryEpoch: 1,
      works: [{ id: 'old' }],
      tracks: [],
    });
    await searching;
    expect(owner.state.results.works).toEqual([]);
    expect(owner.state.searching).toBe(false);
  });
  it('appends bounded versions only when library revision still matches', async () => {
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot('a', {
        hasMore: true,
        nextOffset: 1,
        relatedVersions: [{ trackId: 'b' }],
      }),
    );
    await owner.open({ id: 'a' });
    bridge.getWorkOrganization.mockResolvedValueOnce(
      snapshot('a', { hasMore: false, relatedVersions: [{ trackId: 'c' }] }),
    );
    await owner.loadMore();
    expect(
      owner.state.snapshot.relatedVersions.map((item) => item.trackId),
    ).toEqual(['b', 'c']);
    expect(bridge.getWorkOrganization).toHaveBeenLastCalledWith({
      trackId: 'a',
      offset: 1,
      limit: 100,
    });
  });
});
