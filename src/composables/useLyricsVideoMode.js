import { readonly, shallowRef } from 'vue';

const active = shallowRef(false);
const mode = readonly(active);

export function useLyricsVideoMode() {
  return {
    active: mode,
    setActive: (value) => {
      active.value = value;
    },
  };
}
