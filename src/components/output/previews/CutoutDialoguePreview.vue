<script setup>
import { computed, useTemplateRef } from 'vue';
import gsap from 'gsap';
import { outputLocalFontCssValue } from '../../../../shared/outputAppearance.mjs';
import {
  clearCutoutDialogue,
  renderCutoutDialogue,
} from '../../../../overlay/lyrics/cutoutDialogue.mjs';
import '../../../../overlay/lyrics/cutoutDialogue.css';
import { useOutputPreviewMotion } from '../../../composables/output/useOutputPreviewMotion.js';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  animated: { type: Boolean, default: false },
});

const stage = useTemplateRef('stage');
const fontStyle = computed(() => {
  const { fontFamily, fontScale } = props.scene.appearance ?? {};
  const stack =
    {
      sans: 'var(--ui-output-preview-font-ui)',
      serif: 'var(--ui-output-preview-font-display-cjk)',
      rounded: 'var(--ui-output-preview-font-rounded)',
    }[fontFamily] ?? outputLocalFontCssValue(fontFamily);
  return {
    '--cutout-font': stack,
    '--cutout-font-scale': { small: 0.85, large: 1.2 }[fontScale] ?? 1,
  };
});
function renderDemo(playing = false, next = false) {
  const node = stage.value;
  if (!node) return;
  const { frame, lyrics, track, appearance } = props.scene;
  const currentText = next
    ? lyrics?.next
    : (frame?.currentText ?? lyrics?.current);
  renderCutoutDialogue(
    node,
    {
      visible: Boolean(currentText),
      currentText,
      nextText: next ? undefined : (frame?.nextText ?? lyrics?.next),
      language: frame?.language ?? lyrics?.language,
      lineIndex: (frame?.lineIndex ?? lyrics?.lineIndex ?? 0) + Number(next),
      lineRemainingMs: 2000,
      cutoutDialogue: {
        trackId: frame?.cutoutDialogue?.trackId ?? track?.id,
        artist: track?.artist,
        previousText: next
          ? lyrics?.current
          : frame?.cutoutDialogue?.previousText,
        ageMs: 0,
        lineDurationMs: 2000,
        playing,
        rate: 1,
      },
    },
    { appearance, gsap, reducedMotion: !playing },
  );
}

useOutputPreviewMotion({
  scene: () => props.scene,
  animated: () => props.animated,
  start() {
    renderDemo(true);
    const timeline = gsap.timeline({ repeat: -1 });
    timeline.call(
      () => renderDemo(true, Boolean(props.scene.lyrics?.next)),
      [],
      2,
    );
    timeline.call(() => renderDemo(true), [], 4);
    return () => {
      timeline.kill();
      clearCutoutDialogue(stage.value);
    };
  },
  stop: renderDemo,
});
</script>

<template>
  <div ref="stage" class="cutout-dialogue" :style="fontStyle" hidden></div>
</template>
