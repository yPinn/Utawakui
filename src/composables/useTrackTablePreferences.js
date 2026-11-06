import { computed, shallowRef } from 'vue';
import { normalizeTrackCollectionPreferences } from '../components/track/trackCollectionProfiles.js';

const storageKey = (kind) => `utawakui.track-table-columns.${kind}`;

function readPreferences(kind) {
  try {
    return JSON.parse(
      globalThis.localStorage?.getItem(storageKey(kind)) ?? 'null',
    );
  } catch {
    return null;
  }
}

export function useTrackTablePreferences(kind) {
  const updated = shallowRef({});
  const preferences = computed(() => {
    const key = kind.value;
    return normalizeTrackCollectionPreferences(
      key,
      updated.value[key] ?? readPreferences(key),
    );
  });

  function update(value) {
    const key = kind.value;
    const normalized = normalizeTrackCollectionPreferences(key, value);
    updated.value = { ...updated.value, [key]: normalized };
    try {
      globalThis.localStorage?.setItem(
        storageKey(key),
        JSON.stringify(normalized),
      );
    } catch {
      // Keep the new layout usable for this mount when storage is unavailable.
    }
  }

  return { preferences, update };
}
