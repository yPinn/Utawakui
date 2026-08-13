import { deriveAlbumSummary } from './albumSummary.js';

// Shared by PlaylistSidebar.vue (nav rows) and LyricsWorkspace.vue (the
// playlist <select>) so both surfaces present playlists in the same order
// instead of drifting — the sidebar defines the canonical order: playlists
// first (manual drag order, see usePlaylists.js's reorderPlaylist), then
// albums grouped by their derived artist alphabetically ascending, newest
// release first within an artist, album name as the final tiebreak.
// tracksById is the same shape both callers already have (a Map keyed by
// track id) — needed here only to derive each album's artist/releaseYear
// via deriveAlbumSummary, not to enrich playlists (which don't have one).
export function orderPlaylistsForDisplay(playlists, tracksById) {
  const list = Array.isArray(playlists) ? playlists : [];
  const map = tracksById instanceof Map ? tracksById : new Map();

  const playlistItems = list.filter((playlist) => playlist.kind !== 'album');

  const withSummary = list
    .filter((playlist) => playlist.kind === 'album')
    .map((playlist) => {
      const memberTracks = playlist.trackIds
        .map((id) => map.get(id))
        .filter(Boolean);
      const summary = deriveAlbumSummary(memberTracks);
      return {
        playlist,
        artist: summary.artist || '',
        releaseYear: summary.releaseYear,
      };
    });
  withSummary.sort((a, b) => {
    const byArtist = a.artist.localeCompare(b.artist, undefined, {
      sensitivity: 'base',
    });
    if (byArtist !== 0) return byArtist;

    // Same artist: newest release first. A missing year sorts after every
    // known year — it means "unknown", not "oldest".
    if (a.releaseYear !== b.releaseYear) {
      if (a.releaseYear === undefined) return 1;
      if (b.releaseYear === undefined) return -1;
      return b.releaseYear - a.releaseYear;
    }

    return a.playlist.name.localeCompare(b.playlist.name, undefined, {
      sensitivity: 'base',
    });
  });
  const albumItems = withSummary.map((entry) => entry.playlist);

  return { playlistItems, albumItems };
}
