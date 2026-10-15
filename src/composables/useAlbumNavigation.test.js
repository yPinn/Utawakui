import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
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
  it('opens a read-only album reference when only track metadata exists', async () => {
    const { navigation, playlists, appView } = await load();
    appView.setActiveView('display');
    const track = {
      id: 'track-a',
      title: '53 Dawns',
      album: 'Message In A Bottle',
    };

    expect(navigation.canJumpToAlbum(track)).toBe(true);
    navigation.jumpToAlbum(track);

    expect(playlists.state.selectedAlbumReference).toBe('Message In A Bottle');
    expect(playlists.state.selectedId).toBe(null);
    expect(appView.activeView.value).toBe('library');
  });

  it('keeps a source-backed album authoritative when membership exists', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        listPlaylists: vi.fn().mockResolvedValue([
          {
            id: 'album-a',
            name: 'Message In A Bottle',
            kind: 'album',
            trackIds: ['track-a'],
          },
        ]),
        onLibraryUpdated: vi.fn(),
      },
    });
    const { navigation, playlists } = await load();
    await playlists.initialize();

    navigation.jumpToAlbum({
      id: 'track-a',
      title: '53 Dawns',
      album: 'Message In A Bottle',
    });

    expect(playlists.state.selectedId).toBe('album-a');
    expect(playlists.state.selectedAlbumReference).toBe(null);
  });

  it('does not expose an album destination without usable metadata', async () => {
    const { navigation, playlists } = await load();

    expect(navigation.canJumpToAlbum({ id: 'track-a', album: '  ' })).toBe(
      false,
    );
    navigation.jumpToAlbum({ id: 'track-a', album: '  ' });

    expect(playlists.state.selectedId).toBe(null);
    expect(playlists.state.selectedAlbumReference).toBe(null);
  });

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
