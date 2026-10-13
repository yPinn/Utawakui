<script setup>
import { computed } from 'vue';

const props = defineProps({
  line: { type: Object, default: null },
  reading: { type: Object, default: null },
  current: { type: Boolean, default: false },
});

const hasRuby = computed(() =>
  props.reading?.segments?.some((segment) => segment.reading),
);
</script>

<template>
  <div
    v-if="line"
    class="performer-lyric-cue"
    :class="{ 'performer-lyric-cue--current': current }"
    :data-cue-priority="current ? 'primary' : 'secondary'"
  >
    <p class="performer-lyric-cue__text">
      <template v-if="hasRuby">
        <ruby
          v-for="(segment, index) in reading.segments"
          :key="`${index}-${segment.text}`"
        >
          {{ segment.text
          }}<rt v-if="segment.reading">{{ segment.reading }}</rt>
        </ruby>
      </template>
      <template v-else>{{ line.text }}</template>
    </p>
    <p v-if="reading?.romaji" class="performer-lyric-cue__reading">
      {{ reading.romaji }}
    </p>
  </div>
</template>

<style scoped>
.performer-lyric-cue {
  min-width: 0;
  color: var(--ui-color-text-subtle);
  text-align: center;
}

.performer-lyric-cue__text,
.performer-lyric-cue__reading {
  margin: 0;
  overflow-wrap: anywhere;
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
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-performer-reading-font-size);
  line-height: var(--ui-type-body-line-height);
}

.performer-lyric-cue--current .performer-lyric-cue__reading {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-performer-reading-font-size);
}

.performer-lyric-cue rt {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-performer-ruby-font-size);
  font-weight: var(--ui-type-body-weight);
}

.performer-lyric-cue--current rt {
  color: var(--ui-color-accent);
}
</style>
