import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

async function load() {
  const { useAlbumNavigation } = await import('./useAlbumNavigation.js');
  const { usePlaylists } = await import('./usePlaylists.js');
  const { useAppView } = await import('./useAppView.js');
  return {
    navigation: useAlbumNavigation(),
    playlists: usePlaylists(),
    appView: useAppView(),
  };
}

describe('useAlbumNavigation', () => {
  it('routes a derived artist source to the artist page', async () => {
    const { navigation, playlists, appView } = await load();
    appView.setActiveView('display');

    navigation.jumpToPlaylist('artist-0123456789abcdef');

    expect(playlists.state.selectedArtistId).toBe('artist-0123456789abcdef');
    expect(playlists.state.selectedId).toBe(null);
    expect(appView.activeView.value).toBe('library');
  });

  it('keeps routing playlist and album sources to the collection page', async () => {
    const { navigation, playlists } = await load();
    navigation.jumpToArtist('artist-0123456789abcdef');

    navigation.jumpToPlaylist('3f2c9e0a-1111-4222-8333-944445555666');

    expect(playlists.state.selectedId).toBe(
      '3f2c9e0a-1111-4222-8333-944445555666',
    );
    expect(playlists.state.selectedArtistId).toBe(null);
  });

  it('ignores non-artist ids for the artist destination', async () => {
    const { navigation, playlists } = await load();
    navigation.jumpToArtist('3f2c9e0a-1111-4222-8333-944445555666');
    expect(playlists.state.selectedArtistId).toBe(null);
  });
});
