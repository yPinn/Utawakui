import { onScopeDispose, ref, watch } from 'vue';

// True once the target has scrolled fully above its scroll viewport's top.
export function useScrolledPast(targetRef) {
  const scrolledPast = ref(false);
  let observer = null;

  function disconnect() {
    observer?.disconnect();
    observer = null;
  }

  watch(
    targetRef,
    (target) => {
      disconnect();
      scrolledPast.value = false;
      const element = target?.$el ?? target;
      if (!element || typeof IntersectionObserver !== 'function') return;
      const root = element.closest?.('.ui-scroll-region__viewport') ?? null;
      observer = new IntersectionObserver(
        ([entry]) => {
          const top = entry.rootBounds?.top ?? 0;
          scrolledPast.value =
            !entry.isIntersecting && entry.boundingClientRect.bottom <= top;
        },
        { root },
      );
      observer.observe(element);
    },
    { flush: 'post' },
  );

  onScopeDispose(disconnect);
  return scrolledPast;
}
