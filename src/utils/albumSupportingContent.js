import { releaseCard } from './releasePresentation.js';
import { albumArtistId, albumsForArtist } from './artistCollections.js';
import { UI_LOCALE } from './uiLocale.js';

function validReleaseYear(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export function deriveAlbumSupportingContent({
  selectedAlbumId,
  selectedTracks,
  albumEntries,
  libraryTracks,
  artistIndex,
}) {
  const trackArtistIds = artistIndex?.trackArtistIds;
  const artistId = albumArtistId(selectedTracks, trackArtistIds);
  const artist = artistIndex?.artists?.find((entry) => entry.id === artistId);
  if (!artist) return null;

  const matchingAlbums = albumsForArtist(
    artistId,
    albumEntries,
    trackArtistIds,
  ).map(({ collection, tracks }) => releaseCard(collection, tracks));

  const relatedAlbums = matchingAlbums
    .filter((album) => album.id !== selectedAlbumId)
    .sort(
      (a, b) =>
        (b.releaseYear ?? 0) - (a.releaseYear ?? 0) ||
        a.name.localeCompare(b.name, UI_LOCALE, { sensitivity: 'base' }),
    );

  const tracksById = new Map(
    [
      ...(Array.isArray(libraryTracks) ? libraryTracks : []),
      ...(Array.isArray(selectedTracks) ? selectedTracks : []),
    ]
      .filter((track) => track?.id)
      .map((track) => [track.id, track]),
  );
  const artistTracks = artist.trackIds
    .map((id) => tracksById.get(id))
    .filter(Boolean);
  const releaseYears = artistTracks
    .map((track) => validReleaseYear(track.releaseYear))
    .filter((year) => year !== undefined)
    .sort((a, b) => a - b);

  return {
    artistId: artist.id,
    artist: artist.name,
    relatedAlbums,
    summary: {
      albumCount: matchingAlbums.length,
      trackCount: artistTracks.length,
      yearStart: releaseYears[0],
      yearEnd: releaseYears.at(-1),
    },
  };
}
