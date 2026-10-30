// Album attribution over the derived artist index (ADR 0022): an album belongs
// to the artist credited on most of its member tracks, so one guest feature
// does not place the album on the guest's page.
export function albumArtistId(tracks, trackArtistIds) {
  const counts = new Map();
  for (const track of Array.isArray(tracks) ? tracks : []) {
    for (const id of trackArtistIds?.[track?.id] ?? []) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  let best;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

// Merged display name of the album's artist; empty before the index loads.
export function albumArtistName(tracks, artistIndex) {
  const id = albumArtistId(tracks, artistIndex?.trackArtistIds);
  if (!id) return '';
  return artistIndex?.artists?.find((artist) => artist.id === id)?.name ?? '';
}

export function albumsForArtist(artistId, albumEntries, trackArtistIds) {
  if (!artistId) return [];
  return (Array.isArray(albumEntries) ? albumEntries : []).filter(
    ({ collection, tracks }) =>
      collection?.kind === 'album' &&
      albumArtistId(tracks, trackArtistIds) === artistId,
  );
}
