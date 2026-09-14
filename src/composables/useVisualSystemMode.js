import { readonly, ref } from 'vue';

const STUDIO_LIBRARY_COMPARISON_MODES = new Set([
  'studio-library',
  'setlist-current',
]);
const MODES = new Set(['demo', ...STUDIO_LIBRARY_COMPARISON_MODES]);
const mode = ref('demo');

export function isStudioLibraryComparisonMode(candidateMode) {
  return STUDIO_LIBRARY_COMPARISON_MODES.has(candidateMode);
}

export function useVisualSystemMode() {
  function setMode(nextMode) {
    if (MODES.has(nextMode)) mode.value = nextMode;
  }

  return {
    mode: readonly(mode),
    setMode,
  };
}
