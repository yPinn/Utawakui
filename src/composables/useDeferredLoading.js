import { onScopeDispose, readonly, ref, toValue, watch } from 'vue';

// Delay only the placeholder. A completed read may animate real content only
// when that same destination's placeholder was visible; data is never held.
export function useDeferredLoading(pending, { identity, hasContent } = {}) {
  const skeletonVisible = ref(false);
  const revealContent = ref(false);
  let timer;
  let wasPending = false;
  let previousIdentity;
  const cancel = () => clearTimeout(timer);
  watch(
    [
      () => Boolean(toValue(pending)),
      () => toValue(identity),
      () => Boolean(toValue(hasContent)),
    ],
    ([loading, currentIdentity, contentReady]) => {
      const handoff =
        !loading &&
        wasPending &&
        Object.is(currentIdentity, previousIdentity) &&
        skeletonVisible.value &&
        contentReady;
      cancel();
      skeletonVisible.value = false;
      revealContent.value = handoff;
      wasPending = loading;
      previousIdentity = currentIdentity;
      if (loading)
        timer = setTimeout(() => (skeletonVisible.value = true), 180);
    },
    // Observe a complete prop/state patch: loading, identity and content may
    // update together in different assignment orders.
    { immediate: true, flush: 'post' },
  );
  onScopeDispose(cancel);
  return {
    skeletonVisible: readonly(skeletonVisible),
    revealContent: readonly(revealContent),
    finishReveal() {
      revealContent.value = false;
    },
  };
}
