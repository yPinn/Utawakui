import { deriveAlbumSummary } from './albumSummary.js';

function normalizedArtist(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase();
}

function validReleaseYear(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function uniqueTracksById(tracks) {
  const byId = new Map();
  for (const track of tracks) {
    if (track?.id && !byId.has(track.id)) byId.set(track.id, track);
  }
  return [...byId.values()];
}

export function deriveAlbumSupportingContent({
  selectedAlbumId,
  selectedTracks,
  albumEntries,
  libraryTracks,
}) {
  const selectedSummary = deriveAlbumSummary(selectedTracks);
  const artist = String(selectedSummary.artist ?? '').trim();
  const artistKey = normalizedArtist(artist);
  if (!artistKey) return null;

  const matchingAlbums = (Array.isArray(albumEntries) ? albumEntries : [])
    .filter(({ collection, tracks }) => {
      if (collection?.kind !== 'album') return false;
      return normalizedArtist(deriveAlbumSummary(tracks).artist) === artistKey;
    })
    .map(({ collection, tracks }) => {
      const summary = deriveAlbumSummary(tracks);
      return {
        id: collection.id,
        name: collection.name || '(未命名專輯)',
        coverUrl: collection.coverUrl ?? '',
        tracks,
        releaseYear: validReleaseYear(summary.releaseYear),
      };
    });

  const relatedAlbums = matchingAlbums
    .filter((album) => album.id !== selectedAlbumId)
    .sort(
      (a, b) =>
        (b.releaseYear ?? 0) - (a.releaseYear ?? 0) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );

  const artistTracks = uniqueTracksById([
    ...(Array.isArray(libraryTracks) ? libraryTracks : []),
    ...(Array.isArray(selectedTracks) ? selectedTracks : []),
  ]).filter((track) => normalizedArtist(track.artist) === artistKey);
  const releaseYears = artistTracks
    .map((track) => validReleaseYear(track.releaseYear))
    .filter((year) => year !== undefined)
    .sort((a, b) => a - b);

  return {
    artist,
    relatedAlbums,
    summary: {
      albumCount: matchingAlbums.length,
      trackCount: artistTracks.length,
      yearStart: releaseYears[0],
      yearEnd: releaseYears.at(-1),
    },
  };
}
