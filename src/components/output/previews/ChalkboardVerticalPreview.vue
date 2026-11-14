<script setup>
import { computed, shallowRef, useTemplateRef } from 'vue';
import gsap from 'gsap';
import {
  clearChalkboardVertical,
  nextChalkboardTransitionDelayMs,
  renderChalkboardVertical,
} from '../../../../overlay/lyrics/chalkboardVertical.mjs';
import { useOutputPreviewMotion } from '../../../composables/output/useOutputPreviewMotion.js';

const props = defineProps({
  scene: { type: Object, required: true },
  animated: { type: Boolean, default: false },
});
const text = computed(
  () => props.scene.frame?.currentText ?? props.scene.lyrics?.current ?? '',
);
const root = useTemplateRef('root');
const current = useTemplateRef('current');
const next = useTemplateRef('next');
const playing = shallowRef(false);
const LINE_MS = 2200;

function elements() {
  return { root: root.value, current: current.value, next: next.value };
}

useOutputPreviewMotion({
  scene: () => props.scene,
  animated: () => props.animated,
  start() {
    const lines = [text.value, props.scene.lyrics?.next].filter(Boolean);
    if (!lines.length) return;
    playing.value = true;
    let timer;
    let index = 0;

    function write() {
      const lineText = lines[index];
      const frame = {
        visible: true,
        currentText: lineText,
        lineIndex: index,
        chalkboardPlaying: true,
        chalkboardRate: 1,
        chalkboardColumns:
          index === 0
            ? (props.scene.frame?.chalkboardColumns ?? [lineText])
            : [lineText],
        chalkboardDurationMs: LINE_MS,
        chalkboardRemainingMs: LINE_MS,
      };
      renderChalkboardVertical(elements(), frame, { gsap });
      const eraseAt = nextChalkboardTransitionDelayMs(frame);
      timer = window.setTimeout(() => {
        renderChalkboardVertical(
          elements(),
          {
            ...frame,
            chalkboardRemainingMs: LINE_MS - eraseAt,
          },
          { gsap },
        );
        timer = window.setTimeout(() => {
          index = (index + 1) % lines.length;
          if (lines.length === 1) clearChalkboardVertical(elements());
          write();
        }, LINE_MS - eraseAt);
      }, eraseAt);
    }

    write();
    return () => window.clearTimeout(timer);
  },
  stop() {
    if (root.value) clearChalkboardVertical(elements());
    playing.value = false;
  },
});
</script>

<template>
  <div
    class="chalkboard-preview"
    :class="{
      'chalkboard-preview--right':
        scene.appearance?.positionAnchor === 'center-right',
    }"
  >
    <span
      class="chalkboard-preview__column"
      :class="{ 'chalkboard-preview__column--measuring': playing }"
    >
      <span class="chalkboard-preview__ink">{{ text }}</span>
      <span class="chalkboard-preview__rule"></span>
    </span>
    <span ref="root" class="chalkboard-preview__motion">
      <span ref="current"></span>
      <span ref="next" hidden></span>
    </span>
  </div>
</template>

<style scoped>
.chalkboard-preview {
  --chalkboard-preview-rule-gap: 0.18em;
  --chalkboard-preview-column-gap: 0.52em;
  position: relative;
  inset-inline-start: -33.333cqi;
  place-self: center;
  display: flex;
  gap: var(--chalkboard-preview-rule-gap);
  color: var(--obs-preview-ink);
  font-family: 'Utawakui Open Huninn', sans-serif;
  font-size: 2.53cqi;
  letter-spacing: 0.075em;
  line-height: 1.12;
}

.chalkboard-preview--right {
  inset-inline-start: 33.333cqi;
}

.chalkboard-preview__motion {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: 0;
}

.chalkboard-preview__motion > span:first-child {
  display: block;
}

.chalkboard-preview__column--measuring {
  visibility: hidden;
}

.chalkboard-preview__column,
.chalkboard-preview :deep(.lyrics-overlay__chalkboard-column) {
  display: flex;
  gap: var(--chalkboard-preview-rule-gap);
}

.chalkboard-preview :deep(.lyrics-overlay__chalkboard-group) {
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-start;
  gap: var(--chalkboard-preview-column-gap);
}

.chalkboard-preview__ink,
.chalkboard-preview :deep(.lyrics-overlay__chalkboard-ink) {
  display: block;
  writing-mode: vertical-rl;
  white-space: pre-wrap;
  max-inline-size: 24.75cqi;
}

.chalkboard-preview__rule,
.chalkboard-preview :deep(.lyrics-overlay__chalkboard-rule) {
  inline-size: max(1px, 0.03em);
  background: currentColor;
  opacity: 0.78;
}
</style>
