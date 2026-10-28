import { onScopeDispose, readonly, shallowRef, toValue, watch } from 'vue';

// A render frame only asks the existing player for a fresh media position. It
// never advances a synthetic clock or controls the audio element.
export function useLyricsWaveformClock({
  open,
  trackId,
  positionMs,
  isPlaying,
  sample,
  frames = globalThis.window,
}) {
  const position = shallowRef(null),
    active = shallowRef(false);
  let disposed = false,
    nativeVisible = true,
    frame = null,
    lastPaint = -Infinity;
  function cancel() {
    if (frame !== null) frames?.cancelAnimationFrame?.(frame);
    frame = null;
  }
  function read() {
    if (!toValue(open)) {
      position.value = null;
      return;
    }
    if (!nativeVisible || frames?.document?.hidden) return;
    const value = sample?.();
    const ms =
      value === undefined
        ? toValue(positionMs)
        : value?.trackId === toValue(trackId)
          ? value.positionMs
          : null;
    position.value = Number.isFinite(ms) && ms >= 0 ? ms : null;
  }
  function schedule() {
    if (
      disposed ||
      !nativeVisible ||
      frames?.document?.hidden ||
      !toValue(open) ||
      !toValue(isPlaying) ||
      !frames?.requestAnimationFrame
    )
      return;
    frame = frames.requestAnimationFrame((time) => {
      frame = null;
      if (time - lastPaint >= 1000 / 30) {
        lastPaint = time;
        read();
      }
      schedule();
    });
  }
  function refresh() {
    cancel();
    active.value =
      !disposed &&
      Boolean(toValue(open)) &&
      nativeVisible &&
      !frames?.document?.hidden;
    read();
    schedule();
  }
  const unsubscribeVisibility =
    frames?.Utawakui?.onMainWindowVisibilityChanged?.((visible) => {
      nativeVisible = visible;
      refresh();
    });
  frames?.document?.addEventListener?.('visibilitychange', refresh);
  watch(
    [
      () => toValue(open),
      () => toValue(trackId),
      () => toValue(positionMs),
      () => toValue(isPlaying),
    ],
    refresh,
    { immediate: true, flush: 'sync' },
  );
  onScopeDispose(() => {
    disposed = true;
    active.value = false;
    cancel();
    frames?.document?.removeEventListener?.('visibilitychange', refresh);
    unsubscribeVisibility?.();
  });
  return { position: readonly(position), active: readonly(active) };
}
