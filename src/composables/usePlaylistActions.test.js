import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, reactive } from 'vue';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  clearCover: vi.fn(),
  rename: vi.fn(),
  setDescription: vi.fn(),
  setCover: vi.fn(),
  enqueueTrack: vi.fn(),
  append: vi.fn(),
  selectTab: vi.fn(),
  showDock: vi.fn(),
}));
let libraryTracks;
let playlists;
vi.mock('./usePlaylists.js', () => ({ usePlaylists: () => playlists }));
vi.mock('./useAppConfirmation.js', () => ({
  useAppConfirmation: () => ({ confirm: mocks.confirm }),
}));
vi.mock('./useLibrary.js', () => ({
  useLibrary: () => ({ tracksById: libraryTracks }),
}));
vi.mock('./usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => ({ enqueueTrack: mocks.enqueueTrack }),
}));
vi.mock('./usePerformanceSessionPlan.js', () => ({
  usePerformanceSessionPlan: () => ({
    state: { isSaving: false },
    appendFromCollection: mocks.append,
  }),
}));
vi.mock('./useAppRightDock.js', () => ({
  useAppRightDock: () => ({
    selectArrangementTab: mocks.selectTab,
    showQueueVariant: mocks.showDock,
  }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.rename.mockResolvedValue(true);
  mocks.setDescription.mockResolvedValue(true);
  mocks.setCover.mockResolvedValue(true);
  libraryTracks = ref(new Map());
  const playlist = {
    id: 'p1',
    name: '我的歌單',
    kind: 'playlist',
    trackIds: [],
    coverUrl: 'cover-before',
  };
  playlists = {
    state: reactive({ playlists: [playlist] }),
    selectedPlaylist: ref(playlist),
    clearCover: mocks.clearCover,
    rename: mocks.rename,
    setDescription: mocks.setDescription,
    setCover: mocks.setCover,
    create: vi.fn().mockResolvedValue({ id: 'new', trackIds: [] }),
    remove: vi.fn().mockResolvedValue(true),
    setKind: vi.fn().mockResolvedValue(true),
    addTracks: vi.fn().mockResolvedValue(true),
  };
});

async function loadActions() {
  const { usePlaylistActions } = await import('./usePlaylistActions.js');
  const actions = usePlaylistActions();
  actions.openEditDetails();
  return actions;
}

afterEach(() => vi.unstubAllGlobals());

describe('release display and action boundaries', () => {
  it('shows canonical cover members before admission and retains them when queue admission fails', async () => {
    const collection = playlists.state.playlists[0];
    Object.assign(collection, {
      kind: 'album',
      trackIds: ['a', 'missing'],
      requiresMembershipVerification: true,
      availableTrackIds: [],
      resolvedRelease: { revision: 2 },
      releaseLibraryEpoch: 1,
    });
    const track = { id: 'a', title: 'Song', thumbnailUrl: 'local-cover' };
    libraryTracks.value = new Map([['a', track]]);
    const resolveReleaseMembers = vi
      .fn()
      .mockResolvedValue({ status: 'conflict' });
    vi.stubGlobal('window', { Utawakui: { resolveReleaseMembers } });
    const actions = await loadActions();
    expect(actions.resolvePlaylistTracks(collection)).toEqual([track]);
    expect(actions.editDetailsCoverTracks.value).toEqual([track]);
    expect(resolveReleaseMembers).not.toHaveBeenCalled();
    await actions.addPlaylistToQueue(collection.id);
    expect(resolveReleaseMembers).toHaveBeenCalledOnce();
    expect(mocks.enqueueTrack).not.toHaveBeenCalled();
    expect(actions.editDetailsCoverTracks.value).toEqual([track]);
  });
});

describe('queue destinations', () => {
  it('keeps ordinary queue actions separate and appends to the current performance through its explicit intent', async () => {
    const actions = await loadActions();
    playlists.state.playlists[0].trackIds = ['a', 'b'];
    libraryTracks.value = new Map([
      ['a', { id: 'a' }],
      ['b', { id: 'b' }],
    ]);
    await actions.handlePlaylistMenuAction({
      action: 'add-to-queue',
      playlistId: 'p1',
    });
    expect(mocks.enqueueTrack.mock.calls.map((c) => c[0].id)).toEqual([
      'a',
      'b',
    ]);
    expect(mocks.append).not.toHaveBeenCalled();
    mocks.append.mockResolvedValue(true);
    await actions.handlePlaylistMenuAction({
      action: 'add-to-performance-queue',
      playlistId: 'p1',
    });
    expect(mocks.append).toHaveBeenCalledExactlyOnceWith('p1');
    expect(mocks.enqueueTrack).toHaveBeenCalledTimes(2);
    expect(mocks.selectTab).toHaveBeenCalledWith('pending');
    expect(mocks.showDock).toHaveBeenCalledWith('arrangement');
  });
});

describe('playlist cover removal', () => {
  it('requires danger confirmation before an immediate write and preserves the cover on cancel', async () => {
    mocks.confirm.mockResolvedValue(false);
    const actions = await loadActions();
    await actions.clearCover();
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'danger', confirmLabel: '移除封面' }),
    );
    expect(mocks.clearCover).not.toHaveBeenCalled();
    expect(actions.editDetailsIsSaving.value).toBe(false);
  });
  it('holds the existing saving lock throughout confirmation and executes once', async () => {
    let finish;
    mocks.confirm.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const actions = await loadActions();
    const pending = actions.clearCover();
    expect(actions.editDetailsIsSaving.value).toBe(true);
    actions.closeEditDetailsModal();
    await actions.clearCover();
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(actions.editDetailsPlaylist.value.id).toBe('p1');
    finish(true);
    await pending;
    expect(mocks.clearCover).toHaveBeenCalledExactlyOnceWith(
      'p1',
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(actions.editDetailsIsSaving.value).toBe(false);
  });
  it('does not delete a replacement cover that arrived while confirming', async () => {
    let finish;
    mocks.confirm.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const actions = await loadActions();
    const pending = actions.clearCover();
    actions.editDetailsPlaylist.value.coverUrl = 'new-cover';
    finish(true);
    await pending;
    expect(mocks.clearCover).not.toHaveBeenCalled();
  });
  it('has no destructive action when the cover is already absent', async () => {
    const actions = await loadActions();
    actions.editDetailsPlaylist.value.coverUrl = '';
    await actions.clearCover();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.clearCover).not.toHaveBeenCalled();
  });
});

describe('details editor failures', () => {
  it('keeps a failed description editable after a successful rename', async () => {
    const actions = await loadActions();
    mocks.setDescription.mockImplementationOnce(
      async (_id, _value, { onError }) => {
        onError('說明未儲存');
        return false;
      },
    );
    await actions.saveEditDetails({ name: '新名稱', description: '草稿說明' });
    expect(actions.editDetailsPlaylist.value.id).toBe('p1');
    expect(actions.editDetailsError.value).toBe('說明未儲存');
    expect(mocks.rename).toHaveBeenCalledOnce();
  });

  it('keeps all editor actions locked while saving and safely ignores a closed target', async () => {
    const actions = await loadActions();
    let finish;
    mocks.rename.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = actions.saveEditDetails({
      name: '新名稱',
      description: undefined,
    });
    actions.openEditDetails();
    await actions.handlePlaylistMenuAction({
      action: 'edit-details',
      playlistId: 'p1',
    });
    await actions.saveEditDetails({ name: '不能重送', description: 'x' });
    await actions.chooseCover();
    await actions.clearCover();
    expect(mocks.rename).toHaveBeenCalledTimes(1);
    expect(mocks.setCover).not.toHaveBeenCalled();
    finish(true);
    await pending;
    await actions.saveEditDetails({ name: '忽略', description: 'x' });
    await actions.chooseCover();
    playlists.selectedPlaylist.value = null;
    actions.openEditDetails();
    expect(actions.editDetailsPlaylist.value).toBeNull();
  });
  it('retains the editor and draft error after rename failure, then closes on recovery', async () => {
    const actions = await loadActions();
    mocks.rename.mockImplementationOnce(async (_id, _name, { onError }) => {
      onError('變更未儲存，請再試一次。');
      return false;
    });
    await actions.saveEditDetails({ name: '新名稱', description: '新說明' });
    expect(actions.editDetailsPlaylist.value.id).toBe('p1');
    expect(actions.editDetailsError.value).toBe('變更未儲存，請再試一次。');
    expect(mocks.setDescription).not.toHaveBeenCalled();
    await actions.saveEditDetails({ name: '新名稱', description: '新說明' });
    expect(actions.editDetailsPlaylist.value).toBeNull();
    expect(actions.editDetailsError.value).toBe('');
  });

  it('keeps cover failures in the open editor', async () => {
    const actions = await loadActions();
    mocks.setCover.mockImplementationOnce(async (_id, { onError }) => {
      onError('封面未更新，請再試一次。');
      return false;
    });
    await actions.chooseCover();
    expect(actions.editDetailsError.value).toBe('封面未更新，請再試一次。');
    expect(actions.editDetailsPlaylist.value.id).toBe('p1');
  });
});

describe('collection menu operation targets', () => {
  it('uses canonical collection members for create/add and ignores disappeared targets', async () => {
    const actions = await loadActions();
    playlists.state.playlists[0].trackIds = ['a', 'b'];
    await actions.handlePlaylistMenuAction({
      action: 'create-playlist',
      sourcePlaylistId: 'p1',
    });
    expect(playlists.addTracks).toHaveBeenCalledWith('new', ['a', 'b']);
    await actions.handlePlaylistMenuAction({
      action: 'add-to-playlist',
      playlistId: 'p1',
      targetPlaylistId: 'target',
    });
    expect(playlists.addTracks).toHaveBeenCalledWith('target', ['a', 'b']);
    await actions.handlePlaylistMenuAction({
      action: 'create-playlist',
      sourcePlaylistId: 'missing',
    });
    await actions.handlePlaylistMenuAction({
      action: 'edit-details',
      playlistId: 'missing',
    });
    expect(actions.editDetailsPlaylist.value.id).toBe('p1');
  });

  it('confirms deletion, distinguishes album removal, and opens a details target without navigating', async () => {
    const actions = await loadActions();
    await actions.handlePlaylistMenuAction({
      action: 'edit-details',
      playlistId: 'p1',
    });
    expect(actions.editDetailsPlaylist.value.id).toBe('p1');
    await actions.handlePlaylistMenuAction({
      action: 'convert-kind',
      playlistId: 'p1',
    });
    expect(playlists.setKind).toHaveBeenCalledWith('p1', 'album');
    mocks.confirm.mockResolvedValueOnce(false);
    await actions.confirmDeletePlaylist();
    expect(playlists.remove).not.toHaveBeenCalled();
    playlists.state.playlists[0].kind = 'album';
    await actions.clearCover();
    expect(mocks.clearCover).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValueOnce(true);
    await actions.handlePlaylistMenuAction({
      action: 'delete',
      playlistId: 'p1',
    });
    expect(mocks.confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: '移除專輯？', intent: 'danger' }),
    );
    expect(playlists.remove).toHaveBeenCalledWith('p1');
    await actions.handlePlaylistMenuAction({
      action: 'convert-kind',
      playlistId: 'p1',
    });
    expect(playlists.setKind).toHaveBeenLastCalledWith('p1', 'playlist');
    playlists.selectedPlaylist.value = null;
    await actions.confirmDeletePlaylist();
    actions.closeEditDetailsModal();
    expect(actions.editDetailsPlaylist.value).toBeNull();
  });
});
