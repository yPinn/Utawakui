import { computed, readonly, shallowRef, toValue, watch } from 'vue';
import {
  prepareAcousticPreview,
  selectAcousticPreviewFrame,
} from '../../../shared/presentation/lyricsAcousticPreview.mjs';
import { useExperimentalLyricsQueue } from './useExperimentalLyricsQueue.js';
import { lyricsTextVariantLoader } from '../../utils/lyricsTextVariantLoader.js';

export function useExperimentalLyrics({
  document,
  trackId,
  filename,
  offsetMs,
  positionMs,
  variant,
  getBridge = () => window.Utawakui,
}) {
  const estimate = shallowRef({ status: 'missing' }),
    applied = shallowRef(false);
  const queue = useExperimentalLyricsQueue();
  let request = 0;
  const prepared = computed(() =>
    prepareAcousticPreview(
      toValue(document),
      estimate.value,
      toValue(offsetMs),
    ),
  );
  watch(
    [
      () => toValue(document),
      () => toValue(trackId),
      () => toValue(filename),
      () => toValue(offsetMs),
      queue.revision,
    ],
    async () => {
      const current = ++request;
      applied.value = false;
      estimate.value = { status: 'missing' };
      const id = toValue(trackId),
        source = toValue(filename);
      if (!id || !source) return;
      try {
        const value = await getBridge()?.getExperimentalLyricsEstimate?.(
          id,
          source,
        );
        if (request === current)
          estimate.value = value ?? { status: 'missing' };
      } catch {
        if (request === current) estimate.value = { status: 'unavailable' };
      }
    },
    { immediate: true, flush: 'sync' },
  );
  watch(
    () => queue.state.value?.enabled,
    (value) => {
      if (value === false) applied.value = false;
    },
    { flush: 'sync' },
  );
  function setApplied(value) {
    applied.value =
      value === true &&
      prepared.value.status === 'ready' &&
      queue.state.value?.enabled !== false;
  }
  const frame = computed(() => {
    const canonical = toValue(document);
    const value = selectAcousticPreviewFrame(canonical, prepared.value, {
      enabled: applied.value,
      positionMs: toValue(positionMs),
      offsetMs: toValue(offsetMs),
    });
    if (
      !Number.isFinite(toValue(positionMs)) ||
      value?.timingSource !== 'acoustic-estimate'
    )
      return null;
    // A private text projection reuses conversion mapping without changing the
    // canonical document or representing estimated starts as native T2.
    const projected = lyricsTextVariantLoader.project(
      {
        ...canonical,
        lines: [
          {
            ...canonical.lines.find((l) => l.lineId === value.lineId),
            segments: value.chunks,
          },
        ],
      },
      { variant: toValue(variant) },
    );
    const line = projected.lines[0];
    return { ...value, text: line.text, chunks: line.segments };
  });
  return {
    estimate: readonly(estimate),
    prepared,
    applied: readonly(applied),
    setApplied,
    frame,
  };
}
