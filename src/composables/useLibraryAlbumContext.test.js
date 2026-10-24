import { computed, nextTick, reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const owners = vi.hoisted(() => ({
  playlists: null,
  library: null,
  artists: null,
  resolve: vi.fn(),
  verification: null,
}));
vi.mock('./usePlaylists.js', () => ({
  usePlaylists: () => ({
    state: owners.playlists,
    selectedPlaylist: computed(() =>
      owners.playlists.playlists.find(
        (p) => p.id === owners.playlists.selectedId,
      ),
    ),
  }),
}));
vi.mock('./useLibrary.js', () => ({
  useLibrary: () => ({ state: owners.library }),
}));
vi.mock('./useArtistIndex.js', () => ({
  useArtistIndex: () => ({ state: owners.artists }),
}));
vi.mock('./usePlaylistActions.js', () => ({
  usePlaylistActions: () => ({
    resolvePlaylistTracks: (collection) =>
      (collection?.trackIds ?? [])
        .map((id) => owners.library.tracks.find((t) => t.id === id))
        .filter(Boolean),
  }),
}));
vi.mock('./useReleaseMembers.js', () => ({
  useReleaseMembers: () => ({
    resolve: owners.resolve,
    verificationState: (collection) =>
      owners.verification.get(collection?.id) ?? { state: 'idle', error: '' },
  }),
}));
beforeEach(() => {
  vi.resetModules();
  owners.resolve.mockClear();
  owners.resolve.mockResolvedValue([]);
  owners.verification = reactive(new Map());
  owners.library = reactive({
    tracks: [{ id: 'a', title: 'Song', artist: 'Artist', releaseYear: 2026 }],
  });
  owners.playlists = reactive({
    playlists: [
      {
        id: 'r',
        kind: 'album',
        name: 'Release',
        trackIds: ['a', 'missing'],
        requiresMembershipVerification: true,
      },
    ],
    selectedId: null,
    selectedArtistId: null,
  });
  owners.artists = reactive({
    index: {
      artists: [{ id: 'artist', name: 'Artist', trackIds: ['a'] }],
      trackArtistIds: { a: ['artist'] },
    },
  });
});

describe('useLibraryAlbumContext', () => {
  it('shares the same read-only projection across page and view consumers', async () => {
    const { useLibraryAlbumContext } =
      await import('./useLibraryAlbumContext.js');
    const pageContext = useLibraryAlbumContext();
    const viewContext = useLibraryAlbumContext();

    expect(pageContext.albumEntries).toBe(viewContext.albumEntries);
    expect(pageContext.albumSupportingContent).toBe(
      viewContext.albumSupportingContent,
    );
  });

  it('shows album and artist information without triggering media verification on navigation', async () => {
    const { useLibraryAlbumContext } =
      await import('./useLibraryAlbumContext.js');
    const context = useLibraryAlbumContext();
    owners.playlists.selectedId = 'r';
    await nextTick();
    expect(context.albumEntries.value[0].tracks.map((t) => t.id)).toEqual([
      'a',
    ]);
    expect(context.albumSupportingContent.value.summary).toMatchObject({
      albumCount: 1,
      trackCount: 1,
    });
    owners.playlists.selectedId = null;
    owners.playlists.selectedArtistId = 'artist';
    await nextTick();
    expect(context.albumEntries.value).toHaveLength(1);
    expect(owners.resolve).not.toHaveBeenCalled();
  });

  it('keeps operation errors scoped to the selected collection and retries only on explicit intent', async () => {
    const { useLibraryAlbumContext } =
      await import('./useLibraryAlbumContext.js');
    const context = useLibraryAlbumContext();
    expect(context.albumSupportingContent.value).toBeNull();
    expect(await context.retrySelectedRelease()).toEqual([]);
    expect(owners.resolve).not.toHaveBeenCalled();
    owners.verification.set('other', {
      state: 'error',
      error: 'Other failure',
    });
    expect(context.membershipError.value).toBe('');
    owners.playlists.selectedId = 'r';
    owners.verification.set('r', { state: 'error', error: 'Current failure' });
    expect(context.membershipError.value).toBe('Current failure');
    expect(context.selectedReleaseVerification.value.state).toBe('error');
    expect(context.albumEntries.value[0].tracks).toHaveLength(1);
    await context.retrySelectedRelease();
    expect(owners.resolve).toHaveBeenCalledExactlyOnceWith(
      owners.playlists.playlists[0],
      { fresh: true },
    );
  });
});
