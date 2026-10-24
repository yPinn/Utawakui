import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  initialize: vi.fn(),
  dispose: vi.fn(),
  admit: vi.fn(),
}));
vi.mock('./usePlaylists.js', () => ({
  usePlaylists: () => ({ refresh: mocks.refresh }),
}));
vi.mock('./useReleaseMembers.js', () => ({
  useReleaseMembers: () => ({
    initialize: mocks.initialize,
    dispose: mocks.dispose,
    admitTrackReleases: mocks.admit,
  }),
}));
const release = (extra = {}) => ({
  id: 'r',
  name: 'RASEN',
  revision: 2,
  sourceBacked: true,
  effective: {
    type: 'single',
    date: { value: '2026', precision: 'year' },
    totalTrackCount: 2,
  },
  overrides: {},
  sourceValues: { type: 'single' },
  leadTrackId: null,
  memberTrackIds: ['a', 'b'],
  memberCount: 2,
  members: [{ trackId: 'a', bindingStatus: 'current' }],
  ...extra,
});
const result = (extra = {}) => ({
  status: 'ok',
  libraryEpoch: 1,
  release: release(),
  ...extra,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let bridge;
let owner;
let changed;
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  bridge = {
    getReleaseInfo: vi.fn(() => Promise.resolve(result())),
    saveReleaseInfo: vi.fn(() =>
      Promise.resolve(result({ release: release({ revision: 3 }) })),
    ),
    createLocalRelease: vi.fn(() =>
      Promise.resolve(result({ release: release({ sourceBacked: false }) })),
    ),
    getTrackReleases: vi.fn(() =>
      Promise.resolve({ status: 'ok', libraryEpoch: 1, releases: [] }),
    ),
    onReleaseOrganizationChanged: vi.fn((callback) => {
      changed = callback;
      return vi.fn();
    }),
  };
  vi.stubGlobal('window', { Utawakui: bridge });
  owner = (
    await import('./useReleaseOrganization.js')
  ).useReleaseOrganization();
  owner.initialize();
});
afterEach(() => {
  owner?.dispose();
  vi.unstubAllGlobals();
});

describe('release editor shared owner', () => {
  it('guards closed-editor operations and invalid draft fields', async () => {
    expect(await owner.open(null)).toBe(false);
    expect(await owner.reload()).toBe(false);
    expect(await owner.save()).toBe(false);
    expect(await owner.create()).toBe(false);
    expect(await owner.loadMore()).toBe(false);
    owner.updateField('bad', 'value', 'x');
    owner.setLeadTrackId(null);
    owner.setName(null);
    owner.initialize();
    changed({ libraryEpoch: 1 });
    expect(bridge.onReleaseOrganizationChanged).toHaveBeenCalledOnce();
    expect(await owner.close()).toBe(true);
  });
  it('uses the shared dirty-close confirmation for cancel and accept', async () => {
    await owner.open('r');
    owner.setLeadTrackId('a');
    owner.updateField('bad', 'value', 'x');
    owner.updateField('date', 'bad', 'x');
    const confirmation = (
      await import('./useAppConfirmation.js')
    ).useAppConfirmation();
    const closing = owner.close();
    confirmation.cancel();
    expect(await closing).toBe(false);
    expect(owner.state.draft.leadTrackId).toBe('a');
    const opening = owner.open('other');
    confirmation.cancel();
    expect(await opening).toBe(false);
    const createOpening = owner.openCreate({
      id: 'a',
      sourceType: 'local-file',
    });
    confirmation.cancel();
    expect(await createOpening).toBe(false);
    const finalClose = owner.close();
    confirmation.accept();
    expect(await finalClose).toBe(true);
  });
  it.each(['io', 'invalid-intent', 'stale', 'epoch'])(
    'handles a failed or invalidated release read: %s',
    async (kind) => {
      await owner.open('r');
      if (kind === 'io')
        bridge.getReleaseInfo.mockRejectedValueOnce(new Error('private'));
      else
        bridge.getReleaseInfo.mockResolvedValueOnce(
          kind === 'epoch' ? result({ libraryEpoch: 2 }) : { status: kind },
        );
      expect(await owner.reload()).toBe(false);
      expect(owner.state.error).not.toContain('private');
    },
  );
  it.each(['io', 'invalid-intent'])(
    'handles a failed local-create initialization: %s',
    async (kind) => {
      if (kind === 'io')
        bridge.getTrackReleases.mockRejectedValueOnce(new Error('private'));
      else bridge.getTrackReleases.mockResolvedValueOnce({ status: kind });
      expect(
        await owner.openCreate({ id: 'a', sourceType: 'local-file' }),
      ).toBe(false);
      expect(owner.state.error).not.toContain('private');
    },
  );
  it.each(['io', 'limit-reached', 'epoch'])(
    'handles local creation failure without a second mutation: %s',
    async (kind) => {
      await owner.openCreate({ id: 'a', sourceType: 'local-file' });
      owner.setName(' ');
      expect(await owner.create()).toBe(false);
      owner.setName('Local');
      if (kind === 'io')
        bridge.createLocalRelease.mockRejectedValueOnce(new Error('private'));
      else
        bridge.createLocalRelease.mockResolvedValueOnce(
          kind === 'epoch' ? result({ libraryEpoch: 2 }) : { status: kind },
        );
      expect(await owner.create()).toBe(false);
      expect(owner.state.error).not.toContain('private');
      expect(bridge.saveReleaseInfo).not.toHaveBeenCalled();
    },
  );
  it('ignores an old create initialization after closing and guards duplicate mutations', async () => {
    const initial = deferred();
    bridge.getTrackReleases.mockReturnValueOnce(initial.promise);
    const opening = owner.openCreate({ id: 'a', sourceType: 'local-file' });
    await owner.close();
    initial.resolve({ status: 'ok', libraryEpoch: 1, releases: [] });
    expect(await opening).toBe(false);
    await owner.open('r');
    owner.updateField('date', 'mode', 'clear');
    const pending = deferred();
    bridge.saveReleaseInfo.mockReturnValueOnce(pending.promise);
    const saving = owner.save();
    expect(await owner.save()).toBe(false);
    expect(await owner.close()).toBe(false);
    expect(await owner.open('x')).toBe(false);
    expect(await owner.reload()).toBe(false);
    owner.updateField('date', 'mode', 'manual');
    owner.setLeadTrackId('b');
    owner.setName('blocked');
    pending.resolve(result({ libraryEpoch: 2 }));
    await saving;
    expect(owner.isOpen.value).toBe(false);
  });
  it.each(['io', 'conflict', 'epoch', 'revision'])(
    'retains editor members on pagination failure: %s',
    async (kind) => {
      bridge.getReleaseInfo.mockResolvedValueOnce(
        result({ release: release({ hasMore: true, nextOffset: 100 }) }),
      );
      await owner.open('r');
      if (kind === 'io')
        bridge.getReleaseInfo.mockRejectedValueOnce(new Error('private'));
      else
        bridge.getReleaseInfo.mockResolvedValueOnce(
          kind === 'conflict'
            ? { status: 'conflict' }
            : kind === 'epoch'
              ? result({ libraryEpoch: 2 })
              : result({ release: release({ revision: 3 }) }),
        );
      expect(await owner.loadMore()).toBe(false);
      expect(owner.state.error).not.toContain('private');
      if (kind !== 'epoch')
        expect(owner.state.release.members).toEqual([
          { trackId: 'a', bindingStatus: 'current' },
        ]);
    },
  );
  it.each([0, 501, null])(
    'rejects non-advancing or excessive containing-release offsets: %s',
    async (nextOffset) => {
      bridge.getTrackReleases.mockResolvedValueOnce({
        status: 'ok',
        libraryEpoch: 1,
        hasMore: true,
        nextOffset,
      });
      expect((await owner.findTrackReleases('a')).status).toBe(
        'invalid-intent',
      );
    },
  );
  it('rejects mixed-epoch containing-release pages and late queries after an event', async () => {
    bridge.getTrackReleases.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      hasMore: true,
      nextOffset: 50,
    });
    bridge.getTrackReleases.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 2,
    });
    expect((await owner.findTrackReleases('a')).status).toBe('stale');
    const pending = deferred();
    bridge.getTrackReleases.mockReturnValueOnce(pending.promise);
    const query = owner.findTrackReleases('a');
    changed({ libraryEpoch: 2 });
    pending.resolve({ status: 'ok', libraryEpoch: 1 });
    expect((await query).status).toBe('stale');
  });
  it('refreshes a clean relevant editor and ignores unrelated IDs', async () => {
    await owner.open('r');
    changed({ libraryEpoch: 1, collectionIds: ['other'] });
    expect(bridge.getReleaseInfo).toHaveBeenCalledOnce();
    bridge.getReleaseInfo.mockResolvedValueOnce(
      result({ release: release({ revision: 4 }) }),
    );
    changed({ libraryEpoch: 1, collectionIds: ['r'] });
    await Promise.resolve();
    expect(owner.state.release.revision).toBe(4);
  });
  it.each(['conflict', 'io'])(
    'retains drafts when an event arrives during a failed %s save',
    async (kind) => {
      await owner.open('r');
      owner.updateField('date', 'mode', 'clear');
      let reject;
      const pending = new Promise((resolve, fail) => {
        reject = fail;
        if (kind === 'conflict') reject = () => resolve({ status: 'conflict' });
      });
      bridge.saveReleaseInfo.mockReturnValueOnce(pending);
      const saving = owner.save();
      changed({ libraryEpoch: 1, collectionIds: ['r'] });
      reject(new Error('private'));
      await saving;
      expect(owner.state.draft.date.mode).toBe('clear');
      expect(owner.state.needsReload).toBe(true);
      expect(bridge.getReleaseInfo).toHaveBeenCalledOnce();
    },
  );
  it('re-reads a newer release event that arrives while a successful save refresh is pending', async () => {
    await owner.open('r');
    owner.updateField('date', 'mode', 'clear');
    const refresh = deferred();
    mocks.refresh.mockReturnValueOnce(refresh.promise);
    const saving = owner.save();
    await Promise.resolve();
    changed({ libraryEpoch: 1, collectionIds: ['r'] });
    bridge.getReleaseInfo.mockResolvedValueOnce(
      result({ release: release({ revision: 4 }) }),
    );
    refresh.resolve();
    await saving;
    expect(owner.state.release.revision).toBe(4);
  });
  it('reads all containing-release pages before admitting navigation memberships', async () => {
    bridge.getTrackReleases.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      releases: [{ id: 'one' }],
      hasMore: true,
      nextOffset: 50,
    });
    bridge.getTrackReleases.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      releases: [{ id: 'two' }],
      hasMore: false,
    });
    expect(
      (await owner.findTrackReleases('a')).releases.map((entry) => entry.id),
    ).toEqual(['one', 'two']);
    expect(bridge.getTrackReleases).toHaveBeenLastCalledWith({
      trackId: 'a',
      limit: 50,
      offset: 50,
    });
  });
  it('saves explicit manual fields while removing a separate override', async () => {
    bridge.getReleaseInfo.mockResolvedValueOnce(
      result({ release: release({ overrides: { date: null } }) }),
    );
    await owner.open('r');
    owner.updateField('type', 'mode', 'manual');
    owner.updateField('type', 'value', 'ep');
    owner.updateField('date', 'mode', 'source');
    expect(await owner.save()).toBe(true);
    expect(bridge.saveReleaseInfo).toHaveBeenCalledWith({
      collectionId: 'r',
      expectedRevision: 2,
      libraryEpoch: 1,
      set: { type: 'ep' },
      remove: ['date'],
    });
    expect(mocks.refresh).toHaveBeenCalled();
    expect(owner.isDirty.value).toBe(false);
  });
  it('retains conflicting drafts and offers reload', async () => {
    await owner.open('r');
    owner.updateField('date', 'mode', 'clear');
    bridge.saveReleaseInfo.mockResolvedValueOnce({ status: 'conflict' });
    expect(await owner.save()).toBe(false);
    expect(owner.state.draft.date.mode).toBe('clear');
    expect(owner.state.needsReload).toBe(true);
    await owner.reload();
    expect(owner.state.draft.date.mode).toBe('source');
  });
  it('obtains the epoch then creates exactly one local single without a second metadata mutation', async () => {
    expect(await owner.openCreate({ id: 'a', sourceType: 'provider' })).toBe(
      false,
    );
    await owner.openCreate({
      id: 'a',
      title: 'RASEN',
      sourceType: 'local-file',
    });
    owner.setName('單曲🎵');
    expect(await owner.create()).toBe(true);
    expect(bridge.getTrackReleases).toHaveBeenCalledWith({
      trackId: 'a',
      limit: 50,
    });
    expect(bridge.createLocalRelease).toHaveBeenCalledWith({
      trackId: 'a',
      name: '單曲🎵',
      libraryEpoch: 1,
    });
    expect(bridge.saveReleaseInfo).not.toHaveBeenCalled();
    expect(owner.state.release.id).toBe('r');
    expect(owner.state.mode).toBe('edit');
  });
  it('ignores late reads, saves and create initialization after scope changes', async () => {
    const first = deferred();
    bridge.getReleaseInfo.mockReturnValueOnce(first.promise);
    const opening = owner.open('r');
    changed({ libraryEpoch: 2, collectionIds: [] });
    first.resolve(result());
    await opening;
    expect(owner.state.collectionId).toBe(null);
    await owner.open('r');
    owner.updateField('date', 'mode', 'clear');
    const saving = deferred();
    bridge.saveReleaseInfo.mockReturnValueOnce(saving.promise);
    const pending = owner.save();
    changed({ libraryEpoch: 2, collectionIds: [] });
    saving.resolve(result());
    await pending;
    expect(owner.state.collectionId).toBe(null);
  });
  it('keeps bindings private and requires explicit bounded repair intents', async () => {
    await owner.open('r');
    await owner.save({ reconfirmTrackIds: ['a'] });
    expect(bridge.saveReleaseInfo.mock.calls[0][0]).toMatchObject({
      reconfirmTrackIds: ['a'],
    });
    await owner.save({ initializeBindings: true });
    expect(bridge.saveReleaseInfo.mock.calls[1][0].initializeBindings).toBe(
      true,
    );
    expect(JSON.stringify(bridge.saveReleaseInfo.mock.calls)).not.toContain(
      'hash',
    );
  });
  it('appends editor members with candidate pagination and a fixed revision', async () => {
    bridge.getReleaseInfo.mockResolvedValueOnce(
      result({ release: release({ hasMore: true, nextOffset: 100 }) }),
    );
    await owner.open('r');
    bridge.getReleaseInfo.mockResolvedValueOnce(
      result({
        release: release({
          members: [{ trackId: 'b', bindingStatus: 'changed' }],
          hasMore: false,
        }),
      }),
    );
    await owner.loadMore();
    expect(owner.state.release.members.map((member) => member.trackId)).toEqual(
      ['a', 'b'],
    );
    expect(bridge.getReleaseInfo).toHaveBeenLastCalledWith({
      collectionId: 'r',
      offset: 100,
      limit: 100,
    });
  });
  it.each([
    'invalid-intent',
    'not-found',
    'binding-mismatch',
    'recovery-pending',
  ])('presents expected %s without discarding draft input', async (status) => {
    await owner.open('r');
    owner.updateField('date', 'mode', 'clear');
    bridge.saveReleaseInfo.mockResolvedValueOnce({ status });
    await owner.save();
    expect(owner.state.draft.date.mode).toBe('clear');
    expect(owner.state.error).not.toBe('');
  });
  it('does not overwrite a dirty editor when another surface changes the collection', async () => {
    await owner.open('r');
    owner.updateField('date', 'mode', 'clear');
    changed({ libraryEpoch: 1, collectionIds: ['r'] });
    expect(owner.state.needsReload).toBe(true);
    expect(owner.state.draft.date.mode).toBe('clear');
  });
  it('sanitizes I/O errors and does not submit an invalid calendar or count', async () => {
    await owner.open('r');
    owner.updateField('date', 'mode', 'manual');
    owner.updateField('date', 'value', '2026-02-30');
    owner.updateField('date', 'precision', 'day');
    expect(await owner.save()).toBe(false);
    expect(bridge.saveReleaseInfo).not.toHaveBeenCalled();
    owner.updateField('date', 'mode', 'clear');
    bridge.saveReleaseInfo.mockRejectedValueOnce(new Error('private path'));
    await owner.save();
    expect(owner.state.error).not.toContain('private path');
  });
});
