import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let collection;
let tracks;
let bridge;
let resolver;
beforeEach(async () => {
  collection = {
    id: 'release-a',
    kind: 'album',
    trackIds: ['a', 'b'],
    releaseLibraryEpoch: 1,
    requiresMembershipVerification: true,
    availableTrackIds: [],
    resolvedRelease: { revision: 3 },
  };
  tracks = new Map([
    ['a', { id: 'a', title: 'Original' }],
    ['b', { id: 'b', title: 'Live' }],
  ]);
  bridge = {
    resolveReleaseMembers: vi.fn(() =>
      Promise.resolve({
        status: 'ok',
        libraryEpoch: 1,
        revision: 3,
        collectionId: 'release-a',
        members: [{ trackId: 'a', bindingStatus: 'current' }],
        playableTrackIds: ['a'],
        hasMore: false,
      }),
    ),
    onReleaseOrganizationChanged: vi.fn(() => vi.fn()),
  };
  const { createReleaseMemberResolver } =
    await import('./useReleaseMembers.js');
  resolver = createReleaseMemberResolver({
    getBridge: () => bridge,
    getCollection: (id) => (id === collection?.id ? collection : undefined),
    getTracksById: () => tracks,
  });
});
afterEach(() => {
  resolver?.dispose();
  vi.unstubAllGlobals();
});

describe('release membership verification', () => {
  it('distinguishes pending, failed and verified-empty states for each collection', async () => {
    expect(resolver.verificationState(collection)).toEqual({
      state: 'idle',
      error: '',
    });
    const waiting = deferred();
    bridge.resolveReleaseMembers.mockReturnValueOnce(waiting.promise);
    const pending = resolver.resolve(collection);
    expect(resolver.verificationState(collection).state).toBe('pending');
    waiting.resolve({ status: 'conflict' });
    await pending;
    expect(resolver.verificationState(collection).state).toBe('error');
    expect(
      resolver.verificationState({ ...collection, id: 'different' }),
    ).toEqual({ state: 'idle', error: '' });
    bridge.resolveReleaseMembers.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      revision: 3,
      collectionId: 'release-a',
      playableTrackIds: [],
      hasMore: false,
    });
    await resolver.resolve(collection, { fresh: true });
    expect(resolver.verificationState(collection)).toEqual({
      state: 'ready',
      error: '',
    });
    expect(
      resolver.verificationState({
        ...collection,
        requiresMembershipVerification: false,
      }).state,
    ).toBe('ready');
    resolver.dispose();
    expect(resolver.verificationState(collection).state).toBe('idle');
  });
  it('exposes a failed fresh verification for source-backed collections too', async () => {
    collection.requiresMembershipVerification = false;
    expect(resolver.verificationState(collection).state).toBe('ready');
    bridge.resolveReleaseMembers.mockRejectedValueOnce(new Error('offline'));
    const pending = resolver.resolve(collection, { fresh: true });
    expect(resolver.verificationState(collection).state).toBe('pending');
    await pending;
    expect(resolver.verificationState(collection).state).toBe('error');
  });
  it('hydrates the shared resolver from canonical owners without hashing during initialization', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {
      Utawakui: {
        ...bridge,
        listPlaylists: vi.fn(() => Promise.resolve([collection])),
        listTracks: vi.fn(() => Promise.resolve([...tracks.values()])),
        onLibraryUpdated: vi.fn(() => vi.fn()),
      },
    });
    const { useReleaseMembers } = await import('./useReleaseMembers.js');
    const shared = useReleaseMembers();
    shared.initialize();
    shared.initialize();
    const library = (await import('./useLibrary.js')).useLibrary();
    await library.initialize();
    expect(bridge.resolveReleaseMembers).not.toHaveBeenCalled();
    const verifying = shared.resolve(collection);
    expect(shared.isPending(collection)).toBe(true);
    await verifying;
    expect(shared.displayTrackIds(collection)).toEqual(['a']);
    shared.dispose();
  });
  it('handles absent collections, cached reads, invalid proof metadata and invalid page offsets', async () => {
    expect(resolver.displayTrackIds(null)).toEqual([]);
    expect(await resolver.resolve(null)).toEqual([]);
    await resolver.resolve(collection);
    expect(await resolver.resolve(collection)).toEqual([tracks.get('a')]);
    bridge.resolveReleaseMembers.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 2,
      revision: 3,
      collectionId: 'release-a',
    });
    expect(await resolver.resolve(collection, { fresh: true })).toEqual([]);
    bridge.resolveReleaseMembers.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      revision: 3,
      collectionId: 'release-a',
      playableTrackIds: ['a'],
      hasMore: true,
      nextOffset: 0,
    });
    expect(await resolver.resolve(collection, { fresh: true })).toEqual([]);
    resolver.admitTrackReleases(
      'a',
      [
        { id: 'missing', revision: 3 },
        { id: 'release-a', revision: 4 },
      ],
      1,
    );
    expect(resolver.displayTrackIds(collection)).toEqual([]);
  });
  it('does not restore revoked admission from an older in-flight member page', async () => {
    const page = deferred();
    bridge.resolveReleaseMembers.mockReturnValueOnce(page.promise);
    const pending = resolver.resolve(collection);
    resolver.admitTrackReleases('a', [], 1);
    page.resolve({
      status: 'ok',
      libraryEpoch: 1,
      revision: 3,
      collectionId: 'release-a',
      playableTrackIds: ['a'],
      hasMore: false,
    });
    expect(await pending).toEqual([]);
    expect(resolver.displayTrackIds(collection)).toEqual([]);
  });
  it('lets fresh negative full verification supersede older partial admission', async () => {
    resolver.admitTrackReleases('a', [{ id: 'release-a', revision: 3 }], 1);
    bridge.resolveReleaseMembers.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      revision: 3,
      collectionId: 'release-a',
      playableTrackIds: [],
      hasMore: false,
    });
    await resolver.resolve(collection, { fresh: true });
    expect(resolver.displayTrackIds(collection)).toEqual([]);
  });
  it('revokes previous full and partial membership when a fresh per-track query no longer contains it', async () => {
    await resolver.resolve(collection);
    resolver.admitTrackReleases('b', [{ id: 'release-a', revision: 3 }], 1);
    resolver.admitTrackReleases('a', [], 1);
    expect(resolver.displayTrackIds(collection)).toEqual(['b']);
    resolver.admitTrackReleases('b', [], 1);
    expect(resolver.displayTrackIds(collection)).toEqual([]);
  });
  it('does not reuse a lazy request as fresh action proof or let its late result overwrite the action', async () => {
    const result = deferred();
    bridge.resolveReleaseMembers.mockReturnValueOnce(result.promise);
    const lazy = resolver.resolve(collection);
    bridge.resolveReleaseMembers.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      revision: 3,
      collectionId: 'release-a',
      playableTrackIds: ['b'],
      hasMore: false,
    });
    expect(await resolver.resolve(collection, { fresh: true })).toEqual([
      tracks.get('b'),
    ]);
    result.resolve({
      status: 'ok',
      libraryEpoch: 1,
      revision: 3,
      collectionId: 'release-a',
      playableTrackIds: ['a'],
      hasMore: false,
    });
    await lazy;
    expect(resolver.displayTrackIds(collection)).toEqual(['b']);
    expect(bridge.resolveReleaseMembers).toHaveBeenCalledTimes(2);
  });
  it('fails closed for unverified local members and admits only main-verified canonical tracks', async () => {
    expect(resolver.displayTrackIds(collection)).toEqual([]);
    expect(await resolver.resolve(collection)).toEqual([tracks.get('a')]);
    expect(resolver.displayTrackIds(collection)).toEqual(['a']);
    expect(bridge.resolveReleaseMembers).toHaveBeenCalledWith({
      collectionId: 'release-a',
      expectedRevision: 3,
      libraryEpoch: 1,
      offset: 0,
      limit: 100,
    });
  });
  it('shares lazy reads but re-verifies every explicit action', async () => {
    await Promise.all([
      resolver.resolve(collection),
      resolver.resolve(collection),
    ]);
    expect(bridge.resolveReleaseMembers).toHaveBeenCalledOnce();
    await resolver.resolve(collection, { fresh: true });
    expect(bridge.resolveReleaseMembers).toHaveBeenCalledTimes(2);
  });
  it('keeps source-backed and ordinary playlist projections cheap', () => {
    const ordinary = {
      ...collection,
      requiresMembershipVerification: false,
      availableTrackIds: ['b'],
    };
    expect(resolver.displayTrackIds(ordinary)).toEqual(['b']);
    expect(
      resolver.displayTrackIds({ id: 'p', kind: 'playlist', trackIds: ['a'] }),
    ).toEqual(['a']);
    expect(bridge.resolveReleaseMembers).not.toHaveBeenCalled();
  });
  it('follows candidate offsets and does not treat an empty verified page as complete', async () => {
    bridge.resolveReleaseMembers.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      revision: 3,
      collectionId: 'release-a',
      playableTrackIds: [],
      hasMore: true,
      nextOffset: 100,
    });
    expect(await resolver.resolve(collection)).toEqual([tracks.get('a')]);
    expect(bridge.resolveReleaseMembers.mock.calls[1][0].offset).toBe(100);
  });
  it.each(['revision', 'members', 'epoch'])(
    'invalidates late results after %s changes',
    async (kind) => {
      const result = deferred();
      bridge.resolveReleaseMembers.mockReturnValueOnce(result.promise);
      const pending = resolver.resolve(collection);
      collection = {
        ...collection,
        ...(kind === 'revision'
          ? { resolvedRelease: { revision: 4 } }
          : kind === 'members'
            ? { trackIds: ['b', 'a'] }
            : { releaseLibraryEpoch: 2 }),
      };
      result.resolve({
        status: 'ok',
        libraryEpoch: 1,
        revision: 3,
        collectionId: 'release-a',
        playableTrackIds: ['a'],
        hasMore: false,
      });
      expect(await pending).toEqual([]);
      expect(resolver.displayTrackIds(collection)).toEqual([]);
    },
  );
  it('clears cached admission on organization events and library changes', async () => {
    let changed;
    bridge.onReleaseOrganizationChanged.mockImplementation((listener) => {
      changed = listener;
      return vi.fn();
    });
    resolver.initialize();
    await resolver.resolve(collection);
    changed({ libraryEpoch: 1, collectionIds: ['release-a'] });
    expect(resolver.displayTrackIds(collection)).toEqual([]);
    await resolver.resolve(collection);
    changed({ libraryEpoch: 2, collectionIds: [] });
    expect(resolver.displayTrackIds(collection)).toEqual([]);
  });
  it('refuses conflict or I/O failures rather than passing through raw track IDs', async () => {
    bridge.resolveReleaseMembers.mockResolvedValueOnce({ status: 'conflict' });
    expect(await resolver.resolve(collection)).toEqual([]);
    bridge.resolveReleaseMembers.mockRejectedValueOnce(new Error('private'));
    expect(await resolver.resolve(collection, { fresh: true })).toEqual([]);
    expect(resolver.state.error).not.toContain('private');
  });
  it('admits a verified track-specific membership without claiming all members are verified', () => {
    resolver.admitTrackReleases('b', [{ id: 'release-a', revision: 3 }], 1);
    expect(resolver.displayTrackIds(collection)).toEqual(['b']);
    expect(bridge.resolveReleaseMembers).not.toHaveBeenCalled();
  });
});
