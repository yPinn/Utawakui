import { shallowRef } from 'vue';

// Saved sung languages by track id, shared by the library filter and editors.
const records = shallowRef({});
const loaded = shallowRef(false);
let request = 0;

async function refresh() {
  const active = ++request;
  try {
    const result = await window.Utawakui.listTrackLanguages();
    if (active !== request) return;
    if (result?.ok) {
      records.value = result.tracks ?? {};
      loaded.value = true;
    }
  } catch {
    // The filter falls back to the last loaded index.
  }
}

function languagesOf(trackId) {
  return records.value[trackId]?.languages ?? [];
}

export function useTrackLanguageIndex() {
  return { records, loaded, refresh, languagesOf };
}
