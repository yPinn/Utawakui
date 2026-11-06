import { shallowRef } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { useTrackTablePreferences } from './useTrackTablePreferences.js';
import { normalizeTrackCollectionPreferences } from '../components/track/trackCollectionProfiles.js';

afterEach(() => vi.unstubAllGlobals());

it('restores normalized column choices in a fresh instance by table kind', () => {
  const stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => stored.get(key),
    setItem: (key, value) => stored.set(key, value),
  });
  const kind = shallowRef('library-all');
  const first = useTrackTablePreferences(kind);
  const choice = {
    widths: { identity: 320, retiredColumn: 400 },
    visibleAdvanced: ['releaseYear', 'retiredColumn'],
    columnOrder: ['release', 'identity'],
  };
  first.update(choice);
  const restored = useTrackTablePreferences(kind);
  expect(restored.preferences.value).toEqual(
    normalizeTrackCollectionPreferences('library-all', choice),
  );
  expect(restored.preferences.value.widths).not.toHaveProperty('retiredColumn');
  expect(restored.preferences.value.visibleAdvanced).toEqual(['releaseYear']);

  kind.value = 'album';
  expect(restored.preferences.value).toEqual(
    normalizeTrackCollectionPreferences('album'),
  );
  kind.value = 'library-all';
  expect(restored.preferences.value).toEqual(first.preferences.value);
});

it('uses defaults for unreadable storage and still accepts changes', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => '{',
    setItem: () => {
      throw new Error('Storage is unavailable');
    },
  });
  const kind = shallowRef('library-all');
  const table = useTrackTablePreferences(kind);
  expect(table.preferences.value).toEqual(
    normalizeTrackCollectionPreferences(kind.value),
  );
  table.update({ widths: { identity: 320 } });
  expect(table.preferences.value.widths.identity).toBe(320);
});
