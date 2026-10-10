import { ref } from 'vue';

// Session-wide track list density ('list' | 'compact'); persisting it waits
// for the user-preference pass.
const density = ref('list');

export function useTrackListDensity() {
  return density;
}
