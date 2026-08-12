import { deriveAlbumSummary } from './albumSummary.js';

// Shared by PlaylistSidebar.vue (nav rows) and LyricsWorkspace.vue (the
// playlist <select>) so both surfaces present playlists in the same order
// instead of drifting — the sidebar defines the canonical order: playlists
// first (manual drag order, see usePlaylists.js's reorderPlaylist), then
// albums grouped by their derived artist alphabetically, name as a
// tiebreak. tracksById is the same shape both callers already have (a Map
// keyed by track id) — needed here only to derive each album's artist via
// deriveAlbumSummary, not to enrich playlists (which don't have one).
export function orderPlaylistsForDisplay(playlists, tracksById) {
  const list = Array.isArray(playlists) ? playlists : [];
  const map = tracksById instanceof Map ? tracksById : new Map();

  const playlistItems = list.filter((playlist) => playlist.kind !== 'album');

  const withArtist = list
    .filter((playlist) => playlist.kind === 'album')
    .map((playlist) => {
      const memberTracks = playlist.trackIds
        .map((id) => map.get(id))
        .filter(Boolean);
      return {
        playlist,
        artist: deriveAlbumSummary(memberTracks).artist || '',
      };
    });
  withArtist.sort((a, b) => {
    const byArtist = a.artist.localeCompare(b.artist, undefined, {
      sensitivity: 'base',
    });
    if (byArtist !== 0) return byArtist;
    return a.playlist.name.localeCompare(b.playlist.name, undefined, {
      sensitivity: 'base',
    });
  });
  const albumItems = withArtist.map((entry) => entry.playlist);

  return { playlistItems, albumItems };
}
