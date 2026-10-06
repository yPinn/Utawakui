import { deriveAlbumSummary } from './albumSummary.js';
import { albumArtistId } from './artistCollections.js';

// Artist ids come from main's derived index; queue sources and history share
// the sourceId namespace with playlist UUIDs, which never use this prefix.
const ARTIST_ID_PREFIX = 'artist-';
const nameCollator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});

export function isArtistSourceId(id) {
  return typeof id === 'string' && id.startsWith(ARTIST_ID_PREFIX);
}

function validReleaseYear(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function compareNewestFirst(a, b) {
  return (
    (b.releaseYear ?? 0) - (a.releaseYear ?? 0) ||
    nameCollator.compare(a.title ?? a.name ?? '', b.title ?? b.name ?? '')
  );
}

function albumsByArtist(albumEntries, trackArtistIds) {
  const byArtist = new Map();
  for (const entry of Array.isArray(albumEntries) ? albumEntries : []) {
    if (entry?.collection?.kind !== 'album') continue;
    const artistId = albumArtistId(entry.tracks, trackArtistIds);
    if (!artistId) continue;
    const album = {
      id: entry.collection.id,
      name: entry.collection.name || '(未命名專輯)',
      coverUrl: entry.collection.coverUrl ?? '',
      tracks: entry.tracks,
      releaseYear: validReleaseYear(
        deriveAlbumSummary(entry.tracks).releaseYear,
      ),
    };
    byArtist.set(artistId, [...(byArtist.get(artistId) ?? []), album]);
  }
  for (const albums of byArtist.values()) albums.sort(compareNewestFirst);
  return byArtist;
}

// Sidebar reference section (ADR 0022): artists that own an album or have at
// least two tracks, by display name. A search query also reaches the rest.
export function listSidebarArtists({
  artistIndex,
  albumEntries,
  tracksById,
  query = '',
}) {
  const artists = artistIndex?.artists ?? [];
  if (artists.length === 0) return [];
  const albums = albumsByArtist(albumEntries, artistIndex.trackArtistIds);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const map = tracksById instanceof Map ? tracksById : new Map();

  return (
    artists
      .filter((artist) => {
        const owned = albums.get(artist.id) ?? [];
        if (!normalizedQuery) {
          return owned.length > 0 || artist.trackIds.length >= 2;
        }
        return (
          artist.name.toLocaleLowerCase().includes(normalizedQuery) ||
          artist.trackIds.some((id) =>
            String(map.get(id)?.title ?? '')
              .toLocaleLowerCase()
              .includes(normalizedQuery),
          )
        );
      })
      // Artist rows show the artist photo only, never a borrowed album cover.
      .map((artist) => ({
        id: artist.id,
        name: artist.name,
        trackCount: artist.trackIds.length,
        albumCount: albums.get(artist.id)?.length ?? 0,
        photoUrl: artist.photoUrl ?? '',
      }))
      .sort((a, b) => nameCollator.compare(a.name, b.name))
  );
}

// A track's own credited forms paired with artist ids for navigation. Multi-part
// credits link only when their ", " parts line up one-to-one with the index;
// otherwise the caller keeps plain text instead of guessing.
export function artistCreditLinks(track, artistIndex) {
  const credit = typeof track?.artist === 'string' ? track.artist.trim() : '';
  const ids = artistIndex?.trackArtistIds?.[track?.id];
  if (!credit || !Array.isArray(ids) || ids.length === 0) return null;
  if (ids.length === 1) return [{ text: credit, artistId: ids[0] }];
  const parts = credit.split(', ');
  if (parts.length !== ids.length) return null;
  return parts.map((text, index) => ({ text, artistId: ids[index] }));
}

// Sidebar reference tier (ADR 0022): albums and artists share one list keyed by
// artist name; each artist row leads its own albums, which keep the incoming
// (newest-first) order. Album artist names come from the index when loaded.
export function orderReferenceItems({
  albumItems,
  artistItems,
  artistIndex,
  tracksById,
  fallbackAlbumArtistById,
}) {
  const map = tracksById instanceof Map ? tracksById : new Map();
  const artistNameById = new Map(
    (artistIndex?.artists ?? []).map((artist) => [artist.id, artist.name]),
  );
  const albumArtistName = (album) => {
    const tracks = album.trackIds.map((id) => map.get(id)).filter(Boolean);
    const id = albumArtistId(tracks, artistIndex?.trackArtistIds);
    return (
      artistNameById.get(id) ?? fallbackAlbumArtistById?.get(album.id) ?? ''
    );
  };

  const entries = [
    ...(Array.isArray(artistItems) ? artistItems : []).map((item) => ({
      kind: 'artist',
      item,
      groupName: item.name,
      rank: 0,
      order: 0,
    })),
    ...(Array.isArray(albumItems) ? albumItems : []).map((item, order) => ({
      kind: 'album',
      item,
      groupName: albumArtistName(item),
      rank: 1,
      order,
    })),
  ];
  return entries.sort(
    (a, b) =>
      nameCollator.compare(a.groupName, b.groupName) ||
      a.rank - b.rank ||
      a.order - b.order,
  );
}

// Artist page: albums newest first, then the artist's tracks in album order
// followed by tracks outside those albums (newest first, then title).
export function deriveArtistPage({
  artistId,
  artistIndex,
  albumEntries,
  tracksById,
}) {
  const artist = artistIndex?.artists?.find((entry) => entry.id === artistId);
  if (!artist) return null;
  const map = tracksById instanceof Map ? tracksById : new Map();
  const albums =
    albumsByArtist(albumEntries, artistIndex.trackArtistIds).get(artist.id) ??
    [];

  const artistTrackIds = new Set(artist.trackIds);
  const seen = new Set();
  const albumTracks = [];
  for (const album of albums) {
    for (const track of album.tracks) {
      if (!track?.id || seen.has(track.id) || !artistTrackIds.has(track.id)) {
        continue;
      }
      seen.add(track.id);
      albumTracks.push(track);
    }
  }
  const looseTracks = artist.trackIds
    .filter((id) => !seen.has(id))
    .map((id) => map.get(id))
    .filter(Boolean)
    .sort(compareNewestFirst);
  const tracks = [...albumTracks, ...looseTracks];

  const releaseYears = tracks
    .map((track) => validReleaseYear(track.releaseYear))
    .filter((year) => year !== undefined)
    .sort((a, b) => a - b);

  return {
    id: artist.id,
    name: artist.name,
    photoUrl: artist.photoUrl ?? '',
    albums,
    tracks,
    looseTrackCount: looseTracks.length,
    yearStart: releaseYears[0],
    yearEnd: releaseYears.at(-1),
  };
}
