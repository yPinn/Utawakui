import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, reactive } from 'vue';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  clearCover: vi.fn(),
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
  };
});

async function loadActions() {
  const { usePlaylistActions } = await import('./usePlaylistActions.js');
  const actions = usePlaylistActions();
  actions.openEditDetails();
  return actions;
}

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
    expect(mocks.clearCover).toHaveBeenCalledExactlyOnceWith('p1');
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
