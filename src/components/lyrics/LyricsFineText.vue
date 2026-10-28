<script setup>
import { computed } from 'vue';
import { lyricsCueTextGroups } from '../../utils/lyricsCueText.js';

const props = defineProps({
  frame: { type: Object, required: true },
  readingSegments: { type: Array, default: null },
  readingGaps: { type: Array, default: () => [] },
  presentation: { type: String, default: 'list' },
});
// Reading and timing partitions may cross. Slice their text intersections only;
// the original chunks remain the sole authority for the active word cue.
const groups = computed(() =>
  lyricsCueTextGroups(props.frame, props.readingSegments),
);
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
