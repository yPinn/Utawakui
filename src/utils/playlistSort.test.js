import { describe, it, expect } from 'vitest';
import {
  PLAYLIST_SORT_KEYS,
  compareText,
  comparePlaylistEntries,
  sortPlaylistEntries,
  nextPlaylistSort,
} from './playlistSort.js';

function entry({ id, title, artist, addedAt, duration, playlistIndex }) {
  return {
    track: { id, title, artist, duration },
    addedAt,
    playlistIndex,
  };
}

describe('compareText', () => {
  it('is case-insensitive', () => {
    expect(compareText('a', 'A')).toBe(0);
  });

  it('treats null/undefined as empty string', () => {
    expect(compareText(undefined, '')).toBe(0);
    expect(compareText(null, 'a')).toBeLessThan(0);
  });
});

describe('comparePlaylistEntries — no key', () => {
  it('falls back to original playlist order', () => {
    const a = entry({ id: 'a', playlistIndex: 1 });
    const b = entry({ id: 'b', playlistIndex: 0 });
    expect(
      comparePlaylistEntries(a, b, { key: null, direction: 'asc' }),
    ).toBeGreaterThan(0);
  });
});

describe('comparePlaylistEntries — title', () => {
  it('sorts alphabetically ascending', () => {
    const a = entry({ id: 'a', title: 'Beta', playlistIndex: 0 });
    const b = entry({ id: 'b', title: 'Alpha', playlistIndex: 1 });
    expect(
      comparePlaylistEntries(a, b, {
        key: PLAYLIST_SORT_KEYS.title,
        direction: 'asc',
      }),
    ).toBeGreaterThan(0);
  });

  it('reverses on descending direction', () => {
    const a = entry({ id: 'a', title: 'Beta', playlistIndex: 0 });
    const b = entry({ id: 'b', title: 'Alpha', playlistIndex: 1 });
    expect(
      comparePlaylistEntries(a, b, {
        key: PLAYLIST_SORT_KEYS.title,
        direction: 'desc',
      }),
    ).toBeLessThan(0);
  });

  it('breaks title ties with artist', () => {
    const a = entry({
      id: 'a',
      title: 'Same',
      artist: 'Zed',
      playlistIndex: 0,
    });
    const b = entry({
      id: 'b',
      title: 'Same',
      artist: 'Ann',
      playlistIndex: 1,
    });
    expect(
      comparePlaylistEntries(a, b, {
        key: PLAYLIST_SORT_KEYS.title,
        direction: 'asc',
      }),
    ).toBeGreaterThan(0);
  });
});

describe('comparePlaylistEntries — addedAt/duration missing-value sink', () => {
  // The direction is applied *inside* compareOptionalValues for these two
  // keys, so a missing value sinks to the bottom regardless of asc/desc —
  // unlike title, where reversing direction also reverses the empty-value
  // ordering. This is the one behavior a well-meaning simplification would
  // silently destroy.
  it('addedAt: missing value sinks under ascending direction', () => {
    const withDate = entry({
      id: 'a',
      addedAt: '2024-01-01',
      playlistIndex: 0,
    });
    const missing = entry({ id: 'b', addedAt: undefined, playlistIndex: 1 });
    expect(
      comparePlaylistEntries(withDate, missing, {
        key: PLAYLIST_SORT_KEYS.addedAt,
        direction: 'asc',
      }),
    ).toBeLessThan(0);
  });

  it('addedAt: missing value still sinks under descending direction', () => {
    const withDate = entry({
      id: 'a',
      addedAt: '2024-01-01',
      playlistIndex: 0,
    });
    const missing = entry({ id: 'b', addedAt: undefined, playlistIndex: 1 });
    expect(
      comparePlaylistEntries(withDate, missing, {
        key: PLAYLIST_SORT_KEYS.addedAt,
        direction: 'desc',
      }),
    ).toBeLessThan(0);
  });

  it('duration: missing value sinks under ascending direction', () => {
    const withDuration = entry({ id: 'a', duration: 120, playlistIndex: 0 });
    const missing = entry({ id: 'b', duration: undefined, playlistIndex: 1 });
    expect(
      comparePlaylistEntries(withDuration, missing, {
        key: PLAYLIST_SORT_KEYS.duration,
        direction: 'asc',
      }),
    ).toBeLessThan(0);
  });

  it('duration: missing value still sinks under descending direction', () => {
    const withDuration = entry({ id: 'a', duration: 120, playlistIndex: 0 });
    const missing = entry({ id: 'b', duration: undefined, playlistIndex: 1 });
    expect(
      comparePlaylistEntries(withDuration, missing, {
        key: PLAYLIST_SORT_KEYS.duration,
        direction: 'desc',
      }),
    ).toBeLessThan(0);
  });

  it('duration: reverses order between two present values on descending', () => {
    const shorter = entry({ id: 'a', duration: 60, playlistIndex: 0 });
    const longer = entry({ id: 'b', duration: 180, playlistIndex: 1 });
    expect(
      comparePlaylistEntries(shorter, longer, {
        key: PLAYLIST_SORT_KEYS.duration,
        direction: 'desc',
      }),
    ).toBeGreaterThan(0);
  });
});

describe('sortPlaylistEntries', () => {
  it('returns a new sorted array without mutating the input', () => {
    const entries = [
      entry({ id: 'b', title: 'Beta', playlistIndex: 0 }),
      entry({ id: 'a', title: 'Alpha', playlistIndex: 1 }),
    ];
    const original = [...entries];
    const sorted = sortPlaylistEntries(entries, {
      key: PLAYLIST_SORT_KEYS.title,
      direction: 'asc',
    });
    expect(sorted.map((e) => e.track.id)).toEqual(['a', 'b']);
    expect(entries).toEqual(original);
  });
});

describe('nextPlaylistSort', () => {
  it('starts a new key at ascending', () => {
    expect(nextPlaylistSort({ key: null, direction: 'asc' }, 'title')).toEqual({
      key: 'title',
      direction: 'asc',
    });
  });

  it('flips ascending to descending on the same key', () => {
    expect(
      nextPlaylistSort({ key: 'title', direction: 'asc' }, 'title'),
    ).toEqual({ key: 'title', direction: 'desc' });
  });

  it('clears back to no-sort after descending', () => {
    expect(
      nextPlaylistSort({ key: 'title', direction: 'desc' }, 'title'),
    ).toEqual({ key: null, direction: 'asc' });
  });

  it('switching to a different key restarts at ascending', () => {
    expect(
      nextPlaylistSort({ key: 'title', direction: 'desc' }, 'duration'),
    ).toEqual({ key: 'duration', direction: 'asc' });
  });
});
