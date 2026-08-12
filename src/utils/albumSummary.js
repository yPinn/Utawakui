// Derives album-level display fields (artist, releaseYear) from an album
// collection's member tracks — not stored separately (see CLAUDE.md's
// library.json bullet: it's scalar-text-only, and duplicating this would
// be a second, driftable source of truth). Picks the most common non-empty
// value among members rather than requiring unanimity: verified against a
// real library where one album's tracks split 6/11 vs. scattered
// alternate-credit artist strings, and the majority value is still the
// right one to show.
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
