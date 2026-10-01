'use strict';

// Heuristic-only: classifies an already-imported collection as 'album' or
// 'playlist' from its member tracks' album metadata (listTracks() in
// library/tracks.js). Independent of youtube.js's classifyPlaylistKind, which
// classifies the *source* list id at import time; this serves the one-time
// migration of collections that predate the kind field and the manual "convert"
// suggestion. Pure, so it is testable directly.
//
// Rule (checked against a real 91-track library): at least 2 tracks, at least 75%
// share one non-empty album value, and no other album value appears. One stray
// or mistagged track does not break the call; a multi-album collection does.
const MIN_TRACKS = 2;
const COVERAGE_THRESHOLD = 0.75;

function normalizeAlbumName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}

function classifyCollectionKind(tracks) {
  const list = Array.isArray(tracks) ? tracks : [];
  if (list.length < MIN_TRACKS) return 'playlist';

  const albumCounts = new Map();
  let withAlbum = 0;
  for (const track of list) {
    const key = normalizeAlbumName(track?.album);
    if (!key) continue;
    withAlbum += 1;
    albumCounts.set(key, (albumCounts.get(key) || 0) + 1);
  }

  if (albumCounts.size !== 1) return 'playlist';

  const [dominantCount] = albumCounts.values();
  const coverage = withAlbum / list.length;
  return dominantCount === withAlbum && coverage >= COVERAGE_THRESHOLD
    ? 'album'
    : 'playlist';
}

module.exports = { classifyCollectionKind };
