import { computed, nextTick, readonly, shallowRef, toValue, watch } from 'vue';
import {
  prepareAcousticPreview,
  selectAcousticPreviewFrame,
} from '../../../shared/presentation/lyricsAcousticPreview.mjs';
import { useExperimentalLyricsQueue } from './useExperimentalLyricsQueue.js';
import { lyricsTextVariantLoader } from '../../utils/lyricsTextVariantLoader.js';
import { mapLyricsFineText } from '../../../shared/presentation/lyricsFineFrame.mjs';

export function useExperimentalLyrics({
  document,
  trackId,
  filename,
  offsetMs,
  positionMs,
  variant,
  playbackState,
  samplePlaybackClock,
  getBridge = () => window.Utawakui,
}) {
  const estimate = shallowRef({ status: 'missing' }),
    applied = shallowRef(false);
  const offsetInvalidated = shallowRef(false);
  const needsReanalysis = computed(
    () =>
      offsetInvalidated.value ||
      estimate.value.reason === 'offset-changed' ||
      (estimate.value.status === 'ready' &&
        estimate.value.preview?.offsetUsedMs !== toValue(offsetMs)),
  );
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
    async (values, previous, onCleanup) => {
      if (previous && values[1] === previous[1] && values[2] === previous[2]) {
        if (values[3] !== previous[3] && estimate.value.status === 'ready')
          offsetInvalidated.value = true;
      } else offsetInvalidated.value = false;
      const current = ++request;
      onCleanup(() => {
        if (request === current) request++;
      });
      applied.value = false;
      estimate.value = { status: 'missing' };
      const id = toValue(trackId),
        source = toValue(filename);
      if (!id || !source) return;
      // Clear application synchronously, but batch reads until the selected
      // track, filename and document have settled in the same renderer turn.
      if (previous?.length) await nextTick();
      if (request !== current) return;
      try {
        const value = await getBridge()?.getExperimentalLyricsEstimate?.(
          id,
          source,
        );
        if (request === current) {
          estimate.value = value ?? { status: 'missing' };
          if (prepared.value.status === 'ready')
            offsetInvalidated.value = false;
        }
      } catch {
        if (request === current) estimate.value = { status: 'unavailable' };
      }
    },
    { immediate: true, flush: 'sync' },
  );
  watch(
    () => [queue.state.value?.enabled, queue.state.value?.allowed],
    (values) => {
      if (values.includes(false)) applied.value = false;
    },
    { flush: 'sync' },
  );
  function setApplied(value) {
    applied.value =
      value === true &&
      prepared.value.status === 'ready' &&
      queue.state.value?.allowed !== false &&
      queue.state.value?.enabled !== false;
  }
  // A complete, clock-independent presentation document. Canonical timing and
  // source granularity remain untouched; model starts are a separate extension.
  const outputDocument = computed(() => {
    if (!applied.value || prepared.value.status !== 'ready') return null;
    const canonical = toValue(document);
    const modeled = new Set();
    const lines = canonical.lines.map((line, index) => {
      const estimateLine = prepared.value.lines[index];
      if (line.segments?.length || estimateLine?.status !== 'ready')
        return line;
      modeled.add(line.lineId);
      return {
        ...line,
        segments: estimateLine.chunks.map((chunk) => ({
          segmentId: `model-${chunk.chunkId}`,
          text: line.text.slice(chunk.from, chunk.to),
          startMs: chunk.startMs,
          endMs: null,
        })),
      };
    });
    if (!modeled.size) return null;
    const projected = lyricsTextVariantLoader.project(
      { ...canonical, lines },
      { variant: toValue(variant) },
    );
    return {
      ...projected,
      lines: projected.lines.map((line) => {
        if (!modeled.has(line.lineId)) return line;
        const { segments, ...base } = line;
        const sourceIndex = canonical.lines.findIndex(
          (entry) => entry.lineId === line.lineId,
        );
        const fine = mapLyricsFineText(
          canonical.lines[sourceIndex].text,
          line.text,
          prepared.value.lines[sourceIndex].fineTiming,
          (text) =>
            lyricsTextVariantLoader.project(
              {
                ...canonical,
                lines: [
                  {
                    ...canonical.lines[sourceIndex],
                    text,
                    segments: undefined,
                  },
                ],
              },
              { variant: toValue(variant) },
            ).lines[0].text,
        );
        return {
          ...base,
          estimatedStarts: {
            version: 1,
            segments: segments.map(({ segmentId, text, startMs }) => ({
              segmentId,
              text,
              startMs,
            })),
          },
          ...(fine ? { estimatedFineTiming: fine } : {}),
        };
      }),
    };
  });
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
    // Text conversion and range mapping are prepared per content revision,
    // never re-run on transport ticks or animation frames.
    const line = outputDocument.value?.lines.find(
      (entry) => entry.lineId === value.lineId,
    );
    const fine = line?.estimatedFineTiming;
    const state = toValue(playbackState);
    // Depend on transport revisions as well as lyric boundaries; pause/seek/rate
    // must cancel paint even when the sampled lyric position is unchanged.
    const revision = `${state?.playbackRevision ?? ''}:${state?.continuityRevision ?? ''}:${state?.playbackPhase ?? ''}:${state?.tempoRate ?? ''}`;
    const sample = fine ? samplePlaybackClock?.() : null;
    return {
      ...value,
      text: line?.text ?? value.text,
      chunks: value.chunks.map((chunk, index) => ({
        ...chunk,
        text: line?.estimatedStarts?.segments[index]?.text ?? chunk.text,
      })),
      ...(fine
        ? {
            fineTiming: fine,
            paintClock: {
              positionMs: sample
                ? sample.positionMs + toValue(offsetMs)
                : toValue(positionMs),
              sampledAtMs: sample ? Date.parse(sample.sampledAt) : Date.now(),
              rate: sample?.rate ?? 1,
              playing: sample?.phase === 'playing',
              revision,
            },
          }
        : {}),
    };
  });
  return {
    estimate: readonly(estimate),
    prepared,
    applied: readonly(applied),
    needsReanalysis,
    setApplied,
    outputDocument,
    frame,
  };
}
