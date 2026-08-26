<script setup>
import { computed, shallowRef } from 'vue';
import { getOutputTemplateThumbnail } from '../../utils/outputTemplateThumbnails.js';
import ObsTemplateMockup from './ObsTemplateMockup.vue';

const props = defineProps({
  preset: { type: Object, default: null },
  scene: { type: Object, default: () => ({}) },
});

const failedSource = shallowRef(null);
const prefersLiveMockup = computed(() => props.preset?.id === 'karaoke-stack');
const bundledSource = computed(() =>
  getOutputTemplateThumbnail(props.preset?.id),
);
const showBundledThumbnail = computed(
  () =>
    !prefersLiveMockup.value &&
    Boolean(bundledSource.value) &&
    failedSource.value !== bundledSource.value,
);

function markThumbnailFailed() {
  failedSource.value = bundledSource.value;
}
</script>

<template>
  <div class="obs-template-thumbnail__frame">
    <img
      v-if="showBundledThumbnail"
      class="obs-template-thumbnail"
      :src="bundledSource"
      width="1280"
      height="720"
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable="false"
      @error="markThumbnailFailed"
    />
    <ObsTemplateMockup
      v-else
      :preset="preset"
      :scene="scene"
      size="thumbnail"
      :animated="false"
    />
  </div>
</template>

<style scoped>
.obs-template-thumbnail__frame {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  aspect-ratio: var(--ui-output-preview-aspect-ratio);
  overflow: hidden;
  border-radius: var(--ui-radius-sm);
}

.obs-template-thumbnail {
  display: block;
  width: 100%;
  max-width: 100%;
  height: 100%;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-output-preview-canvas);
  box-sizing: border-box;
  object-fit: cover;
  pointer-events: none;
}
</style>
