<script setup>
import { computed, useTemplateRef } from 'vue';
import gsap from 'gsap';
import { addMangaBubbleFade } from '../../../../overlay/lyrics/mangaFrame.mjs';
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
import { useOutputPreviewMotion } from '../../../composables/output/useOutputPreviewMotion.js';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});

const lyrics = computed(() => props.scene?.lyrics ?? {});
const host = useTemplateRef('host');

function bubblesFor(text, lineIndex, reading) {
  const analysis = analyzeLyricsSource(text);
  const bubbles = adaptMangaLyricsPresentation(analysis, {
    language: lyrics.value.language,
  }).bubbles;
  // Same placement contract the runtime Overlay applies to each bubble.
  return bubbles.map((bubble, index) => ({
    ...bubble,
    layout: mangaFrameTextLayout(bubble.text, bubbles.length, {
      language: lyrics.value.language,
      readingLine:
        props.scene?.appearance?.furigana === 'off' ? undefined : reading,
      sourceRanges: bubble.sourceRanges,
    }),
    order: index + 1,
    placement: mangaFramePlacementForBubble({
      bubbleCount: bubbles.length,
      bubbleIndex: index,
      lineIndex,
      text: bubble.text,
    }),
  }));
}

const mangaBubbles = computed(() =>
  bubblesFor(
    lyrics.value.current,
    lyrics.value.lineIndex,
    lyrics.value.reading,
  ),
);
const nextBubbles = computed(() =>
  bubblesFor(lyrics.value.next, (lyrics.value.lineIndex ?? 0) + 1),
);

function bubbleTargets() {
  return Array.from(host.value?.children ?? [], (group) =>
    Array.from(group.children),
  );
}

useOutputPreviewMotion({
  scene: () => props.scene,
  animated: () => props.animated,
  start() {
    const [current = [], next = []] = bubbleTargets();
    if (!current.length) return;
    const timeline = gsap.timeline({ paused: true, repeat: -1 });
    timeline.set([...current, ...next], { autoAlpha: 0 }, 0);
    addMangaBubbleFade(timeline, current, 'enter', true, 0);
    const handoff = timeline.duration() + 1.2;
    addMangaBubbleFade(timeline, current, 'exit', true, handoff);
    if (next.length) {
      addMangaBubbleFade(timeline, next, 'enter', true, handoff);
      addMangaBubbleFade(
        timeline,
        next,
        'exit',
        true,
        timeline.duration() + 1.2,
      );
    }
    timeline.play();
    return () => timeline.kill();
  },
  stop() {
    gsap.set(bubbleTargets().flat(), { clearProps: 'opacity,visibility' });
  },
});
</script>

<template>
  <div
    ref="host"
    class="obs-template-mockup__content obs-template-mockup__content--lyrics"
  >
    <template
      v-for="(group, groupIndex) in [mangaBubbles, nextBubbles]"
      :key="groupIndex"
    >
      <span
        v-if="groupIndex === 0 || animated"
        class="obs-template-mockup__manga-bubbles"
        :data-manga-count="group.length"
        :data-manga-preview-next="groupIndex === 1 || undefined"
      >
        <span
          v-for="(bubble, index) in group"
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
    </template>
  </div>
</template>

<style src="./MangaFramePreview.css"></style>
