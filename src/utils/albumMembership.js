// first-match-wins, like useLibrary.js's albumCoverByTrackId.
export function albumPlaylistByTrackId(playlists) {
  const map = new Map();
  const list = Array.isArray(playlists) ? playlists : [];
  for (const playlist of list) {
    if (playlist.kind !== 'album') continue;
    for (const trackId of playlist.trackIds) {
      if (!map.has(trackId)) map.set(trackId, playlist);
    }
  }
  return map;
}
