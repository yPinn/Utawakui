// Derives album-level display fields (artist, releaseYear) from an album
// collection's member tracks. Not stored separately: library.json is
// scalar-only, and a copy would be a second, driftable source of truth.
// Picks the most common non-empty value rather than requiring unanimity: in a
// real library one album's tracks split 6/11 across alternate-credit artist
// strings, and the majority value was still the right one to show.
function pickMostCommon(values) {
  const counts = new Map();
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function deriveAlbumSummary(tracks) {
  const list = Array.isArray(tracks) ? tracks : [];
  return {
    artist: pickMostCommon(list.map((track) => track?.artist)),
    releaseYear: pickMostCommon(list.map((track) => track?.releaseYear)),
  };
}
