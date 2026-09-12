<script setup>
import { computed, shallowRef, useAttrs } from 'vue';
import { getTrackInitial } from '../../utils/trackDisplay.js';
import { getTrackThumbFallbackArtwork } from './trackThumbFallback.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  track: { type: Object, default: undefined },
  size: { type: [Number, String], required: true },
  radius: { type: String, default: undefined },
  background: { type: String, default: undefined },
  color: { type: String, default: undefined },
  fontSize: { type: String, default: undefined },
  uppercase: { type: Boolean, default: true },
  decorative: { type: Boolean, default: true },
});

const attrs = useAttrs();
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
  if (!props.track) return undefined;

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
const semanticRole = computed(() =>
  props.decorative ? undefined : (attrs.role ?? 'img'),
);

function toCssLength(value) {
  return typeof value === 'number' ? `${value}px` : value;
}

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
    v-bind="attrs"
    class="demo-candidate-track-thumb"
    :aria-hidden="decorative ? 'true' : undefined"
    :role="semanticRole"
    :style="{
      width: toCssLength(size),
      height: toCssLength(size),
      '--ui-track-thumb-radius': radius,
      '--ui-track-thumb-bg': background,
      '--ui-track-thumb-color': color,
      '--ui-track-thumb-font-size': fontSize,
      '--ui-track-thumb-transform': uppercase ? 'uppercase' : 'none',
    }"
  >
    <img
      v-if="activeImage"
      :key="activeImage.key"
      class="demo-candidate-track-thumb__image"
      :src="activeImage.url"
      alt=""
      draggable="false"
      @error="handleImageError"
    />
    <span v-else-if="track" class="demo-candidate-track-thumb__initial">
      {{ getTrackInitial(track) }}
    </span>
    <slot v-else />
    <slot name="overlay" />
  </span>
</template>

<style scoped>
.demo-candidate-track-thumb {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--ui-track-thumb-radius, var(--ui-radius-sm));
  background: var(--ui-track-thumb-bg, var(--ui-color-surface-hover));
  color: var(--ui-track-thumb-color, var(--ui-color-text));
  font-size: var(--ui-track-thumb-font-size, var(--ui-font-size-sm));
  font-weight: var(--ui-font-weight-semibold);
  text-transform: var(--ui-track-thumb-transform, uppercase);
  -webkit-user-select: none;
  user-select: none;
  -webkit-user-drag: none;
}

.demo-candidate-track-thumb__image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  -webkit-user-select: none;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
