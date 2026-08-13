export const PLAYLIST_SORT_KEYS = {
  title: 'title',
  addedAt: 'addedAt',
  duration: 'duration',
};

export function compareText(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    sensitivity: 'base',
  });
}

function compareOptionalValues(a, b, compare, direction) {
  const hasA = a !== null && a !== undefined && a !== '';
  const hasB = b !== null && b !== undefined && b !== '';
  if (hasA && !hasB) return -1;
  if (!hasA && hasB) return 1;
  if (!hasA && !hasB) return 0;
  const result = compare(a, b);
  return direction === 'desc' ? -result : result;
}

// addedAt/duration apply `direction` *inside* compareOptionalValues (missing
// values always sink, regardless of direction); title applies it *outside*.
// Deliberate asymmetry — don't collapse the two branches into one shape.
export function comparePlaylistEntries(a, b, sort) {
  const { key, direction } = sort;
  let result = 0;

  if (!key) {
    result = a.playlistIndex - b.playlistIndex;
  } else if (key === PLAYLIST_SORT_KEYS.title) {
    result =
      compareText(a.track.title, b.track.title) ||
      compareText(a.track.artist, b.track.artist);
  } else if (key === PLAYLIST_SORT_KEYS.addedAt) {
    result = compareOptionalValues(
      a.addedAt,
      b.addedAt,
      (dateA, dateB) => new Date(dateA).getTime() - new Date(dateB).getTime(),
      direction,
    );
  } else if (key === PLAYLIST_SORT_KEYS.duration) {
    result = compareOptionalValues(
      Number.isFinite(a.track.duration) ? a.track.duration : null,
      Number.isFinite(b.track.duration) ? b.track.duration : null,
      (durationA, durationB) => durationA - durationB,
      direction,
    );
  }

  if (
    result !== 0 &&
    key !== PLAYLIST_SORT_KEYS.addedAt &&
    key !== PLAYLIST_SORT_KEYS.duration
  ) {
    return direction === 'desc' ? -result : result;
  }
  if (result !== 0) return result;
  return a.playlistIndex - b.playlistIndex;
}

export function sortPlaylistEntries(entries, sort) {
  return [...entries].sort((a, b) => comparePlaylistEntries(a, b, sort));
}

export function nextPlaylistSort(current, key) {
  if (current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return { key: null, direction: 'asc' };
}
