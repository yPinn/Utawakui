import { readonly, shallowRef } from 'vue';

const isInspectorOpen = shallowRef(false);

export function useStudioLibraryInspector() {
  function setInspectorOpen(open) {
    isInspectorOpen.value = Boolean(open);
  }

  function toggleInspector() {
    isInspectorOpen.value = !isInspectorOpen.value;
  }

  return {
    isInspectorOpen: readonly(isInspectorOpen),
    setInspectorOpen,
    toggleInspector,
  };
}
