import { UI_LOCALE } from './uiLocale.js';

export const PLAYLIST_SORT_KEYS = {
  title: 'title',
  album: 'album',
  releaseYear: 'releaseYear',
  addedAt: 'addedAt',
  importedAt: 'importedAt',
  playCount: 'playCount',
  duration: 'duration',
};

const OPTIONAL_VALUE_SORT_KEYS = new Set([
  PLAYLIST_SORT_KEYS.album,
  PLAYLIST_SORT_KEYS.releaseYear,
  PLAYLIST_SORT_KEYS.addedAt,
  PLAYLIST_SORT_KEYS.importedAt,
  PLAYLIST_SORT_KEYS.playCount,
  PLAYLIST_SORT_KEYS.duration,
]);

export function compareText(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), UI_LOCALE, {
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
  } else if (key === PLAYLIST_SORT_KEYS.album) {
    result = compareOptionalValues(
      a.track.album,
      b.track.album,
      compareText,
      direction,
    );
  } else if (key === PLAYLIST_SORT_KEYS.releaseYear) {
    result = compareOptionalValues(
      Number.isFinite(a.track.releaseYear) ? a.track.releaseYear : null,
      Number.isFinite(b.track.releaseYear) ? b.track.releaseYear : null,
      (yearA, yearB) => yearA - yearB,
      direction,
    );
  } else if (key === PLAYLIST_SORT_KEYS.importedAt) {
    result = compareOptionalValues(
      a.track.importedAt,
      b.track.importedAt,
      (dateA, dateB) => new Date(dateA).getTime() - new Date(dateB).getTime(),
      direction,
    );
  } else if (key === PLAYLIST_SORT_KEYS.playCount) {
    result = compareOptionalValues(
      Number.isFinite(a.playCount) ? a.playCount : null,
      Number.isFinite(b.playCount) ? b.playCount : null,
      (countA, countB) => countA - countB,
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

  if (result !== 0 && !OPTIONAL_VALUE_SORT_KEYS.has(key)) {
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
