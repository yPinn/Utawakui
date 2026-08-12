'use strict';

// Heuristic-only: classifies an already-imported collection as an 'album'
// or a 'playlist' from its member tracks' album metadata (indexed via
// library.js's listTracks()/album field). Independent of youtube.js's
// classifyPlaylistKind, which classifies by *source* list id at import
// time — this one is for the one-time migration of existing collections
// that predate the kind field, and for the manual "convert" action's
// suggestion. A pure function so it can be exercised directly under Vitest.
//
// Rule (verified against a real 91-track/10-playlist library): at least 2
// tracks, at least 75% of them share one common non-empty album value, and
// no other album value appears among them. A single stray/mistagged track
// (e.g. one bonus track without album metadata) doesn't break the call;
// a collection actually built from multiple albums does.
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
