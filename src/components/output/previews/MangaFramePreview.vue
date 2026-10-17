<script setup>
import { computed } from 'vue';
import {
  mangaFrameLengthTier,
  mangaFramePlacementForBubble,
  mangaFrameTextLayout,
} from '../../../../shared/presentation/mangaFrameContract.mjs';
import {
  adaptMangaLyricsPresentation,
  analyzeLyricsSource,
} from '../../../../shared/presentation/lyricsPresentation.mjs';
import MangaFrameSvg from '../MangaFrameSvg.vue';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});

const lyrics = computed(() => props.scene?.lyrics ?? {});
const mangaBubbles = computed(() => {
  const analysis = analyzeLyricsSource(lyrics.value.current);
  const bubbles = adaptMangaLyricsPresentation(analysis, {
    language: lyrics.value.language,
  }).bubbles;
  // Same placement contract the runtime Overlay applies to each bubble.
  return bubbles.map((bubble, index) => ({
    ...bubble,
    layout: mangaFrameTextLayout(bubble.text, bubbles.length, {
      language: lyrics.value.language,
      readingLine: lyrics.value.reading,
      sourceRanges: bubble.sourceRanges,
    }),
    order: index + 1,
    placement: mangaFramePlacementForBubble({
      bubbleCount: bubbles.length,
      bubbleIndex: index,
      lineIndex: lyrics.value.lineIndex,
      text: bubble.text,
    }),
  }));
});
</script>

<template>
  <div
    class="obs-template-mockup__content obs-template-mockup__content--lyrics"
  >
    <span
      class="obs-template-mockup__manga-bubbles"
      :data-manga-count="mangaBubbles.length"
    >
      <span
        v-for="(bubble, index) in mangaBubbles"
        :key="`${bubble.kind}-${index}`"
        class="obs-template-mockup__manga-bubble"
        :data-lyric-kind="bubble.kind"
        :data-manga-length="mangaFrameLengthTier(bubble.text)"
        :data-manga-language="bubble.layout.language"
        :data-manga-script="bubble.layout.script"
        :data-manga-columns="bubble.layout.columnCount"
        :data-manga-side="bubble.placement.side"
        :data-manga-order="bubble.order"
        :style="{
          '--ui-manga-anchor-y': `${bubble.placement.anchorYPercent}%`,
          '--ui-manga-inline-jitter': `${bubble.placement.inlineJitterRem}`,
          '--ui-manga-frame-required-block-size': `${bubble.layout.requiredBlockSizeEm}em`,
        }"
      >
        <MangaFrameSvg
          class="obs-template-mockup__manga-frame"
          frame-id="spoken"
        />
        <strong class="obs-template-mockup__manga-text">
          <template
            v-for="(column, columnIndex) in bubble.layout.columnTokens"
            :key="columnIndex"
          >
            <br v-if="columnIndex > 0" />
            <template v-for="(token, tokenIndex) in column" :key="tokenIndex">
              <ruby v-if="token.reading">
                {{ token.text }}<rt>{{ token.reading }}</rt>
              </ruby>
              <template v-else>{{ token.text }}</template>
            </template>
          </template>
        </strong>
      </span>
    </span>
  </div>
</template>

<style src="./MangaFramePreview.css"></style>
