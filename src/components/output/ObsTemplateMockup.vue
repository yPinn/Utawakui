<script setup>
import { computed } from 'vue';
import { captureSizeForKind } from '../../constants/outputCaptureSizes.js';
import { outputTemplatePreviewFor } from './previews/outputTemplatePreviews.js';

const props = defineProps({
  preset: { type: Object, default: null },
  scene: { type: Object, default: () => ({}) },
  size: {
    type: String,
    default: 'detail',
    validator: (value) => ['thumbnail', 'detail'].includes(value),
  },
  animated: { type: Boolean, default: false },
  backdrop: {
    type: String,
    default: 'dark',
    validator: (value) => ['dark', 'light', 'checker'].includes(value),
  },
});

const previewComponent = computed(() => outputTemplatePreviewFor(props.preset));
// Widgets preview at their own capture size; lyrics use the 1920×1080 canvas.
const canvasStyle = computed(() => {
  const { width, height } = captureSizeForKind(
    props.preset?.kind,
    null,
    props.preset?.id,
  );
  return {
    '--obs-canvas-width': String(width),
    '--obs-canvas-aspect': `${width} / ${height}`,
    '--obs-canvas-ratio': String(width / height),
  };
});
</script>

<template>
  <div
    class="obs-template-mockup"
    :data-kind="preset?.kind ?? 'generic'"
    :data-size="size"
    :data-template-id="preset?.id ?? 'generic'"
    :data-motion="animated ? 'playing' : 'paused'"
    :data-backdrop="backdrop"
    :style="canvasStyle"
    aria-hidden="true"
  >
    <div class="obs-template-mockup__canvas">
      <component
        :is="previewComponent"
        :scene="scene"
        :size="size"
        :animated="animated"
      />
    </div>
  </div>
</template>

<!-- Shared canvas rules load first through the preview registry and each preview
  owns its unscoped obs-template-mockup__* rules; these shared overrides follow. -->
<style src="./ObsTemplateMockup.motion.css"></style>
<style src="./ObsTemplateMockup.reduced-motion.css"></style>
