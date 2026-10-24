import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../utils/appErrors.js';

let fetchYoutubePlaylistMock;
let resolveImportInputMock;
let resolveImportSourceMock;
let fetchVideoMetadataMock;
let downloadAudioMock;
let cancelAudioDownloadMock;
let getConfigMock;
let getFeatureConfirmationsMock;
let confirmFeatureGateMock;
let chooseDownloadDirMock;
let resetDownloadDirMock;
let openDownloadDirMock;
let openYoutubeMusicSearchMock;
let listPlaylistsMock;
let createPlaylistMock;
let setPlaylistTracksMock;
let upsertAlbumMock;

// usePlaylists.js is a module-scope singleton that useImportSession.js now
// imports transitively — it eagerly calls listPlaylists()/onLibraryUpdated()
// at module-load time (see usePlaylists.test.js), so window.Utawakui needs
// all four of these stubbed or every test in this file fails on load, not
// just the new ones.
function nextPlaylistId(name) {
  return `playlist-${name}`;
}

// createPlaylistMock/setPlaylistTracksMock must resolve with the current
// playlists array, same as the real IPC backend — usePlaylists.js's
// mutateTracks() re-derives its local state from whatever the mock
// resolves, so an empty-array stub silently erases the just-created
// playlist and breaks any test that syncs the same playlist twice (e.g. a
// retry).
let mockPlaylist;

const confirmedProviderFlow = {
  featureId: 'provider-flow',
  noticeVersion: 'provider-flow-notice-v5',
  confirmedAt: '2026-08-13T00:00:00.000Z',
  enabled: true,
};

beforeEach(() => {
  vi.resetModules();
  mockPlaylist = null;
  fetchYoutubePlaylistMock = vi.fn();
  resolveImportInputMock = vi.fn();
  resolveImportSourceMock = vi.fn();
  fetchVideoMetadataMock = vi.fn();
  downloadAudioMock = vi.fn();
  cancelAudioDownloadMock = vi.fn().mockResolvedValue(true);
  getConfigMock = vi.fn().mockResolvedValue({
    downloadDir: 'C:\\Music\\Utawakui',
    isDefault: true,
  });
  getFeatureConfirmationsMock = vi.fn().mockResolvedValue({
    'provider-flow': confirmedProviderFlow,
  });
  confirmFeatureGateMock = vi.fn().mockResolvedValue(confirmedProviderFlow);
  chooseDownloadDirMock = vi.fn();
  resetDownloadDirMock = vi.fn();
  openDownloadDirMock = vi.fn();
  openYoutubeMusicSearchMock = vi.fn().mockResolvedValue(undefined);
  listPlaylistsMock = vi.fn().mockResolvedValue([]);
  createPlaylistMock = vi.fn(async (name) => {
    mockPlaylist = {
      id: nextPlaylistId(name),
      name,
      trackIds: [],
      addedAt: {},
    };
    return [mockPlaylist];
  });
  setPlaylistTracksMock = vi.fn(async (id, trackIds) => {
    if (mockPlaylist?.id === id) mockPlaylist = { ...mockPlaylist, trackIds };
    return mockPlaylist ? [mockPlaylist] : [];
  });
  upsertAlbumMock = vi.fn(async ({ source, trackIds } = {}) => {
    mockPlaylist = {
      id: 'album-1',
      kind: 'album',
      source,
      trackIds,
      addedAt: {},
    };
    return [mockPlaylist];
  });
  vi.stubGlobal('window', {
    Utawakui: {
      fetchYoutubePlaylist: fetchYoutubePlaylistMock,
      resolveImportSource: resolveImportSourceMock,
      fetchVideoMetadata: fetchVideoMetadataMock,
      downloadAudio: downloadAudioMock,
      cancelAudioDownload: cancelAudioDownloadMock,
      getConfig: getConfigMock,
      getFeatureConfirmations: getFeatureConfirmationsMock,
      confirmFeatureGate: confirmFeatureGateMock,
      chooseDownloadDir: chooseDownloadDirMock,
      resetDownloadDir: resetDownloadDirMock,
      openDownloadDir: openDownloadDirMock,
      openYoutubeMusicSearch: openYoutubeMusicSearchMock,
      listPlaylists: listPlaylistsMock,
      createPlaylist: createPlaylistMock,
      setPlaylistTracks: setPlaylistTracksMock,
      upsertAlbum: upsertAlbumMock,
      onLibraryUpdated: () => () => {},
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadImportSession() {
  const { useImportSession } = await import('./useImportSession.js');
  return useImportSession();
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('useImportSession', () => {
  it('projects the dominant failed download reason independently of accepted batch status', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'Failure summary',
      entries: ['one', 'two', 'three', 'four'].map((id) => ({ id, title: id })),
    });
    downloadAudioMock.mockImplementation(async (id) => {
      if (id === 'four') return { title: id };
      throw new Error(
        `utawakui-download-failed:${id === 'three' ? 'disk-full' : 'network-error'}`,
      );
    });
    const session = await loadImportSession();
    expect(session.dominantFailureCode.value).toBeNull();
    session.setInput('summary');
    await session.resolveSource();
    await session.confirmImport();
    expect(session.dominantFailureCode.value).toBe('network-error');
    expect(session.activity.batches[0].phase).toBe('failed');
    expect(session.state.playlistTracks[3].status).toBe('done');
  });

  it('rejects oversized selections without accepting or starting partial work', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'Oversized',
      entries: Array.from({ length: 501 }, (_, index) => ({
        id: `song-${index}`,
      })),
    });
    const session = await loadImportSession();
    session.setInput('oversized');
    await session.resolveSource();
    expect(await session.submitImport()).toBeNull();
    expect(session.activity.batches).toHaveLength(0);
    expect(downloadAudioMock).not.toHaveBeenCalled();
    expect(session.state.status).toContain('請分批匯入');
  });

  it('retains fifty unfinished batches and requires a terminal record to be dismissed before accepting more', async () => {
    fetchYoutubePlaylistMock.mockResolvedValue({
      title: 'Retryable',
      entries: [{ id: 'one' }],
    });
    downloadAudioMock.mockRejectedValue(new Error('network unavailable'));
    const session = await loadImportSession();
    for (let index = 0; index < 50; index++) {
      session.setInput(`source-${index}`);
      await session.resolveSource();
      await session.confirmImport();
    }
    session.setInput('overflow');
    await session.resolveSource();
    expect(await session.submitImport()).toBeNull();
    expect(session.activity.batches).toHaveLength(50);
    expect(
      session.activity.batches.every((batch) => batch.phase === 'failed'),
    ).toBe(true);
    expect(downloadAudioMock).toHaveBeenCalledTimes(50);
    const oldId = session.activity.batches[0].id;
    expect(session.dismissBatch(oldId)).toBe(true);
    await session.confirmImport();
    expect(session.activity.batches).toHaveLength(50);
    expect(session.activity.batches.some((batch) => batch.id === oldId)).toBe(
      false,
    );
    expect(downloadAudioMock).toHaveBeenCalledTimes(51);
  });

  it('treats a prior batch success as local membership in a later selection of the same draft', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'Selections',
      entries: [{ id: 'one' }, { id: 'two' }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'one' });
    const session = await loadImportSession();
    session.setInput('selections');
    await session.resolveSource();
    session.setTrackSelected('two', false);
    await session.confirmImport();
    const remaining = deferred();
    downloadAudioMock.mockReturnValueOnce(remaining.promise);
    session.setTrackSelected('two', true);
    const id = await session.submitImport();
    const batch = session.activity.batches.find((b) => b.id === id);
    expect(batch.tracks.find((t) => t.id === 'one')).toMatchObject({
      alreadyDownloaded: true,
      downloadRequired: false,
    });
    expect(batch.tracks.filter((t) => t.downloadRequired)).toHaveLength(1);
    expect(downloadAudioMock.mock.calls.map(([trackId]) => trackId)).toEqual([
      'one',
      'two',
    ]);
    remaining.resolve({ title: 'two' });
    await vi.waitFor(() => expect(batch.phase).toBe('completed'));
    expect(setPlaylistTracksMock.mock.calls.at(-1)[1]).toEqual(['one', 'two']);
  });
  it('keeps an accepted batch and its collection target intact while resolving another source', async () => {
    fetchYoutubePlaylistMock
      .mockResolvedValueOnce({
        title: 'First batch',
        entries: [
          { id: 'first', title: 'First', alreadyDownloaded: false },
          { id: 'local', title: 'Local', alreadyDownloaded: true },
        ],
      })
      .mockResolvedValueOnce({
        title: 'Second batch',
        entries: [{ id: 'second', title: 'Second', alreadyDownloaded: false }],
      });
    const first = deferred();
    downloadAudioMock.mockImplementation((id) =>
      id === 'first' ? first.promise : Promise.resolve({ title: id }),
    );
    const session = await loadImportSession();
    session.setInput('first-source');
    await session.resolveSource();
    const id = await session.submitImport();
    expect(session.activity.batches[0].id).toBe(id);
    session.setInput('second-source');
    await session.resolveSource();
    expect(session.currentBatchId.value).toBe(null);
    expect(session.state.playlistTitle).toBe('Second batch');
    expect(session.state.isImporting).toBe(false);
    first.resolve({ title: 'First' });
    await vi.waitFor(() =>
      expect(session.activity.batches[0].phase).toBe('completed'),
    );
    expect(createPlaylistMock).toHaveBeenCalledWith('First batch');
    expect(setPlaylistTracksMock).toHaveBeenLastCalledWith(
      nextPlaylistId('First batch'),
      ['first', 'local'],
    );
    expect(session.state.playlistTitle).toBe('Second batch');
    expect(session.state.playlistTracks.map((t) => t.id)).toEqual(['second']);
    expect(session.activity.batches[0].tracks.map((t) => t.id)).toEqual([
      'first',
      'local',
    ]);
  });

  it('shares in-flight songs across batches and keeps two global download slots', async () => {
    fetchYoutubePlaylistMock
      .mockResolvedValueOnce({
        title: 'A',
        entries: [{ id: 'shared' }, { id: 'a' }],
      })
      .mockResolvedValueOnce({
        title: 'B',
        entries: [{ id: 'shared' }, { id: 'b' }],
      });
    const gates = new Map(['shared', 'a', 'b'].map((id) => [id, deferred()]));
    downloadAudioMock.mockImplementation((id) => gates.get(id).promise);
    const session = await loadImportSession();
    session.setInput('a-source');
    await session.resolveSource();
    const a = await session.submitImport();
    session.setInput('b-source');
    await session.resolveSource();
    const b = await session.submitImport();
    expect(downloadAudioMock.mock.calls.map(([id]) => id)).toEqual([
      'shared',
      'a',
    ]);
    await session.cancelBatch(a);
    expect(cancelAudioDownloadMock).toHaveBeenCalledWith('a');
    expect(cancelAudioDownloadMock).not.toHaveBeenCalledWith('shared');
    gates.get('a').resolve({ title: 'a' });
    await vi.waitFor(() => expect(downloadAudioMock).toHaveBeenCalledWith('b'));
    gates.get('shared').resolve({ title: 'shared' });
    gates.get('b').resolve({ title: 'b' });
    await vi.waitFor(() =>
      expect(
        session.activity.batches.find((batch) => batch.id === b).phase,
      ).toBe('completed'),
    );
    expect(
      downloadAudioMock.mock.calls.filter(([id]) => id === 'shared'),
    ).toHaveLength(1);
    expect(session.activity.batches.find((batch) => batch.id === a).phase).toBe(
      'cancelled',
    );
  });

  it('keeps collection finalization separate and retries a failed save without downloading again', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'Save batch',
      entries: [{ id: 'one' }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'one' });
    const save = deferred();
    setPlaylistTracksMock.mockImplementationOnce(() => save.promise);
    const session = await loadImportSession();
    session.setInput('save');
    await session.resolveSource();
    const id = await session.submitImport();
    await vi.waitFor(() =>
      expect(session.activity.batches[0].phase).toBe('finalizing'),
    );
    save.reject(new Error('private save path'));
    await vi.waitFor(() =>
      expect(session.activity.batches[0].phase).toBe('failed'),
    );
    expect(session.activity.batches[0].saveError).toBe(true);
    await session.retryBatch(id);
    expect(session.activity.batches[0].phase).toBe('completed');
    expect(downloadAudioMock).toHaveBeenCalledOnce();
    expect(createPlaylistMock).toHaveBeenCalledOnce();
  });

  it('waits for an abandoned download to settle before retrying the same key, without blocking other keys', async () => {
    fetchYoutubePlaylistMock
      .mockResolvedValueOnce({ title: 'Cancel', entries: [{ id: 'same' }] })
      .mockResolvedValueOnce({
        title: 'New',
        entries: [{ id: 'same' }, { id: 'other' }],
      });
    const old = deferred(),
      next = deferred(),
      other = deferred();
    let sameCalls = 0;
    downloadAudioMock.mockImplementation((id) =>
      id === 'same'
        ? ++sameCalls === 1
          ? old.promise
          : next.promise
        : other.promise,
    );
    const session = await loadImportSession();
    session.setInput('cancel');
    await session.resolveSource();
    const id = await session.submitImport();
    await session.cancelBatch(id);
    session.setInput('new');
    await session.resolveSource();
    const nextId = await session.submitImport();
    expect(downloadAudioMock.mock.calls.map(([id]) => id)).toEqual([
      'same',
      'other',
    ]);
    old.resolve({ title: 'abandoned' });
    await vi.waitFor(() => expect(sameCalls).toBe(2));
    next.resolve({ title: 'same' });
    other.resolve({ title: 'other' });
    await vi.waitFor(() =>
      expect(session.activity.batches.find((b) => b.id === nextId).phase).toBe(
        'completed',
      ),
    );
  });

  it('does not change a submitted selection or create duplicate work during double submission', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'Snapshot',
      entries: [{ id: 'one' }, { id: 'two' }],
    });
    const gate = deferred();
    downloadAudioMock.mockImplementation(() => gate.promise);
    const session = await loadImportSession();
    session.setInput('snapshot');
    await session.resolveSource();
    session.setTrackSelected('two', false);
    const [a, b] = await Promise.all([
      session.submitImport(),
      session.submitImport(),
    ]);
    expect(a).toBe(b);
    expect(downloadAudioMock).toHaveBeenCalledOnce();
    session.setTrackSelected('two', true);
    expect(session.activity.batches[0].tracks.map((t) => t.id)).toEqual([
      'one',
    ]);
    gate.resolve({ title: 'one' });
    await vi.waitFor(() =>
      expect(session.activity.batches[0].phase).toBe('completed'),
    );
  });

  it.each(['success', 'failure'])(
    'keeps a failed cancellation visible until the surviving download settles with %s',
    async (outcome) => {
      fetchYoutubePlaylistMock
        .mockResolvedValueOnce({ title: 'A', entries: [{ id: 'same' }] })
        .mockResolvedValueOnce({ title: 'B', entries: [{ id: 'same' }] });
      const download = deferred(),
        cancel = deferred();
      downloadAudioMock.mockReturnValue(download.promise);
      cancelAudioDownloadMock.mockReturnValueOnce(cancel.promise);
      const session = await loadImportSession();
      session.setInput('a');
      await session.resolveSource();
      const id = await session.submitImport();
      const stopping = session.cancelBatch(id);
      const repeatedStop = session.cancelTrackDownload('same', id);
      session.setInput('b');
      await session.resolveSource();
      const other = await session.submitImport();
      cancel.reject(new Error('private cancellation failure'));
      expect(await stopping).toBe(false);
      expect(await repeatedStop).toBe(false);
      expect(cancelAudioDownloadMock).toHaveBeenCalledOnce();
      expect(session.activity.batches[0].cancelError).toBe(true);
      expect(session.activity.batches[0].phase).toBe('running');
      expect(downloadAudioMock).toHaveBeenCalledOnce();
      if (outcome === 'success') download.resolve({ title: 'same' });
      else download.reject(new Error('network unavailable'));
      await vi.waitFor(() =>
        expect(
          session.activity.batches.every(
            (b) => b.phase === (outcome === 'success' ? 'completed' : 'failed'),
          ),
        ).toBe(true),
      );
      expect(
        session.activity.batches.find((b) => b.id === other).tracks[0].status,
      ).toBe(outcome === 'success' ? 'done' : 'error');
      expect(
        session.activity.batches.every((batch) => !batch.cancelError),
      ).toBe(true);
    },
  );

  it('preserves successful membership across overlapping batches for the same source collection', async () => {
    fetchYoutubePlaylistMock
      .mockResolvedValueOnce({
        title: 'Shared collection',
        entries: [{ id: 'one' }],
      })
      .mockResolvedValueOnce({
        title: 'Shared collection',
        entries: [{ id: 'two' }],
      });
    const one = deferred(),
      two = deferred();
    downloadAudioMock.mockImplementation((id) =>
      id === 'one' ? one.promise : two.promise,
    );
    const session = await loadImportSession();
    session.setInput('same-source');
    await session.resolveSource();
    await session.submitImport();
    await session.resolveSource();
    await session.submitImport();
    one.resolve({ title: 'one' });
    two.resolve({ title: 'two' });
    await vi.waitFor(() =>
      expect(
        session.activity.batches.every((b) => b.phase === 'completed'),
      ).toBe(true),
    );
    expect(createPlaylistMock).toHaveBeenCalledOnce();
    expect(new Set(setPlaylistTracksMock.mock.calls.at(-1)[1])).toEqual(
      new Set(['one', 'two']),
    );
  });

  it('ignores a source response superseded by a newer input', async () => {
    const gate = deferred();
    fetchYoutubePlaylistMock.mockReturnValueOnce(gate.promise);
    const session = await loadImportSession();
    session.setInput('old');
    const resolving = session.resolveSource();
    await flushPromises();
    session.setInput('new');
    gate.resolve({ title: 'Old', entries: [{ id: 'old' }] });
    await resolving;
    expect(session.state.input).toBe('new');
    expect(session.state.playlistTracks).toBe(null);
  });
  it('opens the current query in YT Music after checking the provider gate', async () => {
    const session = await loadImportSession();

    session.setInput('宇多田ヒカル First Love');
    await expect(session.openYoutubeMusicSearch()).resolves.toBe(true);

    expect(openYoutubeMusicSearchMock).toHaveBeenCalledWith(
      '宇多田ヒカル First Love',
    );
    expect(session.state.status).toBe(
      '已在系統瀏覽器開啟 YT Music，找到來源後請複製連結貼回此處。',
    );
    expect(session.state.statusType).toBe('success');
    expect(session.state.statusScope).toBe('surface');
    expect(session.state.isOpeningDiscovery).toBe(false);
  });

  it('does not request a gate or open a browser for an empty discovery query', async () => {
    const session = await loadImportSession();

    session.setInput('   ');
    await expect(session.openYoutubeMusicSearch()).resolves.toBe(false);

    expect(getFeatureConfirmationsMock).not.toHaveBeenCalled();
    expect(openYoutubeMusicSearchMock).not.toHaveBeenCalled();
    expect(session.state.status).toBe('');
    expect(session.state.statusType).toBe('idle');
  });

  it('routes discovery gate setup to Settings with its own operation', async () => {
    getFeatureConfirmationsMock.mockResolvedValueOnce({});
    const session = await loadImportSession();
    const { useFeatureGateAccess } = await import('./useFeatureGateAccess.js');

    session.setInput('Artist Song');
    await expect(session.openYoutubeMusicSearch()).resolves.toBe(false);

    expect(openYoutubeMusicSearchMock).not.toHaveBeenCalled();
    expect(useFeatureGateAccess().state.request).toMatchObject({
      featureId: 'provider-flow',
      source: 'import',
      operation: 'open-youtube-music-search',
    });
  });

  it('surfaces a bounded discovery error and clears the pending state', async () => {
    openYoutubeMusicSearchMock.mockRejectedValueOnce(
      new Error('private browser profile path'),
    );
    const session = await loadImportSession();

    session.setInput('Artist Song');
    await expect(session.openYoutubeMusicSearch()).resolves.toBe(false);

    expect(session.state.status).toBe('目前無法開啟 YT Music，請稍後再試。');
    expect(session.state.statusType).toBe('error');
    expect(session.state.status).not.toContain('private browser');
    expect(session.state.isOpeningDiscovery).toBe(false);
  });

  it('preserves the exact public import-session API', async () => {
    const session = await loadImportSession();

    expect(Object.keys(session).sort()).toEqual([
      'activity',
      'allSelected',
      'canConfirmImport',
      'canRetryFailed',
      'canUseConfirmButton',
      'cancelBatch',
      'cancelTrackDownload',
      'chooseDownloadDir',
      'confirmImport',
      'confirmImportLabel',
      'currentBatchId',
      'dismissBatch',
      'dominantFailureCode',
      'filterOptions',
      'getTrackStatusClass',
      'openDownloadDir',
      'openYoutubeMusicSearch',
      'playlistStats',
      'refreshConfig',
      'resetDownloadDir',
      'resolveSource',
      'retryBatch',
      'retryFailedTracks',
      'selectImportCandidate',
      'selectMissingTracks',
      'selectablePlaylistTracks',
      'setActiveFilter',
      'setInput',
      'setTrackSelected',
      'state',
      'submitImport',
      'toggleSelectAll',
      'visiblePlaylistTracks',
    ]);
  });

  it('does not send a cancel intent for a track that is not active', async () => {
    const session = await loadImportSession();

    await expect(session.cancelTrackDownload('not-active')).resolves.toBe(
      false,
    );
    expect(cancelAudioDownloadMock).not.toHaveBeenCalled();
  });

  it('keeps a resolved playlist preview in the shared session without downloading', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        {
          id: 'video-1',
          title: 'Song 1',
          artist: 'Singer',
          duration: 180,
          alreadyDownloaded: false,
        },
      ],
    });
    const first = await loadImportSession();

    first.setInput('https://youtube.com/playlist?list=abc');
    await first.resolveSource();
    const second = await loadImportSession();

    expect(downloadAudioMock).not.toHaveBeenCalled();
    expect(second.state.sourceKind).toBe('playlist');
    expect(second.state.playlistTracks).toEqual([
      {
        id: 'video-1',
        title: 'Song 1',
        artist: 'Singer',
        duration: 180,
        alreadyDownloaded: false,
        selected: true,
        status: 'pending',
        errorCode: null,
      },
    ]);
  });

  it('prevents a second source resolution while the first is pending', async () => {
    const pendingResolution = deferred();
    fetchYoutubePlaylistMock.mockReturnValueOnce(pendingResolution.promise);
    const session = await loadImportSession();
    session.setInput('playlist-id');

    const first = session.resolveSource();
    await vi.waitFor(() => {
      expect(fetchYoutubePlaylistMock).toHaveBeenCalledOnce();
    });
    await session.resolveSource();

    expect(fetchYoutubePlaylistMock).toHaveBeenCalledOnce();
    pendingResolution.resolve({ title: 'Set', entries: [] });
    await first;
  });

  it('treats non-playlist input as a confirmation-ready single source', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce(null);
    resolveImportSourceMock.mockResolvedValueOnce({
      input: 'https://youtube.com/watch?v=abc12345678',
      sourceVideoId: 'abc12345678',
      canonical: {
        title: 'Single Song',
        artist: 'Singer',
        duration: 180,
      },
      source: {
        playbackVideoId: 'abc12345678',
        title: 'Single Song',
        artist: 'Singer',
        duration: 180,
        thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
        alreadyDownloaded: false,
      },
      recommendedCandidate: {
        playbackVideoId: 'aud12345678',
        title: 'Single Song',
        artist: 'Singer',
        duration: 180,
        thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
        playbackKind: 'yt-music-song',
        alreadyDownloaded: false,
      },
      candidates: [
        {
          playbackVideoId: 'aud12345678',
          title: 'Single Song',
          artist: 'Singer',
          duration: 180,
          playbackKind: 'yt-music-song',
          alreadyDownloaded: false,
        },
      ],
      downloadInput: 'aud12345678',
    });
    downloadAudioMock.mockResolvedValueOnce({ title: 'Single Song' });
    const session = await loadImportSession();

    session.setInput('https://youtube.com/watch?v=abc12345678');
    await session.resolveSource();

    expect(downloadAudioMock).not.toHaveBeenCalled();
    expect(resolveImportSourceMock).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc12345678',
    );
    expect(fetchVideoMetadataMock).not.toHaveBeenCalled();
    expect(session.state.sourceKind).toBe('single');
    expect(session.confirmImportLabel.value).toBe('下載這首');
    expect(session.state.selectedCandidateId).toBe('aud12345678');
    expect(session.state.singleTrack).toMatchObject({
      id: 'aud12345678',
      title: 'Single Song',
      artist: 'Singer',
      duration: 180,
      thumbnailUrl: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
      alreadyDownloaded: false,
      downloadInput: 'aud12345678',
      sourceVideoId: 'abc12345678',
      playbackKind: 'yt-music-song',
      selected: true,
      status: 'pending',
      errorCode: null,
    });
    expect(session.canConfirmImport.value).toBe(true);

    await session.confirmImport();

    expect(downloadAudioMock).toHaveBeenCalledWith('aud12345678');
    expect(session.state.status).toBe('已下載：Single Song');
    expect(session.state.statusScope).toBe('object');
    expect(session.state.sourceKind).toBe('single');
    expect(session.state.singleTrack.status).toBe('done');
    expect(session.canConfirmImport.value).toBe(false);
  });

  it('keeps the selected single source object visible while its download is running', async () => {
    const pendingDownload = deferred();
    resolveImportSourceMock.mockResolvedValueOnce({
      input: 'abc12345678',
      sourceVideoId: 'abc12345678',
      source: { playbackVideoId: 'abc12345678', title: 'Song' },
      recommendedCandidate: {
        playbackVideoId: 'abc12345678',
        title: 'Song',
      },
      candidates: [{ playbackVideoId: 'abc12345678', title: 'Song' }],
    });
    downloadAudioMock.mockReturnValueOnce(pendingDownload.promise);
    const session = await loadImportSession();

    session.setInput('abc12345678');
    await session.resolveSource();
    const importPromise = session.confirmImport();
    await flushPromises();

    expect(session.state.sourceKind).toBe('single');
    expect(session.state.singleTrack.status).toBe('downloading');
    expect(session.state.isImporting).toBe(true);

    pendingDownload.resolve({ title: 'Song' });
    await importPromise;
    expect(session.state.singleTrack.status).toBe('done');
  });

  it('preserves a completed candidate object when another source version is selected', async () => {
    resolveImportSourceMock.mockResolvedValueOnce({
      input: 'Song',
      sourceVideoId: 'source00001',
      source: { playbackVideoId: 'source00001', title: 'Song' },
      recommendedCandidate: {
        playbackVideoId: 'audio000001',
        title: 'Song · Audio',
      },
      candidates: [
        { playbackVideoId: 'audio000001', title: 'Song · Audio' },
        { playbackVideoId: 'live0000001', title: 'Song · Live' },
      ],
    });
    downloadAudioMock.mockResolvedValueOnce({ title: 'Song · Audio' });
    const session = await loadImportSession();

    session.setInput('Song');
    await session.resolveSource();
    await session.confirmImport();
    session.selectImportCandidate('live0000001');

    expect(session.state.singleResolution.candidates[0].status).toBe('done');
    expect(session.state.singleTrack).toMatchObject({
      id: 'live0000001',
      status: 'pending',
    });
  });

  it('resolves a free-text query through the generic import bridge', async () => {
    window.Utawakui.resolveImportInput = resolveImportInputMock;
    resolveImportInputMock.mockResolvedValueOnce({
      kind: 'single',
      inputKind: 'text-query',
      resolution: {
        input: 'Artist Song',
        canonical: { title: 'Artist Song' },
        source: null,
        recommendedCandidate: {
          playbackVideoId: 'topic000001',
          title: 'Song',
          artist: 'Artist - Topic',
          duration: 211,
          playbackKind: 'youtube-topic-audio',
          recordingFit: 'release-recording',
          alreadyDownloaded: false,
        },
        candidates: [
          {
            playbackVideoId: 'topic000001',
            title: 'Song',
            artist: 'Artist - Topic',
            duration: 211,
            playbackKind: 'youtube-topic-audio',
            recordingFit: 'release-recording',
            alreadyDownloaded: false,
          },
        ],
      },
    });
    const session = await loadImportSession();

    session.setInput('Artist Song');
    await session.resolveSource();

    expect(resolveImportInputMock).toHaveBeenCalledWith('Artist Song');
    expect(fetchYoutubePlaylistMock).not.toHaveBeenCalled();
    expect(session.state.sourceKind).toBe('single');
    expect(session.state.selectedCandidateId).toBe('topic000001');
    expect(session.state.singleTrack).toMatchObject({
      id: 'topic000001',
      recordingFit: 'release-recording',
    });
    expect(session.canConfirmImport.value).toBe(true);
    expect(session.state.status).toBe('');
    expect(session.state.statusType).toBe('idle');
  });

  it('keeps ambiguous search candidates visible without auto-selecting one', async () => {
    window.Utawakui.resolveImportInput = resolveImportInputMock;
    resolveImportInputMock.mockResolvedValueOnce({
      kind: 'single',
      inputKind: 'text-query',
      resolution: {
        input: 'Artist Song',
        canonical: { title: 'Artist Song' },
        source: null,
        recommendedCandidate: null,
        candidates: [
          {
            playbackVideoId: 'live1234567',
            title: 'Song Live',
            artist: 'Artist',
            playbackKind: 'youtube-live',
            recordingFit: 'mismatch',
            confidence: 'low',
            alreadyDownloaded: false,
          },
        ],
      },
    });
    const session = await loadImportSession();

    session.setInput('Artist Song');
    await session.resolveSource();

    expect(session.state.sourceKind).toBe('single');
    expect(session.state.singleTrack).toBe(null);
    expect(session.state.selectedCandidateId).toBe(null);
    expect(session.canConfirmImport.value).toBe(false);
    expect(session.state.status).toBe('');
    expect(session.state.statusType).toBe('idle');

    session.selectImportCandidate('live1234567');
    expect(session.state.singleTrack).toMatchObject({ id: 'live1234567' });
    expect(session.canConfirmImport.value).toBe(true);
  });

  it('explains deferred Spotify URLs without calling legacy YouTube handlers', async () => {
    window.Utawakui.resolveImportInput = resolveImportInputMock;
    resolveImportInputMock.mockResolvedValueOnce({
      kind: 'deferred',
      platform: 'spotify',
    });
    const session = await loadImportSession();

    session.setInput('https://open.spotify.com/track/123');
    await session.resolveSource();

    expect(session.state.sourceKind).toBe('idle');
    expect(session.state.status).toBe('Spotify 連結轉換尚未開放');
    expect(session.state.statusType).toBe('pending');
    expect(fetchYoutubePlaylistMock).not.toHaveBeenCalled();
  });

  it.each([
    ['apple-music', 'Apple Music 連結轉換尚未開放'],
    ['future-provider', '未知平台 連結轉換尚未開放'],
  ])('labels a deferred %s input', async (platform, message) => {
    window.Utawakui.resolveImportInput = resolveImportInputMock;
    resolveImportInputMock.mockResolvedValueOnce({
      kind: 'deferred',
      platform,
    });
    const session = await loadImportSession();

    session.setInput('https://provider.example/item');
    await session.resolveSource();

    expect(session.state.status).toBe(message);
    expect(session.state.statusType).toBe('pending');
  });

  it('builds an album preview from the generic import bridge', async () => {
    window.Utawakui.resolveImportInput = resolveImportInputMock;
    resolveImportInputMock.mockResolvedValueOnce({
      kind: 'playlist',
      collectionKind: 'album',
      releaseType: 'ep',
      releaseDate: { value: '2026', precision: 'year' },
      title: 'Album - Example Album',
      thumbnailUrl: 'https://i.ytimg.com/example.jpg',
      source: { platform: 'yt-music', id: 'OLAK5uy_example' },
      entries: [{ id: 'song-1', title: 'Song 1' }],
    });
    const session = await loadImportSession();

    session.setInput('https://music.youtube.com/playlist?list=OLAK5uy_example');
    await session.resolveSource();

    expect(session.state.sourceKind).toBe('playlist');
    expect(session.state.collectionKind).toBe('album');
    expect(session.state.collectionReleaseType).toBe('ep');
    expect(session.state.collectionReleaseDate).toEqual({
      value: '2026',
      precision: 'year',
    });
    expect(session.state.playlistTitle).toBe('Example Album');
    expect(session.state.collectionSource).toEqual({
      platform: 'yt-music',
      id: 'OLAK5uy_example',
    });
    expect(session.state.collectionThumbnailUrl).toBe(
      'https://i.ytimg.com/example.jpg',
    );
    session.setInput('next');
    expect(session.state.collectionReleaseDate).toBeNull();
  });

  it('reports an empty playlist returned by the generic import bridge', async () => {
    window.Utawakui.resolveImportInput = resolveImportInputMock;
    resolveImportInputMock.mockResolvedValueOnce({
      kind: 'playlist',
      collectionKind: 'playlist',
      entries: [],
    });
    const session = await loadImportSession();

    session.setInput('https://youtube.com/playlist?list=PL123');
    await session.resolveSource();

    expect(session.state.sourceKind).toBe('idle');
    expect(session.state.status).toBe('這個播放清單沒有可匯入的曲目');
    expect(session.state.statusType).toBe('empty');
  });

  it.each([
    ['query-too-long', '搜尋文字過長，請縮短歌曲名稱或歌手名稱'],
    ['unsupported-url', '目前只支援歌曲名稱、YouTube 與 YouTube Music 連結'],
  ])('explains generic unsupported input: %s', async (reason, message) => {
    window.Utawakui.resolveImportInput = resolveImportInputMock;
    resolveImportInputMock.mockResolvedValueOnce({
      kind: 'unsupported',
      reason,
    });
    const session = await loadImportSession();

    session.setInput('unsupported');
    await session.resolveSource();

    expect(session.state.status).toBe(message);
    expect(session.state.statusType).toBe('error');
  });

  it('reports a search with no usable candidates', async () => {
    window.Utawakui.resolveImportInput = resolveImportInputMock;
    resolveImportInputMock.mockResolvedValueOnce({
      kind: 'single',
      resolution: {
        source: null,
        recommendedCandidate: null,
        candidates: [],
      },
    });
    const session = await loadImportSession();

    session.setInput('missing song');
    await session.resolveSource();

    expect(session.state.sourceKind).toBe('idle');
    expect(session.state.status).toBe('沒有找到可用音源');
    expect(session.state.statusType).toBe('empty');
  });

  it('distinguishes a provider search failure from a genuine empty result', async () => {
    window.Utawakui.resolveImportInput = resolveImportInputMock;
    resolveImportInputMock.mockRejectedValueOnce(
      new Error(
        `${APP_ERROR_PREFIX}${JSON.stringify({
          code: 'PROVIDER_SEARCH_FAILED',
          severity: 'error',
          title: 'YT Music／YouTube 搜尋未完成',
          message: '目前無法完成 YT Music／YouTube 搜尋，請稍後再試。',
          context: {
            reason: 'network-error',
            retryable: true,
            diagnosticRecorded: true,
          },
        })}`,
      ),
    );
    const session = await loadImportSession();

    session.setInput('\u96e8\u611b');
    await session.resolveSource();

    expect(session.state.sourceKind).toBe('idle');
    expect(session.state.status).toBe(
      '搜尋 YT Music／YouTube 失敗：網路連線失敗',
    );
    expect(session.state.statusType).toBe('error');
    expect(session.state.failureHint).toBe('請確認網路連線後再重試。');
  });

  it('contains a malformed generic import response as a safe resolve failure', async () => {
    window.Utawakui.resolveImportInput = resolveImportInputMock;
    resolveImportInputMock.mockResolvedValueOnce({ kind: 'unexpected' });
    const session = await loadImportSession();

    session.setInput('Artist Song');
    await session.resolveSource();

    expect(session.state.sourceKind).toBe('idle');
    expect(session.state.status).toBe('找不到來源：下載失敗');
  });

  it('lets the selected single candidate decide the downloaded video id', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce(null);
    resolveImportSourceMock.mockResolvedValueOnce({
      input: 'https://youtube.com/watch?v=mv123456789',
      sourceVideoId: 'mv123456789',
      canonical: {
        title: 'Single Song',
        artist: 'Singer',
        duration: 180,
      },
      source: {
        playbackVideoId: 'mv123456789',
        title: 'Single Song Official MV',
        artist: 'Singer',
        duration: 220,
        playbackKind: 'youtube-official-mv',
        alreadyDownloaded: false,
      },
      recommendedCandidate: {
        playbackVideoId: 'aud12345678',
        title: 'Single Song',
        artist: 'Singer',
        duration: 180,
        playbackKind: 'yt-music-song',
        alreadyDownloaded: false,
      },
      candidates: [
        {
          playbackVideoId: 'aud12345678',
          title: 'Single Song',
          artist: 'Singer',
          duration: 180,
          playbackKind: 'yt-music-song',
          alreadyDownloaded: false,
        },
        {
          playbackVideoId: 'mv123456789',
          title: 'Single Song Official MV',
          artist: 'Singer',
          duration: 220,
          playbackKind: 'youtube-official-mv',
          alreadyDownloaded: false,
        },
      ],
    });
    downloadAudioMock.mockResolvedValueOnce({
      title: 'Single Song Official MV',
    });
    const session = await loadImportSession();

    session.setInput('https://youtube.com/watch?v=mv123456789');
    await session.resolveSource();
    session.selectImportCandidate('mv123456789');
    await session.confirmImport();

    expect(session.state.selectedCandidateId).toBe('mv123456789');
    expect(downloadAudioMock).toHaveBeenCalledWith('mv123456789');
  });

  it('downloads only selected playlist tracks after confirmation', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        {
          id: 'selected',
          title: 'Selected',
          alreadyDownloaded: false,
        },
        {
          id: 'unselected',
          title: 'Unselected',
          alreadyDownloaded: false,
        },
        {
          id: 'already',
          title: 'Already',
          alreadyDownloaded: true,
        },
      ],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setTrackSelected(session.state.playlistTracks[1].id, false);
    await session.confirmImport();

    expect(downloadAudioMock).toHaveBeenCalledTimes(1);
    expect(downloadAudioMock).toHaveBeenCalledWith('selected');
    expect(session.state.playlistTracks.map((track) => track.status)).toEqual([
      'done',
      'pending',
      'pending',
    ]);
  });

  it('creates a local playlist named after the source title once tracks finish downloading', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(createPlaylistMock).toHaveBeenCalledWith('My Setlist');
    expect(setPlaylistTracksMock).toHaveBeenCalledWith(
      nextPlaylistId('My Setlist'),
      ['song-1'],
    );
    expect(session.state.status).toBe('已加入播放清單「My Setlist」');
  });

  it('includes already-downloaded-but-selected tracks in the synced playlist', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        { id: 'song-1', title: 'Song 1', alreadyDownloaded: false },
        { id: 'song-2', title: 'Song 2', alreadyDownloaded: true },
      ],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setTrackSelected(session.state.playlistTracks[1].id, true);
    await session.confirmImport();

    expect(setPlaylistTracksMock).toHaveBeenCalledWith(
      nextPlaylistId('My Setlist'),
      ['song-1', 'song-2'],
    );
  });

  it('sends a structurally cloneable payload to upsertAlbum for album sources', async () => {
    // Regression test: state.collectionSource used to be assigned straight
    // onto reactive() state, so reading it back for the upsertAlbum payload
    // handed ipcRenderer.invoke a Vue reactive Proxy instead of a plain
    // object. Proxies fail structured cloning — the real IPC boundary threw
    // "An object could not be cloned." structuredClone() below exercises the
    // same clone algorithm Electron's ipcRenderer.invoke uses, so this test
    // fails the same way a mock-only assertion wouldn't.
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Album',
      kind: 'album',
      source: { platform: 'youtube', id: 'OLAK5uy_abc' },
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(upsertAlbumMock).toHaveBeenCalledTimes(1);
    const payload = upsertAlbumMock.mock.calls[0][0];
    expect(() => structuredClone(payload)).not.toThrow();
    expect(payload).toEqual({
      name: 'My Album',
      source: { platform: 'youtube', id: 'OLAK5uy_abc' },
      trackIds: ['song-1'],
      thumbnailUrl: null,
    });
    expect(session.state.status).toBe('已加入專輯「My Album」');
  });

  it('strips the "Album - " prefix yt-dlp puts on YT Music album titles', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'Album - strobo',
      kind: 'album',
      source: { platform: 'youtube', id: 'OLAK5uy_abc' },
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(session.state.playlistTitle).toBe('strobo');

    await session.confirmImport();

    expect(upsertAlbumMock.mock.calls[0][0].name).toBe('strobo');
  });

  it('keeps a backend-resolved YT Music album metadata title intact', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: '海螺記',
      kind: 'album',
      source: {
        platform: 'youtube',
        id: 'OLAK5uy_nBWL9lmnXFFbywEUiSJAHvuCyoA62FZAo',
      },
      entries: [
        { id: 'qog79Ke0IvQ', title: '門縫後的光', alreadyDownloaded: true },
      ],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(session.state.playlistTitle).toBe('海螺記');

    await session.confirmImport();

    expect(upsertAlbumMock.mock.calls[0][0].name).toBe('海螺記');
  });

  it('does not strip an "Album - " prefix on an ordinary (non-album) playlist title', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'Album - My Mix',
      kind: 'playlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(session.state.playlistTitle).toBe('Album - My Mix');
  });

  it("forwards the playlist's thumbnailUrl into the upsertAlbum payload", async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Album',
      kind: 'album',
      source: { platform: 'youtube', id: 'OLAK5uy_abc' },
      thumbnailUrl: 'https://i.ytimg.com/vi/album-art/hqdefault.jpg',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(upsertAlbumMock.mock.calls[0][0].thumbnailUrl).toBe(
      'https://i.ytimg.com/vi/album-art/hqdefault.jpg',
    );
  });

  it('still syncs an album whose tracks are all already downloaded', async () => {
    // Regression test: re-importing an album where every track already
    // exists locally used to be a dead end — createPreviewTrack defaulted
    // alreadyDownloaded tracks to unselected, the checkbox to select them
    // was disabled, and hasImportableSelection required a downloadable
    // selection to enable the confirm button at all. The album could never
    // be (re-)created even though every track was already on disk.
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'Florskyn',
      kind: 'album',
      source: { platform: 'youtube', id: 'OLAK5uy_florskyn' },
      entries: Array.from({ length: 10 }, (_, i) => ({
        id: `song-${i + 1}`,
        title: `Song ${i + 1}`,
        alreadyDownloaded: true,
      })),
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(session.state.playlistTracks.every((track) => track.selected)).toBe(
      true,
    );
    expect(session.confirmImportLabel.value).toBe('加入 10 首');
    expect(session.canUseConfirmButton.value).toBe(true);

    await session.confirmImport();

    expect(downloadAudioMock).not.toHaveBeenCalled();
    expect(upsertAlbumMock).toHaveBeenCalledTimes(1);
    expect(upsertAlbumMock.mock.calls[0][0].trackIds).toEqual(
      Array.from({ length: 10 }, (_, i) => `song-${i + 1}`),
    );
    expect(session.state.status).toBe('已加入專輯「Florskyn」');
  });

  it('re-syncs the same local playlist on retry instead of creating a duplicate', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        { id: 'ok-song', title: 'OK Song', alreadyDownloaded: false },
        { id: 'bad-song', title: 'Bad Song', alreadyDownloaded: false },
      ],
    });
    downloadAudioMock.mockImplementation(async (id) => {
      if (id === 'bad-song') throw new Error('network error');
      return { title: 'ok' };
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(createPlaylistMock).toHaveBeenCalledTimes(1);
    expect(setPlaylistTracksMock).toHaveBeenNthCalledWith(
      1,
      nextPlaylistId('My Setlist'),
      ['ok-song'],
    );

    downloadAudioMock.mockResolvedValueOnce({ title: 'ok' });
    await session.retryFailedTracks();

    expect(createPlaylistMock).toHaveBeenCalledTimes(1);
    expect(setPlaylistTracksMock).toHaveBeenNthCalledWith(
      2,
      nextPlaylistId('My Setlist'),
      ['ok-song', 'bad-song'],
    );
  });

  it('imports remaining selections in a second batch while retaining local and completed membership', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'Two batches',
      entries: [
        { id: 'first', title: 'First', alreadyDownloaded: false },
        { id: 'later', title: 'Later', alreadyDownloaded: false },
        { id: 'local', title: 'Local', alreadyDownloaded: true },
      ],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    const session = await loadImportSession();
    session.setInput('playlist-id');
    await session.resolveSource();
    session.setTrackSelected('later', false);
    expect(session.confirmImportLabel.value).toBe('下載 1 首');
    await session.confirmImport();
    expect(setPlaylistTracksMock).toHaveBeenLastCalledWith(
      nextPlaylistId('Two batches'),
      ['first', 'local'],
    );

    session.setTrackSelected('later', true);
    expect(session.confirmImportLabel.value).toBe('下載 1 首');
    await session.confirmImport();
    expect(downloadAudioMock.mock.calls.map(([id]) => id)).toEqual([
      'first',
      'later',
    ]);
    expect(createPlaylistMock).toHaveBeenCalledOnce();
    expect(setPlaylistTracksMock).toHaveBeenLastCalledWith(
      nextPlaylistId('Two batches'),
      ['first', 'later', 'local'],
    );
  });

  it('downloads at most two playlist tracks concurrently and leaves later tracks pending', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [1, 2, 3].map((number) => ({
        id: `song-${number}`,
        title: `Song ${number}`,
        alreadyDownloaded: false,
      })),
    });
    const gates = new Map(
      [1, 2, 3].map((number) => [`song-${number}`, deferred()]),
    );
    downloadAudioMock.mockImplementation((id) => gates.get(id).promise);
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    const importPromise = session.confirmImport();
    await flushPromises();

    expect(downloadAudioMock.mock.calls.map(([id]) => id)).toEqual([
      'song-1',
      'song-2',
    ]);
    expect(
      session.state.playlistTracks.map(({ id, status }) => ({ id, status })),
    ).toEqual([
      { id: 'song-1', status: 'downloading' },
      { id: 'song-2', status: 'downloading' },
      { id: 'song-3', status: 'pending' },
    ]);

    gates.get('song-1').resolve({ title: 'Song 1' });
    await flushPromises();
    expect(downloadAudioMock).toHaveBeenCalledWith('song-3');

    gates.get('song-2').resolve({ title: 'Song 2' });
    gates.get('song-3').resolve({ title: 'Song 3' });
    await importPromise;
  });

  it('cancels one active playlist track and admits the next pending track', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [1, 2, 3].map((number) => ({
        id: `song-${number}`,
        title: `Song ${number}`,
        alreadyDownloaded: false,
      })),
    });
    const gates = new Map(
      [1, 2, 3].map((number) => [`song-${number}`, deferred()]),
    );
    downloadAudioMock.mockImplementation((id) => gates.get(id).promise);
    cancelAudioDownloadMock.mockImplementationOnce(async (id) => {
      gates.get(id).reject(
        new Error(
          `${APP_ERROR_PREFIX}${JSON.stringify({
            code: 'IMPORT_DOWNLOAD_CANCELLED',
            severity: 'info',
            title: '匯入已停止',
            message: '這首曲目已停止下載。',
          })}`,
        ),
      );
      return true;
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    const importPromise = session.confirmImport();
    await flushPromises();

    await expect(session.cancelTrackDownload('song-1')).resolves.toBe(true);
    await flushPromises();

    expect(cancelAudioDownloadMock).toHaveBeenCalledWith('song-1');
    expect(downloadAudioMock.mock.calls.map(([id]) => id)).toEqual([
      'song-1',
      'song-2',
      'song-3',
    ]);
    expect(
      session.state.playlistTracks.map(({ id, status }) => ({ id, status })),
    ).toEqual([
      { id: 'song-1', status: 'pending' },
      { id: 'song-2', status: 'downloading' },
      { id: 'song-3', status: 'downloading' },
    ]);

    gates.get('song-2').resolve({ title: 'Song 2' });
    gates.get('song-3').resolve({ title: 'Song 3' });
    await importPromise;
  });

  it('creates no playlist when nothing ends up selected and downloaded', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockRejectedValue(new Error('network error'));
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(createPlaylistMock).not.toHaveBeenCalled();
  });

  it('falls back to metadata preview when the resolver preload API is stale', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce(null);
    delete window.Utawakui.resolveImportSource;
    fetchVideoMetadataMock.mockResolvedValueOnce({
      id: 'abc12345678',
      title: 'Single Song',
      artist: 'Singer',
      duration: 180,
      alreadyDownloaded: false,
    });
    downloadAudioMock.mockResolvedValueOnce({ title: 'Single Song' });
    const session = await loadImportSession();

    session.setInput('https://youtube.com/watch?v=abc12345678');
    await session.resolveSource();
    await session.confirmImport();

    expect(fetchVideoMetadataMock).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc12345678',
    );
    expect(downloadAudioMock).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc12345678',
    );
  });

  it('keeps single import usable when the metadata preload API is stale', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce(null);
    delete window.Utawakui.resolveImportSource;
    delete window.Utawakui.fetchVideoMetadata;
    downloadAudioMock.mockResolvedValueOnce({ title: 'Fallback Song' });
    const session = await loadImportSession();

    session.setInput('https://youtube.com/watch?v=abc12345678');
    await session.resolveSource();

    expect(session.state.sourceKind).toBe('single');
    expect(session.state.singleTrack).toEqual({
      id: 'https://youtube.com/watch?v=abc12345678',
      title: 'https://youtube.com/watch?v=abc12345678',
      alreadyDownloaded: false,
      selected: true,
      status: 'pending',
      errorCode: null,
    });
    expect(session.canConfirmImport.value).toBe(true);

    await session.confirmImport();

    expect(downloadAudioMock).toHaveBeenCalledWith(
      'https://youtube.com/watch?v=abc12345678',
    );
  });

  it('clears the resolved preview when the typed source changes', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'video-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    expect(session.state.playlistTracks).not.toBe(null);
    session.setInput('another-source');

    expect(session.state.input).toBe('another-source');
    expect(session.state.sourceKind).toBe('idle');
    expect(session.state.singleTrack).toBe(null);
    expect(session.state.playlistTracks).toBe(null);
    expect(session.state.playlistTitle).toBe(null);
    expect(session.state.createdPlaylistId).toBe(null);
    expect(session.state.activeFilter).toBe('all');
  });

  it('keeps a blank search quiet and does not query the backend', async () => {
    const session = await loadImportSession();

    session.setInput('   ');
    await session.resolveSource();

    expect(fetchYoutubePlaylistMock).not.toHaveBeenCalled();
    expect(session.state.status).toBe('');
    expect(session.state.statusType).toBe('idle');
  });

  it('clears the previous preview and outcome when the query changes', async () => {
    window.Utawakui.resolveImportInput = resolveImportInputMock;
    resolveImportInputMock.mockResolvedValueOnce({
      kind: 'single',
      resolution: {
        source: null,
        recommendedCandidate: {
          playbackVideoId: 'topic000001',
          title: 'Old Song',
          artist: 'Artist',
          duration: 211,
          playbackKind: 'youtube-topic-audio',
        },
        candidates: [],
      },
    });
    const session = await loadImportSession();

    session.setInput('Old Song');
    await session.resolveSource();
    expect(session.state.sourceKind).toBe('single');

    session.setInput('New Song');

    expect(session.state.sourceKind).toBe('idle');
    expect(session.state.singleTrack).toBe(null);
    expect(session.state.status).toBe('');
    expect(session.state.statusType).toBe('idle');
  });

  it('routes provider-flow setup to Settings before resolving a source', async () => {
    getFeatureConfirmationsMock.mockResolvedValueOnce({});
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'video-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    const session = await loadImportSession();
    const { useAppView } = await import('./useAppView.js');
    const { useFeatureGateAccess } = await import('./useFeatureGateAccess.js');

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(fetchYoutubePlaylistMock).not.toHaveBeenCalled();
    expect(confirmFeatureGateMock).not.toHaveBeenCalled();
    expect(useAppView().activeView.value).toBe('settings');
    expect(useFeatureGateAccess().state.request).toMatchObject({
      featureId: 'provider-flow',
      source: 'import',
      operation: 'resolve-source',
    });
    expect(session.state.status).toBe('請先到設定啟用外部來源');
    expect(session.state.statusType).toBe('pending');
  });

  it('clears the preview and surfaces a classified error message when resolving throws', async () => {
    fetchYoutubePlaylistMock.mockRejectedValueOnce(
      new Error('utawakui-download-failed:network-error'),
    );
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(session.state.sourceKind).toBe('idle');
    expect(session.state.status).toBe('找不到來源：網路連線失敗');
    expect(session.state.statusType).toBe('error');
    expect(session.state.failureHint).toBe('請確認網路連線後再重試。');
  });

  it('routes missing provider tools back to Settings instead of download-failure copy', async () => {
    fetchYoutubePlaylistMock.mockRejectedValueOnce(
      new Error(
        `${APP_ERROR_PREFIX}${JSON.stringify({
          code: 'FEATURE_DEPENDENCY_MISSING',
          severity: 'warning',
          title: '需要先準備外部來源工具',
          message: '請先到設定頁準備「線上來源下載工具」，再使用外部來源。',
          actionLabel: '前往設定',
          context: {
            featureId: 'provider-flow',
            dependencyId: 'yt-dlp-provider-tool',
          },
        })}`,
      ),
    );
    const session = await loadImportSession();
    const { useAppView } = await import('./useAppView.js');
    const { useFeatureGateAccess } = await import('./useFeatureGateAccess.js');

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(useAppView().activeView.value).toBe('settings');
    expect(useFeatureGateAccess().state.request).toMatchObject({
      featureId: 'provider-flow',
      kind: 'setup',
      source: 'import',
      operation: 'provider-tool',
      context: { dependencyId: 'yt-dlp-provider-tool' },
    });
    expect(session.state.status).toBe('請到設定完成外部來源準備。');
    expect(session.state.statusType).toBe('pending');
    expect(session.state.failureHint).toBe(
      '請在設定的「進階功能」中準備外部來源工具。',
    );
  });

  it('falls back to the unknown label for an unclassified resolve error', async () => {
    fetchYoutubePlaylistMock.mockRejectedValueOnce(new Error('network down'));
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();

    expect(session.state.status).toBe('找不到來源：下載失敗');
    expect(session.state.statusType).toBe('error');
  });

  it('surfaces a classified download error for a single-track import without throwing', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce(null);
    resolveImportSourceMock.mockResolvedValueOnce({
      input: 'abc12345678',
      sourceVideoId: 'abc12345678',
      source: { playbackVideoId: 'abc12345678', title: 'Song' },
      recommendedCandidate: { playbackVideoId: 'abc12345678', title: 'Song' },
      candidates: [{ playbackVideoId: 'abc12345678', title: 'Song' }],
    });
    downloadAudioMock.mockRejectedValueOnce(
      new Error('utawakui-download-failed:disk-full'),
    );
    const session = await loadImportSession();

    session.setInput('abc12345678');
    await session.resolveSource();
    await session.confirmImport();

    expect(session.state.status).toBe('下載失敗：儲存空間不足');
    expect(session.state.statusType).toBe('error');
    expect(session.state.sourceKind).toBe('single');
    expect(session.state.singleTrack.status).toBe('error');
    expect(session.state.singleTrack.errorCode).toBe('disk-full');
    expect(session.state.isImporting).toBe(false);
  });

  it('cancels the active single-track download and returns it to pending', async () => {
    resolveImportSourceMock.mockResolvedValueOnce({
      input: 'abc12345678',
      sourceVideoId: 'abc12345678',
      source: { playbackVideoId: 'abc12345678', title: 'Song' },
      recommendedCandidate: { playbackVideoId: 'abc12345678', title: 'Song' },
      candidates: [{ playbackVideoId: 'abc12345678', title: 'Song' }],
    });
    const gate = deferred();
    downloadAudioMock.mockReturnValueOnce(gate.promise);
    cancelAudioDownloadMock.mockImplementationOnce(async () => {
      gate.reject(
        new Error(
          `${APP_ERROR_PREFIX}${JSON.stringify({
            code: 'IMPORT_DOWNLOAD_CANCELLED',
            severity: 'info',
            title: '匯入已停止',
            message: '這首曲目已停止下載。',
          })}`,
        ),
      );
      return true;
    });
    const session = await loadImportSession();

    session.setInput('abc12345678');
    await session.resolveSource();
    const download = session.confirmImport();
    await flushPromises();
    expect(session.state.singleTrack.status).toBe('downloading');

    await session.confirmImport();
    await download;

    expect(cancelAudioDownloadMock).toHaveBeenCalledWith('abc12345678');
    expect(session.state.singleTrack.status).toBe('pending');
    expect(session.state.status).toBe('已停止下載');
    expect(session.state.statusType).toBe('pending');
  });

  it('returns a single track to pending when download discovers missing provider tools', async () => {
    resolveImportSourceMock.mockResolvedValueOnce({
      input: 'abc12345678',
      sourceVideoId: 'abc12345678',
      source: { playbackVideoId: 'abc12345678', title: 'Song' },
      recommendedCandidate: { playbackVideoId: 'abc12345678', title: 'Song' },
      candidates: [{ playbackVideoId: 'abc12345678', title: 'Song' }],
    });
    downloadAudioMock.mockRejectedValueOnce(
      new Error(
        `${APP_ERROR_PREFIX}${JSON.stringify({
          code: 'FEATURE_DEPENDENCY_MISSING',
          severity: 'warning',
          title: '需要先準備外部來源工具',
          message: '請先到設定頁準備「線上來源下載工具」，再使用外部來源。',
          actionLabel: '前往設定',
          context: {
            featureId: 'provider-flow',
            dependencyId: 'yt-dlp-provider-tool',
          },
        })}`,
      ),
    );
    const session = await loadImportSession();
    const { useAppView } = await import('./useAppView.js');

    session.setInput('abc12345678');
    await session.resolveSource();
    await session.confirmImport();

    expect(useAppView().activeView.value).toBe('settings');
    expect(session.state.status).toBe('請到設定完成外部來源準備。');
    expect(session.state.statusType).toBe('pending');
    expect(session.state.singleTrack.status).toBe('pending');
    expect(session.state.singleTrack.errorCode).toBe(null);
    expect(session.state.isImporting).toBe(false);
  });

  it('toggleSelectAll selects everything selectable, then deselects it all on a second call', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        { id: 'song-1', title: 'Song 1', alreadyDownloaded: false },
        { id: 'song-2', title: 'Song 2', alreadyDownloaded: false },
        { id: 'song-3', title: 'Song 3', alreadyDownloaded: true },
      ],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setTrackSelected('song-1', false);
    session.setTrackSelected('song-2', false);

    expect(session.allSelected.value).toBe(false);

    session.toggleSelectAll();
    expect(
      session.state.playlistTracks
        .filter((t) => !t.alreadyDownloaded)
        .every((t) => t.selected),
    ).toBe(true);
    expect(session.allSelected.value).toBe(true);

    session.toggleSelectAll();
    expect(
      session.state.playlistTracks
        .filter((t) => !t.alreadyDownloaded)
        .every((t) => !t.selected),
    ).toBe(true);
  });

  it('selectMissingTracks selects only downloadable tracks and switches to the missing filter', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        { id: 'song-1', title: 'Song 1', alreadyDownloaded: false },
        { id: 'song-2', title: 'Song 2', alreadyDownloaded: true },
      ],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setTrackSelected('song-1', false);
    session.setActiveFilter('all');

    session.selectMissingTracks();

    expect(session.state.activeFilter).toBe('missing');
    expect(
      session.state.playlistTracks.find((t) => t.id === 'song-1').selected,
    ).toBe(true);
  });

  it('does nothing when confirming a playlist import with no importable selection', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: true }],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setTrackSelected('song-1', false); // nothing selected at all

    await session.confirmImport();

    expect(downloadAudioMock).not.toHaveBeenCalled();
    expect(session.state.isImporting).toBe(false);
  });

  it('does not report success when playlist persistence yields no saved playlist', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    // Simulates createPlaylist resolving with an array that doesn't contain
    // the new playlist (e.g. a save race) — usePlaylists.create() then
    // returns null, so syncImportedPlaylist() can't proceed past that guard.
    createPlaylistMock.mockResolvedValueOnce([]);
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(session.state.status).toBe(
      '曲目已下載，但播放清單未儲存。請再試一次。',
    );
    expect(session.state.statusType).toBe('error');
  });

  it('waits for playlist persistence and reports a safe failure when it rejects', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    downloadAudioMock.mockResolvedValue({ title: 'ok' });
    setPlaylistTracksMock.mockRejectedValueOnce(
      new Error('ENOSPC C:\\Users\\Singer\\Music\\playlists.json'),
    );
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    await session.confirmImport();

    expect(session.state.status).toBe(
      '曲目已下載，但播放清單未儲存。請再試一次。',
    );
    expect(session.state.statusType).toBe('error');
    expect(session.state.status).not.toContain('ENOSPC');
  });

  it('stops an in-progress playlist import via confirmImport itself, leaving unfinished tracks in preview', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        { id: 'song-1', title: 'Song 1', alreadyDownloaded: false },
        { id: 'song-2', title: 'Song 2', alreadyDownloaded: false },
      ],
    });
    const activeDownloads = new Map();
    downloadAudioMock.mockImplementation((id) => {
      const gate = deferred();
      activeDownloads.set(id, gate);
      return gate.promise;
    });
    cancelAudioDownloadMock.mockImplementation(async (id) => {
      activeDownloads.get(id)?.reject(
        new Error(
          `${APP_ERROR_PREFIX}${JSON.stringify({
            code: 'IMPORT_DOWNLOAD_CANCELLED',
            severity: 'info',
            title: '匯入已停止',
            message: '這首曲目已停止下載。',
          })}`,
        ),
      );
      return true;
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    const importPromise = session.confirmImport();
    await flushPromises();

    expect(session.state.isImporting).toBe(true);
    expect(downloadAudioMock).toHaveBeenCalledTimes(2);
    // A second confirmImport() call while importing is the UI's "stop"
    // button — it cancels rather than starting a second import.
    await session.confirmImport();
    await importPromise;

    expect(cancelAudioDownloadMock.mock.calls.map(([id]) => id).sort()).toEqual(
      ['song-1', 'song-2'],
    );
    expect(session.state.playlistTracks.map((track) => track.status)).toEqual([
      'pending',
      'pending',
    ]);
    expect(session.state.status).toBe('已停止，未完成的曲目仍留在預覽中');
    expect(session.state.statusType).toBe('pending');
  });

  it('exposes the visible/selectable track lists and filter option counts', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [
        { id: 'song-1', title: 'Song 1', alreadyDownloaded: false },
        { id: 'song-2', title: 'Song 2', alreadyDownloaded: true },
      ],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setActiveFilter('all');

    expect(session.visiblePlaylistTracks.value).toHaveLength(2);
    expect(session.selectablePlaylistTracks.value.map((t) => t.id)).toEqual([
      'song-1',
    ]);
    expect(session.filterOptions.value.find((f) => f.key === 'all').count).toBe(
      2,
    );
  });

  it('canConfirmImport is false and confirmImportLabel is a stop label mid-playlist-import', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    let releaseDownload;
    downloadAudioMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseDownload = () => resolve({ title: 'ok' });
        }),
    );
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    const importPromise = session.confirmImport();
    await flushPromises();

    expect(session.confirmImportLabel.value).toBe('停止');

    releaseDownload();
    await importPromise;
  });

  it('canConfirmImport is false before any source has been resolved', async () => {
    const session = await loadImportSession();
    expect(session.canConfirmImport.value).toBe(false);
  });

  it('confirmImportLabel reflects single-track already-downloaded vs. downloadable states', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce(null);
    resolveImportSourceMock.mockResolvedValueOnce({
      input: 'abc12345678',
      sourceVideoId: 'abc12345678',
      source: {
        playbackVideoId: 'abc12345678',
        title: 'Song',
        alreadyDownloaded: true,
      },
      recommendedCandidate: {
        playbackVideoId: 'abc12345678',
        title: 'Song',
        alreadyDownloaded: true,
      },
      candidates: [
        {
          playbackVideoId: 'abc12345678',
          title: 'Song',
          alreadyDownloaded: true,
        },
      ],
    });
    const session = await loadImportSession();

    session.setInput('abc12345678');
    await session.resolveSource();

    expect(session.confirmImportLabel.value).toBe('已存在');
  });

  it('confirmImportLabel shows "nothing selected" once every playlist track is deselected', async () => {
    fetchYoutubePlaylistMock.mockResolvedValueOnce({
      title: 'My Setlist',
      entries: [{ id: 'song-1', title: 'Song 1', alreadyDownloaded: false }],
    });
    const session = await loadImportSession();

    session.setInput('playlist-id');
    await session.resolveSource();
    session.setTrackSelected('song-1', false);

    expect(session.confirmImportLabel.value).toBe('沒有選取的曲目');
  });

  it('getTrackStatusClass reflects each track state', async () => {
    const session = await loadImportSession();

    expect(session.getTrackStatusClass({ status: 'done' })).toBe('done');
    expect(
      session.getTrackStatusClass({
        status: 'pending',
        alreadyDownloaded: true,
      }),
    ).toBe('downloaded');
    expect(session.getTrackStatusClass({ status: 'error' })).toBe('error');
    expect(session.getTrackStatusClass({ status: null })).toBe('pending');
  });

  describe('download directory config', () => {
    it.each([
      ['refreshConfig', () => getConfigMock, 'library-directory-read-settings'],
      [
        'chooseDownloadDir',
        () => chooseDownloadDirMock,
        'library-directory-choose-folder',
      ],
      [
        'resetDownloadDir',
        () => resetDownloadDirMock,
        'library-directory-reset-folder',
      ],
    ])(
      'retries %s from its notification without replacing the import draft',
      async (method, getBridge, key) => {
        const session = await loadImportSession();
        const { useAppNotifications } =
          await import('./useAppNotifications.js');
        const bridge = getBridge();
        bridge.mockRejectedValueOnce(new Error('private folder failure'));
        session.setInput('keep this draft');
        await expect(session[method]({ notifyFailure: true })).resolves.toBe(
          false,
        );
        const notifications = useAppNotifications();
        const notice = notifications.items.value.find(
          (item) => item.key === key,
        );
        expect(notice.actionLabel).toBe('重試');
        await expect(notifications.runAction(notice.id)).resolves.toBe(true);
        expect(bridge).toHaveBeenCalledTimes(2);
        expect(notifications.items.value).toHaveLength(0);
        expect(session.state.input).toBe('keep this draft');
      },
    );

    it('refreshConfig loads the current download directory from the backend', async () => {
      getConfigMock.mockResolvedValueOnce({
        downloadDir: '/music/utawakui',
        isDefault: false,
        available: false,
        reason: 'missing',
      });
      const session = await loadImportSession();

      await session.refreshConfig();

      expect(session.state.downloadDir).toBe('/music/utawakui');
      expect(session.state.isDefaultDir).toBe(false);
      expect(session.state.isDownloadDirAvailable).toBe(false);
      expect(session.state.downloadDirIssue).toBe('missing');
    });

    it('chooseDownloadDir opens the picker and refreshes config afterward', async () => {
      getConfigMock.mockResolvedValue({
        downloadDir: '/chosen/path',
        isDefault: false,
      });
      const session = await loadImportSession();

      await session.chooseDownloadDir();

      expect(chooseDownloadDirMock).toHaveBeenCalledTimes(1);
      expect(session.state.downloadDir).toBe('/chosen/path');
    });

    it('resetDownloadDir resets and refreshes config afterward', async () => {
      getConfigMock.mockResolvedValue({
        downloadDir: null,
        isDefault: true,
      });
      const session = await loadImportSession();

      await session.resetDownloadDir();

      expect(resetDownloadDirMock).toHaveBeenCalledTimes(1);
      expect(session.state.isDefaultDir).toBe(true);
    });

    it('opens the configured download directory', async () => {
      const session = await loadImportSession();

      await expect(session.openDownloadDir()).resolves.toBe(true);

      expect(openDownloadDirMock).toHaveBeenCalledOnce();
    });

    it('reports settings folder failures globally without overwriting import status', async () => {
      const session = await loadImportSession();
      const { useAppNotifications } = await import('./useAppNotifications.js');
      getConfigMock.mockRejectedValueOnce(new Error('read failed'));
      await session.refreshConfig();
      const priorStatus = session.state.status;
      for (const [method, bridge] of [
        ['chooseDownloadDir', chooseDownloadDirMock],
        ['resetDownloadDir', resetDownloadDirMock],
        ['openDownloadDir', openDownloadDirMock],
      ]) {
        bridge.mockRejectedValueOnce(new Error('E:\\private'));
        await expect(session[method]({ notifyFailure: true })).resolves.toBe(
          false,
        );
      }
      expect(useAppNotifications().items.value).toHaveLength(3);
      expect(session.state.status).toBe(priorStatus);
      expect(JSON.stringify(useAppNotifications().items.value)).not.toContain(
        'private',
      );
      await useAppNotifications().runAction(
        useAppNotifications().items.value[2].id,
      );
      expect(openDownloadDirMock).toHaveBeenCalledTimes(2);
    });

    it('keeps cancelled folder selection quiet and surfaces config refresh failure', async () => {
      const session = await loadImportSession();
      const { useAppNotifications } = await import('./useAppNotifications.js');
      await session.chooseDownloadDir({ notifyFailure: true });
      expect(useAppNotifications().items.value).toEqual([]);
      getConfigMock.mockRejectedValueOnce(new Error('private'));
      await expect(
        session.resetDownloadDir({ notifyFailure: true }),
      ).resolves.toBe(false);
      expect(useAppNotifications().items.value[0].title).toBe(
        '曲庫位置無法讀取',
      );
      expect(session.state.configError).toBeTruthy();
      await session.refreshConfig();
      expect(session.state.configError).toBe('');
      expect(useAppNotifications().items.value).toHaveLength(0);
    });

    it('contains download-directory bridge failures', async () => {
      const session = await loadImportSession();

      getConfigMock.mockRejectedValueOnce(new Error('read failed'));
      await expect(session.refreshConfig()).resolves.toBe(false);
      expect(session.state.status).toBe('目前無法讀取匯入設定，請再試一次。');

      chooseDownloadDirMock.mockRejectedValueOnce(new Error('choose failed'));
      await expect(session.chooseDownloadDir()).resolves.toBe(false);
      expect(session.state.status).toBe('下載資料夾未變更，請再試一次。');

      resetDownloadDirMock.mockRejectedValueOnce(new Error('reset failed'));
      await expect(session.resetDownloadDir()).resolves.toBe(false);
      expect(session.state.status).toBe('下載資料夾未重設，請再試一次。');

      openDownloadDirMock.mockRejectedValueOnce(new Error('open failed'));
      await expect(session.openDownloadDir()).resolves.toBe(false);
      expect(session.state.status).toBe('目前無法開啟下載資料夾，請再試一次。');
    });
  });
});
