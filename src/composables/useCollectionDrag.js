import { readonly, shallowRef } from 'vue';

// Shared while a sidebar collection is dragged, so the shell can dim the
// regions that are not drop targets.
const active = shallowRef(false);

export function useCollectionDrag() {
  return {
    active: readonly(active),
    setActive(value) {
      active.value = value === true;
    },
  };
}
