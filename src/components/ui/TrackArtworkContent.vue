<script setup>
import { computed, shallowRef, watch } from 'vue';
import { getTrackInitial } from '../../utils/trackDisplay.js';
import { getTrackThumbFallbackArtwork } from './trackThumbFallback.js';

const props = defineProps({
  track: { type: Object, required: true },
  loading: {
    type: String,
    default: 'eager',
    validator: (value) => value === 'eager' || value === 'lazy',
  },
  decoding: {
    type: String,
    default: 'auto',
    validator: (value) => ['auto', 'sync', 'async'].includes(value),
  },
});

const failedCustomImageKey = shallowRef('');
const failedFallbackImageKey = shallowRef('');
const sourceAttempt = shallowRef(0);
const trackIdentity = computed(() =>
  String(props.track?.id ?? props.track?.title ?? ''),
);
const customImageUrl = computed(() => props.track?.thumbnailUrl || '');
const fallbackArtwork = computed(() =>
  getTrackThumbFallbackArtwork(props.track),
);

// A source/identity change starts a new attempt, including removing and then
// restoring the same URL. Ordinary metadata edits must not retry a broken image.
watch(
  [trackIdentity, customImageUrl],
  ([identity], [previousIdentity]) => {
    sourceAttempt.value += 1;
    failedCustomImageKey.value = '';
    // The bundled fallback is a separate resource, stable for this identity.
    if (identity !== previousIdentity) failedFallbackImageKey.value = '';
  },
  { flush: 'sync' },
);

function imageCandidate(kind, url) {
  const failureKey = JSON.stringify([kind, trackIdentity.value, url]);
  const key = JSON.stringify([
    sourceAttempt.value,
    kind,
    trackIdentity.value,
    url,
  ]);
  return {
    kind,
    key,
    failureKey,
    url,
    onError: () => handleImageError(kind, key, failureKey),
  };
}

const activeImage = computed(() => {
  const custom = imageCandidate('custom', customImageUrl.value);
  if (custom.url && failedCustomImageKey.value !== custom.failureKey) {
    return custom;
  }

  const fallbackUrl = fallbackArtwork.value?.url;
  const fallback = imageCandidate('fallback', fallbackUrl);
  if (fallback.url && failedFallbackImageKey.value !== fallback.failureKey) {
    return fallback;
  }

  return undefined;
});

function handleImageError(kind, key, failureKey) {
  // Handlers belong to the img that created them, never to the next source.
  if (activeImage.value?.key !== key) return;
  if (kind === 'custom') {
    failedCustomImageKey.value = failureKey;
    return;
  }

  if (kind === 'fallback') {
    failedFallbackImageKey.value = failureKey;
  }
}
</script>

<template>
  <span
    class="ui-track-artwork"
    :data-track-artwork-state="activeImage?.kind ?? 'initial'"
  >
    <!-- Object listeners bind this attempt's snapshot instead of a cached
         Vue method-path wrapper that reads activeImage again on dispatch. -->
    <img
      v-if="activeImage"
      :key="activeImage.key"
      class="ui-track-artwork__image"
      :src="activeImage.url"
      :data-track-artwork-kind="activeImage.kind"
      alt=""
      :loading="loading"
      :decoding="decoding"
      draggable="false"
      v-on="{ error: activeImage.onError }"
    />
    <span v-else class="ui-track-artwork__initial">
      {{ getTrackInitial(track) }}
    </span>
  </span>
</template>

<style scoped>
.ui-track-artwork,
.ui-track-artwork__initial {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.ui-track-artwork__image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
