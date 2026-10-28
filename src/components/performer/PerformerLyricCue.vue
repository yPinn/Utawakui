<script setup>
import { computed } from 'vue';
import { lyricsCueTextGroups } from '../../utils/lyricsCueText.js';

const props = defineProps({
  line: { type: Object, default: null },
  reading: { type: Object, default: null },
  current: { type: Boolean, default: false },
  wordCue: { type: Object, default: null },
});

const groups = computed(() => {
  const text = props.line?.text ?? '',
    cue = props.current ? props.wordCue : null;
  const chunks = cue
    ? [
        { text: text.slice(0, cue.from), state: 'past' },
        { text: text.slice(cue.from, cue.to), state: 'active' },
        { text: text.slice(cue.to), state: 'upcoming' },
      ]
    : [{ text, state: 'upcoming' }];
  return lyricsCueTextGroups(
    { text, chunks },
    props.reading?.segments?.map((s) => ({ t: s.text, r: s.reading })),
  );
});
</script>

<template>
  <div
    v-if="line"
    class="performer-lyric-cue"
    :class="{ 'performer-lyric-cue--current': current }"
    :data-cue-priority="current ? 'primary' : 'secondary'"
  >
    <p class="performer-lyric-cue__text">
      <component
        :is="group.reading ? 'ruby' : 'span'"
        v-for="group in groups"
        :key="group.from"
      >
        <span
          v-for="part in group.parts"
          :key="part.from"
          :class="{ 'performer-lyric-cue__word--active': part.cue }"
          >{{ part.text }}</span
        ><rt v-if="group.reading">{{ group.reading }}</rt>
      </component>
    </p>
    <p v-if="reading?.romaji" class="performer-lyric-cue__reading">
      <span v-if="reading.romajiScope === 'line'">整句讀音：</span
      >{{ reading.romaji }}
    </p>
  </div>
</template>

<style scoped>
.performer-lyric-cue {
  min-width: 0;
  color: var(--ui-performer-secondary-foreground);
  text-align: center;
}

.performer-lyric-cue__text,
.performer-lyric-cue__reading {
  margin: 0;
  overflow-wrap: anywhere;
}
.performer-lyric-cue__word--active {
  text-decoration: underline;
  text-decoration-color: var(--ui-color-accent);
  text-underline-offset: 0.15em;
  text-decoration-skip-ink: none;
}

.performer-lyric-cue__text {
  font-size: var(--ui-performer-cue-next-font-size);
  font-weight: var(--ui-type-body-weight);
  line-height: var(--ui-type-body-line-height);
}

.performer-lyric-cue--current {
  color: var(--ui-color-text);
}

.performer-lyric-cue--current .performer-lyric-cue__text {
  font-size: var(--ui-performer-cue-current-font-size);
  font-weight: var(--ui-font-weight-bold);
  line-height: var(--ui-type-body-line-height);
}

.performer-lyric-cue__reading {
  margin-top: var(--ui-space-2);
  color: var(--ui-performer-secondary-foreground);
  font-size: var(--ui-performer-reading-font-size);
  line-height: var(--ui-type-body-line-height);
}

.performer-lyric-cue--current .performer-lyric-cue__reading {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-performer-reading-font-size);
}

.performer-lyric-cue rt {
  color: var(--ui-performer-secondary-foreground);
  font-size: var(--ui-performer-next-ruby-font-size);
  font-weight: var(--ui-type-body-weight);
}

.performer-lyric-cue--current rt {
  color: var(--ui-color-accent);
  font-size: var(--ui-performer-ruby-font-size);
}
</style>
