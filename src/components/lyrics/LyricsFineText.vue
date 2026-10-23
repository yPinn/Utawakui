<script setup>
import { computed } from 'vue';

const props = defineProps({
  frame: { type: Object, required: true },
  readingSegments: { type: Array, default: null },
  readingGaps: { type: Array, default: () => [] },
  presentation: { type: String, default: 'list' },
});
// Reading and timing partitions may cross. Slice their text intersections only;
// the original chunks remain the sole authority for the active word cue.
const groups = computed(() => {
  const frame = props.frame;
  let cursor = 0;
  const chunks = frame.chunks.map((chunk) => {
    const from = cursor;
    cursor += chunk.text.length;
    return { from, to: cursor, active: chunk.state === 'active' };
  });
  const readings =
    props.readingSegments?.map((s) => s.t).join('') === frame.text
      ? props.readingSegments
      : [{ t: frame.text }];
  cursor = 0;
  return readings.map((reading, index) => {
    const from = cursor;
    cursor += reading.t.length;
    const to = cursor;
    const cuts = [
      ...new Set([
        from,
        to,
        ...Array.from(reading.t.matchAll(/\s+/gu), (match) => [
          from + match.index,
          from + match.index + match[0].length,
        ]).flat(),
        ...chunks
          .flatMap((chunk) => [chunk.from, chunk.to])
          .filter((cut) => cut > from && cut < to),
      ]),
    ].sort((a, b) => a - b);
    return {
      from,
      index,
      reading: reading.r,
      parts: cuts.slice(0, -1).map((start, i) => ({
        from: start,
        to: cuts[i + 1],
        text: frame.text.slice(start, cuts[i + 1]),
        cue:
          /\S/u.test(frame.text.slice(start, cuts[i + 1])) &&
          chunks.some(
            (chunk) =>
              chunk.active && chunk.from < cuts[i + 1] && chunk.to > start,
          ),
      })),
    };
  });
});
</script>

<template>
  <span
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
        :key="part.from"
        :class="{
          'lyrics-fine-text__cue lyrics-line__experimental-active': part.cue,
        }"
        >{{ part.text }}</span
      ><rt v-if="group.reading">{{ group.reading }}</rt>
    </component>
  </span>
</template>

<style scoped>
.lyrics-fine-text__cue {
  text-decoration: underline;
  text-decoration-color: var(--ui-color-accent);
  text-underline-offset: 0.15em;
  text-decoration-skip-ink: none;
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
</style>
