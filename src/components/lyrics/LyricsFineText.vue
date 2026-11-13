<script setup>
import { computed } from 'vue';
import { lyricsCueTextGroups } from '../../utils/lyricsCueText.js';

const props = defineProps({
  frame: { type: Object, required: true },
  readingSegments: { type: Array, default: null },
  readingGaps: { type: Array, default: () => [] },
  presentation: { type: String, default: 'list' },
  // Display line [from, to) of frame.text; null renders the whole line.
  range: { type: Object, default: null },
});
// Reading and timing partitions may cross. Slice their text intersections only;
// the original chunks remain the sole authority for the active word cue.
const groups = computed(() => {
  const range = props.range;
  // A range edge inside a plain group becomes a part cut.
  const cut = range?.from > 0 ? range.from : range?.to;
  const all = lyricsCueTextGroups(props.frame, props.readingSegments, cut);
  if (!range) return all;
  return all
    .map((group) => ({
      ...group,
      leading: group.from >= range.from,
      parts: group.parts.filter(
        (part) => part.from >= range.from && part.to <= range.to,
      ),
    }))
    .filter((group) => group.parts.length);
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
        group.leading !== false && readingGaps[group.index] > 0
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
  line-height: var(--ui-lyrics-line-height);
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
