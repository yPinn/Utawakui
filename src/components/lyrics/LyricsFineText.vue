<script setup>
import { computed, onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { fineTextParts } from '../../../shared/presentation/lyricsFineFrame.mjs';
import {
  cancelLyricsFinePaint,
  paintLyricsFineUnit,
} from '../../../shared/browser/lyricsFinePaint.mjs';

const props = defineProps({
  frame: { type: Object, required: true },
  readingSegments: { type: Array, default: null },
  readingGaps: { type: Array, default: () => [] },
  presentation: { type: String, default: 'list' },
});
const root = useTemplateRef('root');
const groups = computed(() => {
  const frame = props.frame;
  let cursor = 0;
  const coarse = frame.chunks.map((chunk) => {
    const from = cursor;
    cursor += chunk.text.length;
    return { from, to: cursor, state: chunk.state };
  });
  const readings =
    props.readingSegments?.map((s) => s.t).join('') === frame.text
      ? props.readingSegments
      : [{ t: frame.text }];
  cursor = 0;
  return readings.map((reading, index) => {
    const from = cursor;
    cursor += reading.t.length;
    return {
      from,
      index,
      reading: reading.r,
      parts: fineTextParts(
        frame.text,
        frame.fineTiming.units,
        from,
        cursor,
      ).map((part) => ({
        ...part,
        cue: coarse.some(
          (chunk) =>
            chunk.state === 'active' &&
            chunk.from < part.to &&
            chunk.to > part.from,
        ),
        progress: part.unitId
          ? Math.max(
              0,
              Math.min(
                1,
                (((frame.paintClock?.positionMs ?? 0) - part.startMs) /
                  (part.endMs - part.startMs) -
                  part.paintFrom) /
                  (part.paintTo - part.paintFrom),
              ),
            )
          : null,
      })),
    };
  });
});
let painted = [];
function clearPaint() {
  for (const node of painted) cancelLyricsFinePaint(node);
  painted = [];
}
function paint() {
  clearPaint();
  const clock = props.frame.paintClock;
  if (!clock || !root.value) return;
  const units = new Map(
    props.frame.fineTiming.units.map((unit) => [unit.unitId, unit]),
  );
  const reducedMotion =
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ===
    true;
  painted = Array.from(root.value.querySelectorAll('[data-lyrics-fine-unit]'));
  for (const node of painted)
    paintLyricsFineUnit(node, units.get(node.dataset.lyricsFineUnit), clock, {
      reducedMotion,
      paintFrom: Number(node.dataset.lyricsFineFrom),
      paintTo: Number(node.dataset.lyricsFineTo),
    });
}
watch(() => [props.frame, props.readingSegments], paint, { flush: 'post' });
onMounted(paint);
onUnmounted(clearPaint);
</script>

<template>
  <span
    ref="root"
    class="lyrics-fine-text"
    :class="{ 'lyrics-fine-text--sheet': presentation === 'sheet' }"
  >
    <component
      :is="group.reading ? 'ruby' : 'span'"
      v-for="group in groups"
      :key="group.from"
      class="lyrics-fine-text__group"
      :style="
        readingGaps[group.index] > 0
          ? { '--lyrics-ruby-gap': `${readingGaps[group.index]}em` }
          : undefined
      "
    >
      <span
        v-for="part in group.parts"
        :key="`${part.from}:${part.to}`"
        :class="{
          'lyrics-fine-text__cue lyrics-line__experimental-active': part.cue,
          'lyrics-fine-text__ink': part.unitId,
        }"
        :data-lyrics-fine-unit="part.unitId"
        :data-lyrics-fine-from="part.unitId ? part.paintFrom : undefined"
        :data-lyrics-fine-to="part.unitId ? part.paintTo : undefined"
        :data-text="part.unitId ? part.text : undefined"
        :style="
          part.unitId
            ? { '--lyrics-fine-progress': `${part.progress * 100}%` }
            : undefined
        "
        >{{ part.text }}</span
      ><rt v-if="group.reading">{{ group.reading }}</rt>
    </component>
  </span>
</template>

<style>
@property --lyrics-fine-progress {
  syntax: '<percentage>';
  inherits: true;
  initial-value: 0%;
}
</style>
<style scoped>
.lyrics-fine-text__cue {
  text-decoration: underline;
  text-decoration-color: var(--ui-color-accent);
  text-underline-offset: 0.15em;
}
.lyrics-fine-text rt {
  font-size: var(--ui-lyrics-ruby-font-size);
  font-weight: var(--ui-lyrics-ruby-font-weight);
  line-height: var(--ui-lyrics-ruby-line-height);
  color: inherit;
  user-select: none;
}
.lyrics-fine-text--sheet .lyrics-fine-text__group {
  margin-inline-start: var(--lyrics-ruby-gap, 0);
}
.lyrics-fine-text--sheet ruby {
  position: relative;
  display: inline-block;
}
.lyrics-fine-text--sheet rt {
  position: absolute;
  inset-block-end: 88%;
  inset-inline-start: 50%;
  display: block;
  white-space: nowrap;
  transform: translateX(-50%);
}
.lyrics-fine-text__ink {
  position: relative;
  display: inline-block;
  max-inline-size: 100%;
  color: var(--ui-color-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.lyrics-fine-text__ink::after {
  position: absolute;
  inset: 0;
  content: attr(data-text) / '';
  color: var(--ui-color-accent);
  clip-path: inset(-0.2em calc(100% - var(--lyrics-fine-progress)) -0.2em 0);
  pointer-events: none;
}
@media (forced-colors: active) {
  .lyrics-fine-text__ink::after {
    content: none;
  }
}
</style>
