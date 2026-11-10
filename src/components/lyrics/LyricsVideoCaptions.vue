<script setup>
import { computed } from 'vue';
import { t } from '../../utils/i18n.js';
import UiHint from '../ui/UiHint.vue';
import LyricsFineText from './LyricsFineText.vue';

const {
  line,
  nextLine,
  reading,
  readingVariant,
  frame,
  showEmpty,
  translation,
  translationLang,
} = defineProps({
  line: { type: Object, default: null },
  nextLine: { type: Object, default: null },
  reading: { type: Object, default: null },
  readingVariant: { type: String, default: 'off' },
  frame: { type: Object, default: null },
  showEmpty: { type: Boolean, default: false },
  translation: { type: String, default: '' },
  translationLang: { type: String, default: '' },
});

const textFrame = computed(() => {
  if (!line) return null;
  if (frame?.lineId === line.lineId && frame.text === line.text) return frame;
  return { text: line.text, chunks: [] };
});
</script>

<template>
  <section
    class="lyrics-video-captions lyrics-preview"
    :aria-label="t('lyricsDisplay.title')"
  >
    <p v-if="textFrame" class="lyrics-video-captions__current">
      <LyricsFineText
        :frame="textFrame"
        :reading-segments="
          readingVariant === 'furigana' ? reading?.segments : null
        "
      />
      <span
        v-if="readingVariant === 'romaji' && reading?.romaji"
        class="lyrics-video-captions__reading"
        >{{ reading.romaji }}</span
      >
    </p>
    <p
      v-if="textFrame && translation"
      class="lyrics-video-captions__translation"
      :lang="translationLang"
      dir="auto"
    >
      {{ translation }}
    </p>
    <UiHint v-if="!textFrame && showEmpty">{{
      t('trackVideo.waitingLyrics')
    }}</UiHint>
    <p v-if="nextLine" class="lyrics-video-captions__next">
      {{ nextLine.text }}
    </p>
  </section>
</template>

<style scoped>
.lyrics-video-captions {
  display: grid;
  align-content: start;
  gap: var(--ui-space-1);
  min-inline-size: 0;
  min-block-size: 0;
  overflow: auto;
  scrollbar-gutter: stable;
  padding: var(--ui-space-2) var(--ui-space-4);
  text-align: start;
  overflow-wrap: anywhere;
}
.lyrics-video-captions__current,
.lyrics-video-captions__next,
.lyrics-video-captions__translation {
  margin: 0;
}
.lyrics-video-captions__current {
  color: var(--ui-color-text);
  font-size: var(--ui-lyrics-font-size-default);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-lyrics-line-height);
  white-space: pre-line;
}
.lyrics-preview--font-compact .lyrics-video-captions__current {
  font-size: var(--ui-lyrics-font-size-compact);
}
.lyrics-preview--font-large .lyrics-video-captions__current {
  font-size: var(--ui-lyrics-font-size-large);
}
.lyrics-video-captions__reading,
.lyrics-video-captions__next,
.lyrics-video-captions__translation {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-lyrics-romaji-font-size);
  line-height: var(--ui-lyrics-romaji-line-height);
}
.lyrics-video-captions__translation {
  white-space: pre-line;
}
.lyrics-video-captions__reading {
  display: block;
}
</style>
