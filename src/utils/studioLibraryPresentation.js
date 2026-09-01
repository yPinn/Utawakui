import { deriveAlbumSummary } from './albumSummary.js';
import { formatLongDuration } from './format.js';
import { playlistDisplayName } from './playlistMenu.js';
import {
  sortSetlistLibraryTracks,
  sortSetlistLocalTracks,
} from './trackSourceDisplay.js';

function resolveCollectionTracks(selectedPlaylist, libraryView, tracks) {
  if (selectedPlaylist) {
    const tracksById = new Map(tracks.map((track) => [track.id, track]));
    return selectedPlaylist.trackIds
      .map((trackId) => tracksById.get(trackId))
      .filter(Boolean);
  }

  return libraryView === 'local'
    ? sortSetlistLocalTracks(tracks)
    : sortSetlistLibraryTracks(tracks);
}

function filenameExtension(filename) {
  const match = String(filename ?? '').match(/\.([a-z\d]+)$/iu);
  return match?.[1]?.toLocaleUpperCase() ?? '';
}

function collectionFormats(tracks) {
  return [
    ...new Set(tracks.map((track) => filenameExtension(track.filename))),
  ].filter(Boolean);
}

function totalDuration(tracks) {
  return tracks.reduce(
    (total, track) =>
      Number.isFinite(track.duration) ? total + track.duration : total,
    0,
  );
}

function countAndDurationSummary(tracks) {
  const duration = formatLongDuration(totalDuration(tracks));
  return [`${tracks.length} 首曲目`, duration].filter(Boolean).join(' · ');
}

function collectionIdentity(selectedPlaylist, libraryView) {
  if (selectedPlaylist?.kind === 'album') {
    return {
      collectionType: 'album',
      kindLabel: '本機專輯',
      title: playlistDisplayName(selectedPlaylist),
    };
  }
  if (selectedPlaylist) {
    return {
      collectionType: 'playlist',
      kindLabel: '本機播放清單',
      title: playlistDisplayName(selectedPlaylist),
    };
  }
  return {
    collectionType: 'library',
    kindLabel: '本機曲庫',
    title: libraryView === 'local' ? '本機曲目' : '全部曲目',
  };
}

export function formatStudioTrackSource(track) {
  const extension = filenameExtension(track?.filename);
  return extension ? `本機 ${extension}` : '本機音訊';
}

export function createStudioLibraryPresentation({
  selectedPlaylist,
  libraryView,
  tracks,
}) {
  const safeTracks = Array.isArray(tracks) ? tracks : [];
  const collectionTracks = resolveCollectionTracks(
    selectedPlaylist,
    libraryView,
    safeTracks,
  );
  const identity = collectionIdentity(selectedPlaylist, libraryView);
  const duration = formatLongDuration(totalDuration(collectionTracks));
  const formats = collectionFormats(collectionTracks);
  const albumSummary =
    identity.collectionType === 'album'
      ? deriveAlbumSummary(collectionTracks)
      : { artist: undefined, releaseYear: undefined };
  const byline = [albumSummary.artist, albumSummary.releaseYear]
    .filter(Boolean)
    .join(' · ');

  return {
    ...identity,
    tracks: collectionTracks,
    summary: [byline, countAndDurationSummary(collectionTracks)]
      .filter(Boolean)
      .join(' · '),
    description: selectedPlaylist?.description ?? '',
    coverUrl: selectedPlaylist?.coverUrl ?? '',
    canCollage: identity.collectionType !== 'album',
    facts: [
      {
        id: 'track-count',
        label: '曲目',
        value: `${collectionTracks.length} 首`,
      },
      { id: 'duration', label: '總長', value: duration || '—' },
      { id: 'formats', label: '格式', value: formats.join(' · ') || '—' },
      { id: 'collection-type', label: '類型', value: identity.kindLabel },
    ],
  };
}
