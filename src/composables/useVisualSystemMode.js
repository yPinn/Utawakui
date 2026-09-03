import { readonly, ref } from 'vue';

const MODES = new Set(['studio-library', 'demo']);
const mode = ref('demo');

export function useVisualSystemMode() {
  function setMode(nextMode) {
    if (MODES.has(nextMode)) mode.value = nextMode;
  }

  return {
    mode: readonly(mode),
    setMode,
  };
}
