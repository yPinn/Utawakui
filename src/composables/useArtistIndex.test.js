import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let libraryUpdatedCallback;
let listTracksMock;
let getArtistIndexMock;
let mergeArtistsMock;
let splitArtistCreditMock;
let setArtistDisplayNameMock;
let undoArtistOrganizationMock;
let searchArtistIdentityCandidatesMock;
let applyArtistIdentityCandidateMock;
let cancelArtistIdentityCandidatesMock;
let autoResolveArtistIdentitiesMock;
let getFeatureConfirmationsMock;

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  libraryUpdatedCallback = undefined;
  listTracksMock = vi.fn().mockResolvedValue([{ id: 'a', artist: 'Aimer' }]);
  getArtistIndexMock = vi.fn().mockResolvedValue({
    artists: [{ id: 'artist-aimer', name: 'Aimer', trackIds: ['a'] }],
    trackArtistIds: { a: ['artist-aimer'] },
    organizationRevision: 4,
    canUndoOrganization: false,
  });
  mergeArtistsMock = vi.fn();
  splitArtistCreditMock = vi.fn();
  setArtistDisplayNameMock = vi.fn();
  undoArtistOrganizationMock = vi.fn();
  searchArtistIdentityCandidatesMock = vi.fn();
  applyArtistIdentityCandidateMock = vi.fn();
  cancelArtistIdentityCandidatesMock = vi.fn().mockResolvedValue(false);
  autoResolveArtistIdentitiesMock = vi
    .fn()
    .mockResolvedValue({ status: 'started' });
  getFeatureConfirmationsMock = vi.fn().mockResolvedValue({});
  vi.stubGlobal('window', {
    Utawakui: {
      listTracks: listTracksMock,
      listPlaylists: vi.fn().mockResolvedValue([]),
      getArtistIndex: getArtistIndexMock,
      mergeArtists: mergeArtistsMock,
      splitArtistCredit: splitArtistCreditMock,
      setArtistDisplayName: setArtistDisplayNameMock,
      undoArtistOrganization: undoArtistOrganizationMock,
      searchArtistIdentityCandidates: searchArtistIdentityCandidatesMock,
      applyArtistIdentityCandidate: applyArtistIdentityCandidateMock,
      cancelArtistIdentityCandidates: cancelArtistIdentityCandidatesMock,
      autoResolveArtistIdentities: autoResolveArtistIdentitiesMock,
      getFeatureConfirmations: getFeatureConfirmationsMock,
      confirmFeatureGate: vi.fn(),
      recordDiagnostic: vi.fn().mockResolvedValue(undefined),
      onLibraryUpdated: (callback) => {
        libraryUpdatedCallback = callback;
        return vi.fn();
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  const { useLibrary } = await import('./useLibrary.js');
  const { useArtistIndex } = await import('./useArtistIndex.js');
  const { useFeatureGates } = await import('./useFeatureGates.js');
  const library = useLibrary();
  await library.initialize();
  return {
    library,
    artistIndex: useArtistIndex(),
    featureGates: useFeatureGates(),
  };
}

describe('useArtistIndex', () => {
  it('does not let a superseded failure clear the current initial loading state', async () => {
    const { artistIndex } = await load();
    const older = Promise.withResolvers();
    const latest = Promise.withResolvers();
    getArtistIndexMock
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise);
    const oldRead = artistIndex.refresh();
    const newRead = artistIndex.refresh();
    older.reject(new Error('stale failure'));
    await oldRead;
    expect(artistIndex.state.isLoading).toBe(true);
    expect(artistIndex.state.error).toBeNull();
    expect(artistIndex.state.index).toBeNull();
    latest.resolve({ artists: [{ id: 'current' }], trackArtistIds: {} });
    await newRead;
    expect(artistIndex.state.isLoading).toBe(false);
    expect(artistIndex.state.index.artists[0].id).toBe('current');
  });
  it('settles a failed first read, waits again on retry, and keeps the index during background reads', async () => {
    const { artistIndex } = await load();
    getArtistIndexMock.mockRejectedValueOnce(new Error('read failed'));
    const failed = artistIndex.refresh();
    expect(artistIndex.state.isLoading).toBe(true);
    await failed;
    expect(artistIndex.state.isLoading).toBe(false);
    expect(artistIndex.state.isInitialized).toBe(true);
    let finish;
    getArtistIndexMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const retry = artistIndex.refresh();
    expect(artistIndex.state.isLoading).toBe(true);
    finish({ artists: [], trackArtistIds: {} });
    await retry;
    expect(artistIndex.state.isLoading).toBe(false);
    getArtistIndexMock.mockRejectedValueOnce(new Error('refresh failed'));
    const background = artistIndex.refresh();
    expect(artistIndex.state.isLoading).toBe(false);
    await background;
    expect(artistIndex.state.index).toEqual({
      artists: [],
      trackArtistIds: {},
    });
  });
  it('does not request the index until an artist surface asks for it', async () => {
    const { artistIndex } = await load();
    await flushMicrotasks();
    expect(getArtistIndexMock).not.toHaveBeenCalled();
    expect(autoResolveArtistIdentitiesMock).not.toHaveBeenCalled();
    expect(artistIndex.state.index).toBeNull();
  });

  it('loads once on demand and refetches when the library changes', async () => {
    const { artistIndex } = await load();
    artistIndex.ensureLoaded();
    artistIndex.ensureLoaded();
    await flushMicrotasks();
    expect(getArtistIndexMock).toHaveBeenCalledTimes(1);
    expect(autoResolveArtistIdentitiesMock).toHaveBeenCalledTimes(1);
    expect(artistIndex.state.index.artists[0].name).toBe('Aimer');

    listTracksMock.mockResolvedValue([
      { id: 'a', artist: 'Aimer' },
      { id: 'b', artist: 'Eve' },
    ]);
    await libraryUpdatedCallback();
    await flushMicrotasks();
    expect(getArtistIndexMock).toHaveBeenCalledTimes(2);
    expect(autoResolveArtistIdentitiesMock).toHaveBeenCalledTimes(2);
  });

  it('keeps new download artist links current after the first Library page unmounts', async () => {
    const { artistIndex } = await load();
    const { effectScope } = await import('vue');
    const { artistCreditLinks } = await import('../utils/artistPage.js');
    const firstPage = effectScope();
    firstPage.run(() => artistIndex.ensureLoaded());
    await flushMicrotasks();
    firstPage.stop();

    const downloaded = { id: 'b', artist: '정국 (Jung Kook)' };
    listTracksMock.mockResolvedValue([
      { id: 'a', artist: 'Aimer' },
      downloaded,
    ]);
    getArtistIndexMock.mockResolvedValue({
      artists: [
        { id: 'artist-aimer', name: 'Aimer', trackIds: ['a'] },
        { id: 'artist-jung-kook', name: downloaded.artist, trackIds: ['b'] },
      ],
      trackArtistIds: { a: ['artist-aimer'], b: ['artist-jung-kook'] },
    });
    await libraryUpdatedCallback();
    await flushMicrotasks();

    const returnedPage = effectScope();
    returnedPage.run(() => artistIndex.ensureLoaded());
    returnedPage.stop();
    expect(getArtistIndexMock).toHaveBeenCalledTimes(2);
    expect(artistCreditLinks(downloaded, artistIndex.state.index)).toEqual([
      { text: downloaded.artist, artistId: 'artist-jung-kook' },
    ]);
  });

  it('still observes provider gate changes after the requesting page unmounts', async () => {
    const { artistIndex, featureGates } = await load();
    const { effectScope } = await import('vue');
    const page = effectScope();
    page.run(() => artistIndex.ensureLoaded());
    await flushMicrotasks();
    page.stop();

    getFeatureConfirmationsMock.mockResolvedValue({
      'provider-flow': {
        featureId: 'provider-flow',
        noticeVersion: 'provider-flow-notice-v5',
        confirmedAt: '2026-10-12T06:00:00.000Z',
        enabled: true,
      },
    });
    await featureGates.refreshConfirmations();
    await flushMicrotasks();
    expect(autoResolveArtistIdentitiesMock).toHaveBeenCalledTimes(2);
  });

  it('does not restart automatic identity work for an unchanged track set', async () => {
    const { artistIndex } = await load();
    artistIndex.ensureLoaded();
    await flushMicrotasks();

    await artistIndex.refresh();

    expect(getArtistIndexMock).toHaveBeenCalledTimes(2);
    expect(autoResolveArtistIdentitiesMock).toHaveBeenCalledTimes(1);
    expect(autoResolveArtistIdentitiesMock).toHaveBeenCalledWith();
  });

  it('starts automatic identity work immediately after provider access is re-enabled', async () => {
    autoResolveArtistIdentitiesMock
      .mockResolvedValueOnce({ status: 'disabled' })
      .mockResolvedValue({ status: 'started' });
    const { artistIndex, featureGates } = await load();
    artistIndex.ensureLoaded();
    await flushMicrotasks();
    await flushMicrotasks();
    expect(autoResolveArtistIdentitiesMock).toHaveBeenCalledTimes(1);

    getFeatureConfirmationsMock.mockResolvedValue({
      'provider-flow': {
        featureId: 'provider-flow',
        noticeVersion: 'provider-flow-notice-v5',
        confirmedAt: '2026-10-12T06:00:00.000Z',
        enabled: true,
      },
    });
    await featureGates.refreshConfirmations();
    await flushMicrotasks();

    expect(autoResolveArtistIdentitiesMock).toHaveBeenCalledTimes(2);
    expect(autoResolveArtistIdentitiesMock).toHaveBeenLastCalledWith();

    await featureGates.refreshConfirmations();
    await flushMicrotasks();
    expect(autoResolveArtistIdentitiesMock).toHaveBeenCalledTimes(2);
  });

  it('does not let a stale disabled response clear a newer enabled request guard', async () => {
    let resolveDisabledRequest;
    autoResolveArtistIdentitiesMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDisabledRequest = resolve;
          }),
      )
      .mockResolvedValue({ status: 'started' });
    const { artistIndex, featureGates } = await load();
    artistIndex.ensureLoaded();
    await flushMicrotasks();

    getFeatureConfirmationsMock.mockResolvedValue({
      'provider-flow': {
        featureId: 'provider-flow',
        noticeVersion: 'provider-flow-notice-v5',
        confirmedAt: '2026-10-12T06:00:00.000Z',
        enabled: true,
      },
    });
    await featureGates.refreshConfirmations();
    await flushMicrotasks();
    expect(autoResolveArtistIdentitiesMock).toHaveBeenCalledTimes(2);

    resolveDisabledRequest({ status: 'disabled' });
    await flushMicrotasks();
    await artistIndex.refresh();

    expect(autoResolveArtistIdentitiesMock).toHaveBeenCalledTimes(2);
  });

  it('ignores a stale response that resolves after a newer one', async () => {
    const { artistIndex } = await load();
    let resolveStale;
    getArtistIndexMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStale = resolve;
          }),
      )
      .mockResolvedValueOnce({ artists: [{ id: 'new' }], trackArtistIds: {} });

    const stale = artistIndex.refresh();
    await artistIndex.refresh();
    resolveStale({ artists: [{ id: 'old' }], trackArtistIds: {} });
    await stale;
    expect(artistIndex.state.index.artists[0].id).toBe('new');
  });

  it('resolves missing photos one at a time, once per session, and refreshes on change', async () => {
    const { artistIndex } = await load();
    let active = 0;
    let maxActive = 0;
    window.Utawakui.resolveArtistPhoto = vi.fn(async (id) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await flushMicrotasks();
      active -= 1;
      return id === 'artist-a'
        ? { status: 'ok', changed: true }
        : { status: 'unavailable', reason: 'no-official-channel' };
    });

    await artistIndex.resolvePhotos(['artist-a', 'artist-b']);
    await artistIndex.resolvePhotos(['artist-a', 'artist-b']);

    expect(window.Utawakui.resolveArtistPhoto.mock.calls).toEqual([
      ['artist-a'],
      ['artist-b'],
    ]);
    expect(maxActive).toBe(1);
    expect(getArtistIndexMock).toHaveBeenCalledTimes(1);
  });

  it('stops a batch on a closed gate and lets those artists retry later', async () => {
    const { artistIndex } = await load();
    window.Utawakui.resolveArtistPhoto = vi
      .fn()
      .mockResolvedValueOnce({ status: 'disabled' })
      .mockResolvedValue({ status: 'ok', changed: false });

    await artistIndex.resolvePhotos(['artist-a', 'artist-b']);
    expect(window.Utawakui.resolveArtistPhoto).toHaveBeenCalledTimes(1);

    await artistIndex.resolvePhotos(['artist-a', 'artist-b']);
    expect(window.Utawakui.resolveArtistPhoto).toHaveBeenCalledTimes(3);
  });

  it('refreshes after a photo change and records a bounded error on failure', async () => {
    const { artistIndex } = await load();
    window.Utawakui.chooseArtistPhoto = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', changed: true })
      .mockRejectedValueOnce(new Error('C:\\private\\image.png'));

    await artistIndex.choosePhoto('artist-a');
    expect(getArtistIndexMock).toHaveBeenCalledTimes(1);

    await expect(artistIndex.choosePhoto('artist-a')).resolves.toBe(null);
    expect(artistIndex.state.error).toMatchObject({
      code: 'ARTIST_PHOTO_CHOOSE_FAILED',
      message: '這張圖片無法作為藝人照片，請換一張再試。',
    });
  });

  it('records a bounded error and keeps the previous index', async () => {
    const { artistIndex } = await load();
    await artistIndex.refresh();
    getArtistIndexMock.mockRejectedValueOnce(new Error('/private/path'));
    await artistIndex.refresh();
    expect(artistIndex.state.index.artists[0].name).toBe('Aimer');
    expect(artistIndex.state.error).toMatchObject({
      code: 'ARTIST_INDEX_FAILED',
      message: '目前無法整理藝人，請稍後再試。',
    });
  });

  it('merges opaque artist ids at the current revision and refreshes the projection', async () => {
    const { artistIndex } = await load();
    await artistIndex.refresh();
    const stableId = 'artist-11111111-1111-4111-8111-111111111111';
    mergeArtistsMock.mockResolvedValue({
      status: 'ok',
      changed: true,
      artistId: stableId,
      revision: 5,
    });
    getArtistIndexMock.mockResolvedValueOnce({
      artists: [{ id: stableId, name: '林俊傑', trackIds: ['a', 'b'] }],
      trackArtistIds: { a: [stableId], b: [stableId] },
      organizationRevision: 5,
      canUndoOrganization: true,
    });

    const result = await artistIndex.mergeArtists([
      'artist-68d52f69a4a24a1a',
      'artist-882cd3bcbb49699f',
    ]);

    expect(mergeArtistsMock).toHaveBeenCalledWith(
      ['artist-68d52f69a4a24a1a', 'artist-882cd3bcbb49699f'],
      4,
    );
    expect(result.artistId).toBe(stableId);
    expect(artistIndex.state.index.organizationRevision).toBe(5);
    expect(artistIndex.state.isMutating).toBe(false);
  });

  it.each([
    [
      'splitArtistCredit',
      ['artist-stable', 'credit-chinese'],
      'splitArtistCredit',
    ],
    ['setDisplayName', ['artist-stable', '林俊傑'], 'setArtistDisplayName'],
    ['undoOrganization', [], 'undoArtistOrganization'],
  ])(
    'sends only bounded %s intent plus the current revision',
    async (action, args, apiName) => {
      const { artistIndex } = await load();
      await artistIndex.refresh();
      const apiMock = window.Utawakui[apiName];
      apiMock.mockResolvedValue({ status: 'ok', changed: false, revision: 4 });

      await artistIndex[action](...args);

      expect(apiMock).toHaveBeenCalledWith(...args, 4);
    },
  );

  it('refreshes and exposes a bounded notice when a revision conflict occurs', async () => {
    const { artistIndex } = await load();
    await artistIndex.refresh();
    undoArtistOrganizationMock.mockResolvedValue({
      status: 'conflict',
      revision: 5,
    });
    getArtistIndexMock.mockResolvedValueOnce({
      artists: [],
      trackArtistIds: {},
      organizationRevision: 5,
      canUndoOrganization: true,
    });

    await artistIndex.undoOrganization();

    expect(artistIndex.state.error).toMatchObject({
      code: 'ARTIST_ORGANIZATION_CONFLICT',
      message: '藝人資料已更新，請確認最新內容後再試一次。',
    });
    expect(artistIndex.state.index.organizationRevision).toBe(5);
  });

  it('keeps explicit MusicBrainz lookup as a bounded fallback', async () => {
    const { artistIndex } = await load();
    searchArtistIdentityCandidatesMock.mockResolvedValue({
      status: 'ok',
      artistId: 'artist-aimer',
      candidates: [
        {
          candidateId: 'candidate_000000000000000000000000',
          name: 'エメ',
          aliases: ['Aimer'],
          evidence: 'exact-recording',
          canAutoLink: true,
        },
      ],
    });

    await artistIndex.searchCatalog('artist-aimer');

    expect(searchArtistIdentityCandidatesMock).toHaveBeenCalledWith(
      'artist-aimer',
    );
    expect(artistIndex.state.identityLookup).toMatchObject({
      status: 'ready',
      artistId: 'artist-aimer',
      candidates: [{ name: 'エメ', aliases: ['Aimer'] }],
      error: '',
    });
  });

  it('keeps manual organization available when MusicBrainz is gated off', async () => {
    const { artistIndex } = await load();
    searchArtistIdentityCandidatesMock.mockResolvedValue({
      status: 'disabled',
    });

    await artistIndex.searchCatalog('artist-aimer');

    expect(artistIndex.state.identityLookup).toMatchObject({
      status: 'disabled',
      artistId: 'artist-aimer',
      candidates: [],
      error: '請先在設定中啟用外部來源，再查詢 MusicBrainz。',
    });
  });

  it('turns a MusicBrainz transport failure into a bounded local notice', async () => {
    const { artistIndex } = await load();
    searchArtistIdentityCandidatesMock.mockRejectedValue(
      new Error('private provider response'),
    );

    await artistIndex.searchCatalog('artist-aimer');

    expect(artistIndex.state.identityLookup).toMatchObject({
      status: 'error',
      artistId: 'artist-aimer',
      candidates: [],
      error: 'MusicBrainz 目前無法使用，仍可手動整理藝人。',
    });
    expect(JSON.stringify(artistIndex.state.identityLookup)).not.toContain(
      'private provider response',
    );
  });

  it('applies only an opaque catalog candidate at the current revision and refreshes', async () => {
    const { artistIndex } = await load();
    await artistIndex.refresh();
    applyArtistIdentityCandidateMock.mockResolvedValue({
      status: 'ok',
      changed: true,
      artistId: 'artist-stable',
      revision: 5,
    });
    getArtistIndexMock.mockResolvedValueOnce({
      artists: [{ id: 'artist-stable', name: 'エメ', trackIds: ['a'] }],
      trackArtistIds: { a: ['artist-stable'] },
      organizationRevision: 5,
      canUndoOrganization: true,
    });

    const result = await artistIndex.applyCatalogCandidate(
      'artist-aimer',
      'candidate_000000000000000000000000',
    );

    expect(applyArtistIdentityCandidateMock).toHaveBeenCalledWith(
      'artist-aimer',
      'candidate_000000000000000000000000',
      4,
    );
    expect(result).toMatchObject({ status: 'ok', artistId: 'artist-stable' });
    expect(artistIndex.state.index.organizationRevision).toBe(5);
  });

  it('cancels the current catalog lookup and clears session-only candidates', async () => {
    const { artistIndex } = await load();
    await artistIndex.cancelCatalogSearch('artist-aimer');

    expect(cancelArtistIdentityCandidatesMock).toHaveBeenCalledWith(
      'artist-aimer',
    );
    expect(artistIndex.state.identityLookup).toMatchObject({
      status: 'idle',
      candidates: [],
    });
  });
});
