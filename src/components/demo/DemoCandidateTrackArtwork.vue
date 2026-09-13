<script setup>
import { computed, shallowRef } from 'vue';
import { getTrackInitial } from '../../utils/trackDisplay.js';
import { getTrackThumbFallbackArtwork } from './trackThumbFallback.js';

const props = defineProps({
  track: { type: Object, required: true },
});

const failedCustomImageKey = shallowRef('');
const failedFallbackImageKey = shallowRef('');
const trackIdentity = computed(() =>
  String(props.track?.id ?? props.track?.title ?? ''),
);
const customImageUrl = computed(() => props.track?.thumbnailUrl || '');
const fallbackArtwork = computed(() =>
  getTrackThumbFallbackArtwork(props.track),
);
const activeImage = computed(() => {
  const customKey = `custom:${trackIdentity.value}:${customImageUrl.value}`;
  if (customImageUrl.value && failedCustomImageKey.value !== customKey) {
    return { kind: 'custom', key: customKey, url: customImageUrl.value };
  }

  const fallbackUrl = fallbackArtwork.value?.url;
  const fallbackKey = `fallback:${trackIdentity.value}:${fallbackUrl}`;
  if (fallbackUrl && failedFallbackImageKey.value !== fallbackKey) {
    return { kind: 'fallback', key: fallbackKey, url: fallbackUrl };
  }

  return undefined;
});

function handleImageError() {
  if (activeImage.value?.kind === 'custom') {
    failedCustomImageKey.value = activeImage.value.key;
    return;
  }

  if (activeImage.value?.kind === 'fallback') {
    failedFallbackImageKey.value = activeImage.value.key;
  }
}
</script>

<template>
  <span
    class="demo-candidate-track-artwork"
    :data-track-artwork-state="activeImage?.kind ?? 'initial'"
  >
    <img
      v-if="activeImage"
      :key="activeImage.key"
      class="demo-candidate-track-artwork__image"
      :src="activeImage.url"
      :data-track-artwork-kind="activeImage.kind"
      alt=""
      draggable="false"
      @error="handleImageError"
    />
    <span v-else class="demo-candidate-track-artwork__initial">
      {{ getTrackInitial(track) }}
    </span>
  </span>
</template>

<style scoped>
.demo-candidate-track-artwork,
.demo-candidate-track-artwork__initial {
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.demo-candidate-track-artwork {
  width: 100%;
  height: 100%;
  font-weight: var(--ui-font-weight-semibold);
  text-transform: var(--ui-track-artwork-transform, uppercase);
  -webkit-user-select: none;
  user-select: none;
  -webkit-user-drag: none;
}

.demo-candidate-track-artwork__image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  -webkit-user-select: none;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
