import { watch } from 'vue';

export function usePlaybackDockBehavior({ obs, enabled, active, dock }) {
  let connected = false;
  const stopObs = watch(
    [enabled, () => obs.observed.lifecycle],
    ([automatic, lifecycle]) => {
      // Degraded is still the same authenticated connection. A status refresh,
      // timer tick or degraded recovery must not undo manual dismissal.
      const next = automatic && ['ready', 'degraded'].includes(lifecycle);
      if (next && !connected && lifecycle === 'ready')
        dock.showQueueVariant('arrangement');
      connected = next && (lifecycle === 'ready' || connected);
    },
    { immediate: true },
  );
  const stopCurrent = watch(active, (value, previous) => {
    if (value && !previous) dock.showQueueVariant('arrangement');
  });
  return () => {
    stopObs();
    stopCurrent();
  };
}
