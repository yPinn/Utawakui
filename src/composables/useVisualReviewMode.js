import { readonly, ref } from 'vue';

const STUDIO_LIBRARY_MODE = 'studio-library';
const MODES = new Set(['final-board', STUDIO_LIBRARY_MODE, 'demo']);
const mode = ref('final-board');

export function isStudioLibraryMode(candidateMode) {
  return candidateMode === STUDIO_LIBRARY_MODE;
}

export function useVisualReviewMode() {
  function setMode(nextMode) {
    if (MODES.has(nextMode)) mode.value = nextMode;
  }

  return {
    mode: readonly(mode),
    setMode,
  };
}
