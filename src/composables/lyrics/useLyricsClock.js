import { computed, toValue, watch } from 'vue';
import { prepareLocalLyricsPaintFrame } from '../../../shared/presentation/lyricsFineFrame.mjs';

// A display deadline is only a reason to read the audio element again. It is
// never evidence that media has actually reached that deadline.
export function useLyricsClock({
  playerState,
  selectedTrackId,
  offsetMs,
  document,
  positionMs,
  samplePlaybackClock,
}) {
  const boundaries = computed(() => {
    const values = [];
    for (const line of toValue(document)?.lines ?? []) {
      values.push(line.startMs, line.endMs);
      for (const segment of line.segments ?? [])
        values.push(segment.startMs, segment.endMs);
      for (const segment of line.estimatedStarts?.segments ?? [])
        values.push(segment.startMs);
      values.push(...(prepareLocalLyricsPaintFrame(line)?.cueEnds ?? []));
    }
    return [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b);
  });
  let timer = null;
  function cancel() {
    clearTimeout(timer);
    timer = null;
  }
  function sampleAndSchedule() {
    cancel();
    if (
      !toValue(selectedTrackId) ||
      playerState.track?.id !== toValue(selectedTrackId)
    ) {
      positionMs.value = null;
      return;
    }
    const sample = samplePlaybackClock();
    if (sample.trackId !== toValue(selectedTrackId)) {
      positionMs.value = null;
      return;
    }
    const position = sample.positionMs + toValue(offsetMs);
    positionMs.value = position;
    if (sample.phase !== 'playing' || !(sample.rate > 0)) return;
    const points = boundaries.value;
    let low = 0;
    let high = points.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (points[mid] <= position) low = mid + 1;
      else high = mid;
    }
    if (low === points.length) return;
    timer = setTimeout(
      sampleAndSchedule,
      Math.min(2147483647, Math.max(4, (points[low] - position) / sample.rate)),
    );
  }
  const stopWatch = watch(
    [
      boundaries,
      () => toValue(selectedTrackId),
      () => toValue(offsetMs),
      () => playerState.track?.id,
      () => playerState.currentTime,
      () => playerState.playbackPhase,
      () => playerState.tempoRate,
      () => playerState.playbackRevision,
      () => playerState.continuityRevision,
    ],
    sampleAndSchedule,
    // Batch a transport action's state writes and audio-element assignments.
    // A synchronous rate watcher would sample before audio.playbackRate is set.
    { immediate: true },
  );
  return {
    stop() {
      stopWatch();
      cancel();
    },
  };
}
