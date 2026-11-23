import { onMounted, shallowRef } from 'vue';
import { templateKinds } from '../../../shared/outputTemplateValues.json';

const STORAGE_KEY = 'utawakui.output.template-favorites';

function isTemplateId(value) {
  return typeof value === 'string' && Object.hasOwn(templateKinds, value);
}

export function useOutputTemplateFavorites() {
  const favorites = shallowRef(new Set());

  onMounted(() => {
    try {
      const ids = JSON.parse(
        globalThis.localStorage?.getItem(STORAGE_KEY) ?? 'null',
      );
      if (Array.isArray(ids))
        favorites.value = new Set(ids.filter(isTemplateId));
    } catch {
      // Storage is optional for a local browsing preference.
    }
  });

  function toggleFavorite(id) {
    if (!isTemplateId(id)) return;
    const next = new Set(favorites.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    favorites.value = next;
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // Keep the updated preference usable for this mount.
    }
  }

  return { favorites, toggleFavorite };
}
