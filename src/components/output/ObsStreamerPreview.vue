<script setup>
import { computed } from 'vue';
import { performerGuideStyle } from '../../utils/outputPerformerGuide.js';

const props = defineProps({
  src: { type: String, required: true },
  guide: { type: Object, required: true },
  customImage: { type: Boolean, default: false },
});
const regionStyle = computed(() => performerGuideStyle(props.guide));
</script>

<template>
  <div class="obs-streamer-preview" aria-hidden="true">
    <div
      class="obs-streamer-preview__region"
      :style="regionStyle"
      :data-built-in-shape="
        customImage ? undefined : (guide.shape ?? 'ellipse')
      "
    >
      <img
        class="obs-streamer-preview__image"
        :src="src"
        alt=""
        :draggable="false"
        decoding="async"
      />
    </div>
  </div>
</template>

<style scoped>
.obs-streamer-preview {
  position: absolute;
  z-index: var(--ui-output-preview-layer-guide);
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
}

.obs-streamer-preview__region {
  position: absolute;
  transform: translate(-50%, -50%);
  overflow: hidden;
}

.obs-streamer-preview__image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: center;
  -webkit-user-drag: none;
}

[data-built-in-shape] .obs-streamer-preview__image {
  object-fit: contain;
}

/* Fit the bundled silhouette inside curved edges after trimming its transparent border. */
[data-built-in-shape='ellipse'] .obs-streamer-preview__image {
  scale: 0.77;
}

[data-built-in-shape='circle'] .obs-streamer-preview__image {
  scale: 0.82;
}

[data-built-in-shape='roundedRectangle'] .obs-streamer-preview__image {
  scale: 0.98;
}
</style>
