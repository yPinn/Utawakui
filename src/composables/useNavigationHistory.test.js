import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

const PLAYLISTS = [
  { id: 'playlist-a', name: 'A', kind: 'playlist', trackIds: [] },
  { id: 'playlist-b', name: 'B', kind: 'playlist', trackIds: [] },
];

let remaining;

beforeEach(() => {
  vi.resetModules();
  remaining = [...PLAYLISTS];
  vi.stubGlobal('window', {
    Utawakui: {
      listPlaylists: vi.fn(async () => remaining),
      deletePlaylist: vi.fn(async (id) => {
        remaining = remaining.filter((playlist) => playlist.id !== id);
        return remaining;
      }),
      onLibraryUpdated: vi.fn(),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  const { useAppView } = await import('./useAppView.js');
  const { usePlaylists } = await import('./usePlaylists.js');
  const { useNavigationHistory } = await import('./useNavigationHistory.js');
  const appView = useAppView();
  const playlists = usePlaylists();
  await playlists.initialize();
  const history = useNavigationHistory();
  await nextTick();
  return { appView, playlists, history };
}

// Mirrors a sidebar click: select a collection, then show the Library.
async function openPlaylist({ appView, playlists }, id) {
  playlists.select(id);
  appView.openLibraryContent();
  await nextTick();
}

describe('useNavigationHistory', () => {
  it('retraces distinct archived sessions without replacing library selection or performance state', async () => {
    const context = await load();
    await openPlaylist(context, 'playlist-a');
    const { appView, history, playlists } = context;
    appView.openPerformanceArchive('one');
    await nextTick();
    appView.openPerformanceArchive('two');
    await nextTick();
    expect(history.back()).toBe(true);
    await nextTick();
    expect(appView.performanceArchiveId.value).toBe('one');
    expect(history.back()).toBe(true);
    await nextTick();
    expect(appView.activeView.value).toBe('library');
    expect(playlists.state.selectedId).toBe('playlist-a');
    expect(history.forward()).toBe(true);
    await nextTick();
    expect(appView.performanceArchiveId.value).toBe('one');
  });
  it('starts with nothing to go back or forward to', async () => {
    const { history } = await load();

    expect(history.canGoBack.value).toBe(false);
    expect(history.canGoForward.value).toBe(false);
    expect(history.back()).toBe(false);
    expect(history.forward()).toBe(false);
  });

  it('records a collection change and restores it on back and forward', async () => {
    const context = await load();
    const { appView, playlists, history } = context;

    await openPlaylist(context, 'playlist-a');
    expect(history.canGoBack.value).toBe(true);

    expect(history.back()).toBe(true);
    expect(playlists.state.selectedId).toBe(null);
    expect(appView.activeView.value).toBe('library');
    expect(history.canGoForward.value).toBe(true);

    expect(history.forward()).toBe(true);
    expect(playlists.state.selectedId).toBe('playlist-a');
    expect(history.canGoForward.value).toBe(false);
  });

  it('merges the changes of one task into a single entry', async () => {
    const context = await load();
    const { appView, playlists, history } = context;
    appView.setActiveView('display');
    await nextTick();

    // jumpToAlbum-style: collection selection and destination switch together.
    playlists.select('playlist-a');
    appView.openLibraryContent();
    await nextTick();

    expect(history.back()).toBe(true);
    expect(appView.activeView.value).toBe('display');
    expect(history.back()).toBe(true);
    expect(appView.activeView.value).toBe('library');
    expect(playlists.state.selectedId).toBe(null);
    expect(history.canGoBack.value).toBe(false);
  });

  it('does not record the restore itself', async () => {
    const context = await load();
    const { history } = context;
    await openPlaylist(context, 'playlist-a');
    await openPlaylist(context, 'playlist-b');

    history.back();
    await nextTick();
    history.back();
    await nextTick();

    expect(history.canGoBack.value).toBe(false);
    expect(history.canGoForward.value).toBe(true);
    history.forward();
    await nextTick();
    history.forward();
    await nextTick();
    expect(history.canGoForward.value).toBe(false);
  });

  it('does not add an entry when the active destination is selected again', async () => {
    const { appView, history } = await load();

    appView.setActiveView('library');
    appView.setActiveView('library');
    await nextTick();
    expect(history.canGoBack.value).toBe(false);

    appView.setActiveView('display');
    await nextTick();
    appView.setActiveView('display');
    await nextTick();
    history.back();
    expect(appView.activeView.value).toBe('library');
    expect(history.canGoBack.value).toBe(false);
  });

  it('discards the forward entries when navigating from the middle', async () => {
    const context = await load();
    const { appView, history } = context;
    appView.setActiveView('performance');
    await nextTick();
    appView.setActiveView('display');
    await nextTick();

    history.back();
    await nextTick();
    expect(appView.activeView.value).toBe('performance');
    await openPlaylist(context, 'playlist-b');

    expect(history.canGoForward.value).toBe(false);
  });

  it('keeps Performance tool switches out of the history', async () => {
    const { appView, history } = await load();
    appView.setActiveView('performance');
    await nextTick();

    appView.selectPerformanceTool('live-lyrics');
    await nextTick();
    appView.selectPerformanceTool('session');
    await nextTick();
    history.back();

    expect(appView.activeView.value).toBe('library');
    expect(history.canGoBack.value).toBe(false);
  });

  it('restores a Performance entry without touching the active tool', async () => {
    const { appView, history } = await load();
    appView.setActiveView('performance');
    appView.selectPerformanceTool('live-lyrics');
    await nextTick();
    appView.setActiveView('display');
    await nextTick();

    history.back();

    expect(appView.activeView.value).toBe('performance');
    expect(appView.performanceTool.value).toBe('live-lyrics');
  });

  it('restores the Library workspace', async () => {
    const { appView, history } = await load();
    appView.openLyricsAuthoring();
    await nextTick();
    appView.openLibraryContent();
    await nextTick();

    history.back();

    expect(appView.activeView.value).toBe('library');
    expect(appView.libraryWorkspace.value).toBe('lyrics-authoring');
  });

  it('restores artist and album-reference selections', async () => {
    const context = await load();
    const { appView, playlists, history } = context;
    playlists.selectArtist('artist:abc');
    appView.openLibraryContent();
    await nextTick();
    playlists.selectAlbumReference('Message In A Bottle');
    appView.openLibraryContent();
    await nextTick();

    history.back();
    expect(playlists.state.selectedArtistId).toBe('artist:abc');
    expect(playlists.state.selectedAlbumReference).toBe(null);

    history.back();
    expect(playlists.state.selectedArtistId).toBe(null);
    expect(playlists.state.selectedId).toBe(null);

    history.forward();
    history.forward();
    expect(playlists.state.selectedAlbumReference).toBe('Message In A Bottle');
  });

  it('records the all／local library view as a location', async () => {
    const { playlists, history } = await load();

    playlists.setLibraryView('local');
    await nextTick();
    history.back();

    expect(playlists.state.libraryView).toBe('all');
  });

  it('ignores internal workbenches', async () => {
    const { appView, history } = await load();

    appView.setActiveView('visual-system');
    await nextTick();
    expect(history.canGoBack.value).toBe(false);

    appView.setActiveView('library');
    await nextTick();
    expect(history.canGoBack.value).toBe(false);

    appView.setActiveView('visual-system');
    appView.setActiveView('display');
    await nextTick();
    history.back();
    expect(appView.activeView.value).toBe('library');
  });

  describe('deleted playlists', () => {
    it('replaces the current entry when its playlist is deleted', async () => {
      const context = await load();
      const { playlists, history } = context;
      await openPlaylist(context, 'playlist-a');

      await playlists.remove('playlist-a');
      await nextTick();

      expect(playlists.state.selectedId).toBe(null);
      expect(history.canGoBack.value).toBe(false);
    });

    it('skips entries whose playlist was deleted', async () => {
      const context = await load();
      const { appView, playlists, history } = context;
      await openPlaylist(context, 'playlist-a');
      appView.setActiveView('display');
      await nextTick();

      await playlists.remove('playlist-a');
      await nextTick();

      expect(history.canGoBack.value).toBe(true);
      expect(history.back()).toBe(true);
      expect(appView.activeView.value).toBe('library');
      expect(playlists.state.selectedId).toBe(null);
      expect(history.canGoBack.value).toBe(false);
    });
  });

  describe('Settings', () => {
    it('records Settings as an entry and returns to the previous location', async () => {
      const context = await load();
      const { appView, playlists, history } = context;
      await openPlaylist(context, 'playlist-a');

      appView.openSettings();
      await nextTick();
      expect(appView.activeView.value).toBe('settings');

      expect(history.leaveSettings()).toBe(true);
      expect(appView.activeView.value).toBe('library');
      expect(playlists.state.selectedId).toBe('playlist-a');
      expect(history.canGoForward.value).toBe(true);
    });

    it('restores Settings with the view it returns to', async () => {
      const { appView, history } = await load();
      appView.setActiveView('display');
      await nextTick();
      appView.openSettings();
      await nextTick();

      history.back();
      expect(appView.activeView.value).toBe('display');
      history.forward();

      expect(appView.activeView.value).toBe('settings');
      expect(appView.returnView.value).toBe('display');
    });

    it('does not traverse when Settings returns to an unrecorded view', async () => {
      const { appView, history } = await load();
      appView.setActiveView('visual-system');
      await nextTick();
      appView.openSettings();
      await nextTick();

      expect(history.leaveSettings()).toBe(false);
      expect(appView.activeView.value).toBe('settings');
    });

    it('does nothing outside Settings', async () => {
      const { appView, history } = await load();
      appView.setActiveView('display');
      await nextTick();

      expect(history.leaveSettings()).toBe(false);
      expect(appView.activeView.value).toBe('display');
    });
  });
});
