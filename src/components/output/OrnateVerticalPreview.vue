<script setup>
import { computed } from 'vue';
import { ornateVerticalRevealDelaySeconds } from '../../../shared/presentation/ornateVerticalMotion.mjs';
import {
  adaptOrnateVerticalLyricsPresentation,
  createOrnateVerticalDocumentContext,
} from '../../../shared/presentation/ornateVerticalPresentation.mjs';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  animated: { type: Boolean, default: false },
});

const sourceTexts = computed(() => [
  props.scene?.current ?? '夜が明けるまで言葉を残していく',
  props.scene?.next ?? '言葉だけが残る',
]);

const previewLines = computed(() => {
  const documentContext = createOrnateVerticalDocumentContext(
    sourceTexts.value,
  );

  return sourceTexts.value.map((text, lineIndex) => {
    const presentation = adaptOrnateVerticalLyricsPresentation(text, {
      documentContext,
      lineIndex,
    });

    return {
      ...presentation,
      offset: lineIndex === 0 ? '0s' : '-3.2s',
      segments: presentation.segments.map((segment) => ({
        ...segment,
        units: segment.units.map((unit) => ({
          ...unit,
          delay: `${ornateVerticalRevealDelaySeconds(unit.index)}s`,
        })),
      })),
    };
  });
});
</script>

<template>
  <span class="ornate-preview" :data-animated="animated ? 'true' : 'false'">
    <span
      v-for="(line, lineIndex) in previewLines"
      :key="`${lineIndex}-${line.text}`"
      class="ornate-preview__line"
      :data-placement="line.placement"
      :data-segment-count="line.segments.length"
      :style="{ '--ornate-line-offset': line.offset }"
    >
      <span
        v-for="segment in line.segments"
        :key="`${lineIndex}-segment-${segment.index}-${segment.text}`"
        class="ornate-preview__segment"
        :data-segment-index="segment.index"
      >
        <span
          v-for="unit in segment.units"
          :key="`${lineIndex}-${unit.index}-${unit.text}`"
          class="ornate-preview__unit"
          :data-emphasis="unit.emphasis"
          :data-kind="unit.kind"
          :data-text="unit.text"
          :style="{ '--ornate-unit-delay': unit.delay }"
          >{{ unit.text }}</span
        >
      </span>
    </span>
  </span>
</template>

<style scoped>
@font-face {
  font-family: 'Utawakui Hina Mincho';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('../../../shared/assets/fonts/HinaMincho-Regular.ttf')
    format('truetype');
}

.ornate-preview {
  position: absolute;
  inset: 0;
  isolation: isolate;
  min-inline-size: 0;
  min-block-size: 0;
  display: grid;
  box-sizing: border-box;
  overflow: hidden;
  padding: 5% 6%;
  color: var(--obs-preview-ink);
  font-family: 'Utawakui Hina Mincho', 'Hina Mincho', 'Yu Mincho', serif;
  line-height: 0.94;
  text-shadow: var(--ui-output-preview-ornate-shadow);
}

.ornate-preview__line {
  position: relative;
  grid-area: 1 / 1;
  align-self: center;
  justify-self: end;
  max-inline-size: 100%;
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  gap: 0.62em;
  font-size: var(--ui-output-preview-ornate-font-size);
  opacity: 0;
}

.ornate-preview__segment {
  display: block;
  flex: 0 0 auto;
  line-height: inherit;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  white-space: nowrap;
}

.ornate-preview__line:first-child {
  opacity: 1;
}

.ornate-preview__unit {
  --ornate-enter-clip: inset(0 0 0% 0);

  position: relative;
  display: inline;
  font-size: inherit;
  line-height: inherit;
}

.ornate-preview__unit[data-kind='han'] {
  --ornate-enter-clip: inset(0 0 100% 0);
}

.ornate-preview__unit[data-emphasis='keyword'] {
  z-index: 0;
  color: var(--ui-output-preview-ornate-paper);
  font-size: inherit;
  line-height: inherit;
}

.ornate-preview__unit[data-emphasis='keyword']::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  content: attr(data-text);
  color: var(--ui-output-preview-ornate-echo);
  text-shadow: none;
  transform: translate(0.055em, 0.035em);
}

.ornate-preview[data-animated='true'] .ornate-preview__line {
  animation: ornate-preview-line-cycle 6.4s cubic-bezier(0.16, 1, 0.3, 1)
    infinite both;
  animation-delay: var(--ornate-line-offset);
}

.ornate-preview[data-animated='true'] .ornate-preview__unit {
  animation: ornate-preview-unit-cycle 6.4s cubic-bezier(0.16, 1, 0.3, 1)
    infinite both;
  animation-delay: calc(var(--ornate-line-offset) + var(--ornate-unit-delay));
  will-change: clip-path, opacity;
}

@keyframes ornate-preview-line-cycle {
  0%,
  48% {
    opacity: 1;
  }

  52%,
  100% {
    opacity: 0;
  }
}

@keyframes ornate-preview-unit-cycle {
  0% {
    clip-path: var(--ornate-enter-clip);
    opacity: 0;
  }

  7%,
  45% {
    clip-path: inset(0 0 0% 0);
    opacity: 1;
  }

  50%,
  100% {
    clip-path: inset(0 0 0% 0);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ornate-preview__line,
  .ornate-preview__unit {
    animation: none !important;
    clip-path: none !important;
  }

  .ornate-preview__line:not(:first-child) {
    opacity: 0;
  }
}
</style>
