<script setup>
import { computed } from 'vue';
import {
  DEFAULT_MANGA_FRAME_ID,
  MANGA_FRAME_VIEW_BOX,
  resolveMangaFrame,
} from '../../../overlay/shared/mangaFrameContract.mjs';

const props = defineProps({
  frameId: { type: String, default: DEFAULT_MANGA_FRAME_ID },
});

const frame = computed(() => resolveMangaFrame(props.frameId));
const frameStyle = computed(() => ({
  '--manga-frame-line-join': frame.value.lineJoin ?? 'round',
  '--manga-frame-stroke-width': String(frame.value.strokeWidth ?? 7),
}));
</script>

<template>
  <svg
    class="manga-frame-svg"
    :data-frame-id="frame.id"
    :style="frameStyle"
    :viewBox="MANGA_FRAME_VIEW_BOX"
    aria-hidden="true"
    focusable="false"
  >
    <template v-for="(element, index) in frame.elements" :key="index">
      <path
        v-if="element.tag === 'path'"
        class="manga-frame-svg__shape"
        v-bind="element.attrs"
      />
      <circle
        v-else-if="element.tag === 'circle'"
        class="manga-frame-svg__shape"
        v-bind="element.attrs"
      />
    </template>
  </svg>
</template>

<style scoped>
.manga-frame-svg {
  display: block;
  overflow: visible;
}

.manga-frame-svg__shape {
  fill: var(--manga-frame-paper, currentColor);
  stroke: var(--manga-frame-ink, currentColor);
  stroke-linecap: round;
  stroke-linejoin: var(--manga-frame-line-join, round);
  stroke-width: var(--manga-frame-stroke-width, 7);
  vector-effect: non-scaling-stroke;
}
</style>
