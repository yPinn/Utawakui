import { onScopeDispose, watch } from 'vue';

// Keep document geometry mounted while deferring optional background reads.
export function useOnFirstVisible(targetRef, callback) {
  let observer = null;
  let started = false;
  let disposed = false;
  function disconnect() {
    observer?.disconnect();
    observer = null;
  }
  function start() {
    if (started || disposed) return;
    started = true;
    disconnect();
    callback();
  }
  watch(
    targetRef,
    (target) => {
      disconnect();
      if (started || !target) return;
      if (typeof IntersectionObserver !== 'function') {
        start();
        return;
      }
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) start();
      });
      observer.observe(target);
    },
    { flush: 'post', immediate: true },
  );
  onScopeDispose(() => {
    disposed = true;
    disconnect();
  });
}
