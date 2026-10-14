import { readonly, shallowRef } from 'vue';

export const TRACK_LIST_DENSITIES = Object.freeze(['list', 'compact']);

// Session-wide display preference. It intentionally resets to the spacious
// list recipe after an app restart instead of becoming persisted settings.
const density = shallowRef('list');

function setDensity(value) {
  if (TRACK_LIST_DENSITIES.includes(value)) density.value = value;
}

export function useTrackListDensity() {
  return {
    density: readonly(density),
    setDensity,
  };
}
