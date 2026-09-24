import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

// Extrapolates a periodically-refreshed duration reading (e.g. OBS's own
// outputDuration, captured at connect time or a later on-demand snapshot —
// see obsAdapter.js) into a smoothly ticking local clock. One local
// setInterval, pure arithmetic — this never re-requests the source value.
// The source only ever advances when a real snapshot arrives (matching
// integration-adapter-contract.md's "reacts to semantic boundaries, not a
// generic clock flood" principle); this composable only interpolates
// between those points so a titlebar/UI clock doesn't visibly freeze.
export function useElapsedClock(
  durationMsSource,
  { tickMs = 1000, now = () => Date.now() } = {},
) {
  const baseline = ref(null); // { durationMs, capturedAt } | null
  // Seeded from the same now() call as the first baseline below (not its
  // own independent now() at declaration time) so a fresh baseline always
  // starts at exactly zero elapsed — two separate now() calls a fraction of
  // a millisecond apart would otherwise occasionally read back off by 1ms.
  const tick = ref(null);
  let timer = null;

  watch(
    durationMsSource,
    (durationMs) => {
      const capturedAt = now();
      tick.value = capturedAt;
      baseline.value = Number.isFinite(durationMs)
        ? { durationMs, capturedAt }
        : null;
    },
    { immediate: true },
  );

  onMounted(() => {
    timer = setInterval(() => {
      tick.value = now();
    }, tickMs);
  });
  onUnmounted(() => {
    clearInterval(timer);
  });

  return computed(() => {
    if (!baseline.value) return null;
    return baseline.value.durationMs + (tick.value - baseline.value.capturedAt);
  });
}
