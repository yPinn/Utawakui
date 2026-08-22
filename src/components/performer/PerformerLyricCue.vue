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
  color: var(--ui-color-text-muted);
  text-align: center;
}

.performer-lyric-cue__text,
.performer-lyric-cue__reading {
  margin: 0;
  overflow-wrap: anywhere;
}

.performer-lyric-cue__text {
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-body);
}

.performer-lyric-cue--current {
  color: var(--ui-color-text);
}

.performer-lyric-cue--current .performer-lyric-cue__text {
  font-size: var(--ui-performer-lyric-current-font-size);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-body);
}

.performer-lyric-cue__reading {
  margin-top: var(--ui-space-2);
  color: var(--ui-color-accent);
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-body);
}

.performer-lyric-cue--current .performer-lyric-cue__reading {
  font-size: var(--ui-font-size-lg);
}

.performer-lyric-cue rt {
  color: var(--ui-color-accent);
  font-size: var(--ui-performer-ruby-font-size);
  font-weight: var(--ui-font-weight-regular);
}

@media (max-height: 400px) {
  .performer-lyric-cue__text {
    font-size: var(--ui-font-size-md);
    line-height: var(--ui-line-height-title);
  }

  .performer-lyric-cue--current .performer-lyric-cue__text {
    font-size: var(--ui-font-size-2xl);
    line-height: var(--ui-line-height-caption);
  }

  .performer-lyric-cue__reading {
    margin-top: var(--ui-space-1);
    font-size: var(--ui-font-size-sm);
  }

  .performer-lyric-cue--current .performer-lyric-cue__reading {
    font-size: var(--ui-font-size-md);
  }
}
</style>
