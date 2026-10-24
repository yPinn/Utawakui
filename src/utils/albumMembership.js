// Saved association for presentation/navigation only. Callers join these IDs
// against the canonical library to omit missing files; this is not media proof.
export function collectionDisplayTrackIds(collection) {
  return collection?.trackIds ?? [];
}

// Membership is multi-valued. The primary destination remains stable unless a
// caller supplies the current release context; navigation never changes audio.
export function albumPlaylistsByTrackId(
  playlists,
  { trackIdsForCollection } = {},
) {
  const map = new Map();
  const list = Array.isArray(playlists) ? playlists : [];
  for (const playlist of list) {
    if (playlist.kind !== 'album') continue;
    const ids = trackIdsForCollection
      ? trackIdsForCollection(playlist)
      : collectionDisplayTrackIds(playlist);
    for (const trackId of ids) {
      map.set(trackId, [...(map.get(trackId) ?? []), playlist]);
    }
  }
  return map;
}

export function albumPlaylistByTrackId(playlists, options = {}) {
  return new Map(
    [...albumPlaylistsByTrackId(playlists, options)].map(
      ([trackId, releases]) => [
        trackId,
        releases.find(
          (release) => release.id === options.preferredCollectionId,
        ) ?? releases[0],
      ],
    ),
  );
}
