import { computed, readonly, shallowRef, toValue, watch } from 'vue';
import {
  prepareAcousticPreview,
  selectAcousticPreviewFrame,
} from '../../../shared/presentation/lyricsAcousticPreview.mjs';

export function useLyricsAcousticPreview({
  document,
  estimate,
  sourceKey,
  offsetMs,
  positionMs,
  durationMs,
}) {
  const enabled = shallowRef(false);
  const prepared = computed(() =>
    prepareAcousticPreview(
      toValue(document),
      toValue(estimate),
      toValue(offsetMs) ?? 0,
    ),
  );
  watch(
    [
      () => toValue(sourceKey),
      () => toValue(document),
      () => prepared.value.estimateId,
      () => prepared.value.status,
      () => toValue(offsetMs),
    ],
    () => {
      enabled.value = false;
    },
    { flush: 'sync' },
  );
  function setEnabled(value) {
    enabled.value = value === true && prepared.value.status === 'ready';
    return enabled.value;
  }
  const frame = computed(() =>
    selectAcousticPreviewFrame(toValue(document), prepared.value, {
      enabled: enabled.value,
      positionMs: toValue(positionMs),
      offsetMs: toValue(offsetMs) ?? 0,
      durationMs: toValue(durationMs),
    }),
  );
  return { enabled: readonly(enabled), prepared, frame, setEnabled };
}
