import { onBeforeUnmount, onMounted, watch } from 'vue';

// The Gallery owns the sample clock. Template renderers own their animations.
export function useOutputPreviewMotion({ scene, animated, start, stop }) {
  let preference;
  let dispose;

  function update() {
    if (!preference) return;
    dispose?.();
    dispose = undefined;
    stop?.();
    if (animated() && !preference.matches) dispose = start();
  }

  onMounted(() => {
    preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    preference.addEventListener('change', update);
    update();
  });
  watch([scene, animated], update, { flush: 'post' });
  onBeforeUnmount(() => {
    preference?.removeEventListener('change', update);
    dispose?.();
    stop?.();
  });
}
