import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

// Extrapolates a periodically refreshed duration reading (e.g. OBS's
// outputDuration from a connect-time or on-demand snapshot, see obsAdapter.js)
// into a smoothly ticking local clock: one setInterval, pure arithmetic, never
// re-requesting the source. The source advances only when a real snapshot arrives
// (integration-adapter-contract.md: "reacts to semantic boundaries, not a generic
// clock flood"); this only interpolates between snapshots so the UI clock does
// not freeze.
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
