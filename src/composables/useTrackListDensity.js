import { ref } from 'vue';

// Session-wide track list density ('list' | 'compact'). No UI switches it
// yet; collection pages stay in list view.
const density = ref('list');

export function useTrackListDensity() {
  return density;
}
