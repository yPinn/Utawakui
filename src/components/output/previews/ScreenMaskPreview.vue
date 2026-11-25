<script setup>
import { computed, useTemplateRef } from 'vue';
import gsap from 'gsap';
import {
  outputScreenMaskFontFamilyCss,
  outputScreenMaskLayout,
} from '../../../../shared/outputAppearance.mjs';
import {
  clearScreenMaskFrame,
  renderScreenMaskFrame,
} from '../../../../overlay/lyrics/screenMask.mjs';
import '../../../../overlay/lyrics/screenMask.css';
import { useOutputPreviewMotion } from '../../../composables/output/useOutputPreviewMotion.js';

const props = defineProps({
  scene: { type: Object, required: true },
  animated: { type: Boolean, default: false },
});

const root = useTemplateRef('root');
const screenMask = useTemplateRef('screen-mask');
const current = useTemplateRef('current');
const durationMs = 2200;
const layout = computed(() =>
  outputScreenMaskLayout(props.scene.appearance?.screenMaskLayout),
);
const style = computed(() => ({
  '--ovl-user-text-color': props.scene.appearance?.textColor,
  '--screen-mask-font': outputScreenMaskFontFamilyCss(
    props.scene.appearance ?? {},
    props.scene.lyrics?.language,
  ),
}));

function elements() {
  return {
    root: root.value,
    screenMask: screenMask.value,
    current: current.value,
  };
}

function render(next = false, playing = false) {
  const { frame, lyrics } = props.scene;
  const text = next ? lyrics?.next : (frame?.currentText ?? lyrics?.current);
  const rows = text
    ?.split(/\r?\n/u)
    .map((row) => row.trim())
    .filter(Boolean);
  renderScreenMaskFrame(
    elements(),
    {
      visible: Boolean(text),
      currentText: text,
      language: lyrics?.language,
      lineIndex: Number(next),
      screenMask: { visible: true, elapsedMs: 0, durationMs, playing, rows },
    },
    { screenMaskLayout: layout.value, gsap },
  );
}

useOutputPreviewMotion({
  scene: () => props.scene,
  animated: () => props.animated,
  start() {
    render(false, true);
    if (!props.scene.lyrics?.next) return;
    const seconds = durationMs / 1000;
    const timeline = gsap.timeline({ repeat: -1 });
    timeline.call(() => render(true, true), [], seconds);
    timeline.call(() => render(false, true), [], seconds * 2);
    return () => timeline.kill();
  },
  renderStatic: () => render(),
  stop: () => clearScreenMaskFrame(elements()),
});
</script>

<template>
  <div
    ref="root"
    class="screen-mask-preview"
    :data-screen-mask="layout"
    :style="style"
  >
    <div ref="screen-mask" class="screen-mask-art" hidden></div>
    <p ref="current" class="screen-mask-caption" hidden></p>
  </div>
</template>

<style scoped>
.screen-mask-preview {
  --screen-mask-rem: var(--obs-canvas-rem);
}
</style>
