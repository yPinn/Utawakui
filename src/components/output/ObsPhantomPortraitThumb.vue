<script setup>
import { computed, reactive, watch } from 'vue';
import { UserRound } from '../../icons/index.js';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const props = defineProps({
  photoId: { type: String, default: '' },
  trackId: { type: String, default: '' },
  background: { type: String, required: true },
  size: { type: String, required: true },
  active: { type: Boolean, default: true },
  thumbnail: { type: Object, default: null },
});

const mediaBase = 'utawakui-media://phantom-portrait';
const customPhoto = computed(() =>
  props.photoId
    ? `${mediaBase}/custom/${encodeURIComponent(props.photoId)}`
    : '',
);
const artistPhoto = computed(() =>
  props.trackId
    ? `${mediaBase}/artist/${encodeURIComponent(props.trackId)}`
    : '',
);
const failed = reactive(new Set());
const customUrl = computed(() => props.thumbnail?.custom || customPhoto.value);
const artistUrl = computed(() => props.thumbnail?.artist || artistPhoto.value);
watch([customUrl, artistUrl, () => props.active], () => failed.clear());
const photo = computed(() =>
  props.active
    ? [customUrl.value, artistUrl.value].find((url) => url && !failed.has(url))
    : undefined,
);
</script>

<template>
  <UiTrackThumb
    class="obs-phantom-portrait-thumb"
    :size="size"
    :background="background"
  >
    <img
      v-if="photo"
      :key="photo"
      class="obs-phantom-portrait-thumb__image"
      :class="{
        'obs-phantom-portrait-thumb__image--artist': photo === artistUrl,
      }"
      :src="photo"
      alt=""
      draggable="false"
      @error="failed.add($event.currentTarget.src)"
    />
    <UiStatusIcon v-else :icon="UserRound" label="" tone="text" decorative />
    <slot />
  </UiTrackThumb>
</template>

<style scoped>
.obs-phantom-portrait-thumb {
  --ui-status-icon-background: var(--ui-color-surface-raised);
}

.obs-phantom-portrait-thumb__image {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  object-fit: contain;
}

.obs-phantom-portrait-thumb__image--artist {
  object-fit: cover;
}
</style>
