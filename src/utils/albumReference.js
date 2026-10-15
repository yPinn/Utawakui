export function normalizeAlbumReferenceTitle(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replaceAll(/\s+/gu, ' ');
}

export function albumReferenceKey(value) {
  return normalizeAlbumReferenceTitle(value).toLowerCase();
}

export function deriveAlbumReference(albumTitle, tracks) {
  const name = normalizeAlbumReferenceTitle(albumTitle);
  const key = albumReferenceKey(name);
  if (!key) return null;

  const members = (Array.isArray(tracks) ? tracks : []).filter(
    (track) => albumReferenceKey(track?.album) === key,
  );
  if (members.length === 0) return null;

  return Object.freeze({
    id: `album-reference:${encodeURIComponent(key)}`,
    name,
    readOnly: true,
    tracks: Object.freeze(members),
  });
}

export function albumReferenceTitleForTrack(track) {
  return normalizeAlbumReferenceTitle(track?.album);
}
