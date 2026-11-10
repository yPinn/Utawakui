<script setup>
import { computed, shallowRef, useTemplateRef, watch } from 'vue';
import { usePlayer } from '../../composables/usePlayer.js';
import { useTrackVideoAsset } from '../../composables/useTrackVideoAsset.js';
import { t } from '../../utils/i18n.js';
import { trackVideoFrame } from '../../utils/trackVideoClock.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';

const { active, stage, stageAsset } = defineProps({
  active: { type: Boolean, default: false },
  stage: { type: Boolean, default: false },
  stageAsset: { type: Object, default: null },
});
const { state, samplePlaybackClock } = usePlayer();
const video = useTemplateRef('video');
const { asset: dockAsset } = useTrackVideoAsset({
  trackId: () => state.track?.id,
  enabled: () => active && !stage,
});
const asset = computed(() => (stage ? stageAsset : dockAsset.value));
const showing = shallowRef(false);
const visible = computed(() => stage || showing.value);
const inRange = shallowRef(false);
const failed = shallowRef(false);
watch(asset, () => {
  failed.value = false;
  inRange.value = false;
});

watch(
  video,
  (element, _previous, cleanup) => {
    if (!element) return;
    let request;
    let playingRequest = false;
    let lastContinuity;
    let lastDelay;
    let lastPhase;

    function sync() {
      const sample = samplePlaybackClock();
      const delay = state.monitorPitchDelayMs || 0;
      if (
        element.readyState >= 1 &&
        sample.trackId === state.track?.id &&
        asset.value
      ) {
        const frame = trackVideoFrame(
          sample,
          asset.value.offsetMs,
          delay,
          element.duration,
        );
        inRange.value = frame !== null;
        if (!frame || sample.phase === 'seeking') {
          if (!element.paused) element.pause();
        } else {
          const reset =
            lastContinuity !== sample.continuityRevision ||
            lastDelay !== delay ||
            lastPhase !== sample.phase;
          if (element.playbackRate !== frame.rate)
            element.playbackRate = frame.rate;
          if (
            (reset || Math.abs(element.currentTime - frame.position) > 0.16) &&
            !element.seeking
          ) {
            element.currentTime = frame.position;
            lastContinuity = sample.continuityRevision;
            lastDelay = delay;
            lastPhase = sample.phase;
          }
          if (!frame.playing && !element.paused) element.pause();
          if (frame.playing && element.paused && !playingRequest) {
            element.muted = true;
            playingRequest = true;
            element
              .play()
              .catch((error) => {
                if (error.name !== 'AbortError' && video.value === element)
                  failed.value = true;
              })
              .finally(() => {
                playingRequest = false;
              });
          }
        }
      }
      request = requestAnimationFrame(sync);
    }

    request = requestAnimationFrame(sync);
    cleanup(() => {
      cancelAnimationFrame(request);
      element.pause();
    });
  },
  { flush: 'post' },
);

function toggle() {
  failed.value = false;
  inRange.value = false;
  showing.value = !showing.value;
}

function fullscreen() {
  void video.value?.requestFullscreen?.().catch(() => {});
}
</script>

<template>
  <div
    v-if="active && asset"
    class="track-video-playback"
    :class="{ 'track-video-playback--stage': stage }"
  >
    <div v-if="!stage" class="track-video-playback__actions">
      <UiButton variant="secondary" :aria-pressed="showing" @click="toggle">{{
        t(showing ? 'trackVideo.hide' : 'trackVideo.show')
      }}</UiButton>
      <UiButton
        v-if="visible && inRange && !failed"
        variant="secondary"
        @click="fullscreen"
        >{{ t('trackVideo.fullscreen') }}</UiButton
      >
    </div>
    <video
      v-if="visible && !failed"
      v-show="inRange"
      :key="asset.url"
      ref="video"
      class="track-video-playback__image"
      :src="asset.url"
      preload="metadata"
      muted
      playsinline
      @error="failed = true"
    />
    <UiHint
      v-if="failed"
      :class="{ 'track-video-playback__placeholder': stage }"
      >{{ t('trackVideo.error.unavailable') }}</UiHint
    >
    <UiHint
      v-else-if="stage && !inRange"
      class="track-video-playback__placeholder"
      >{{ t('trackVideo.noFrame') }}</UiHint
    >
  </div>
</template>

<style scoped>
.track-video-playback {
  display: grid;
  gap: var(--ui-space-2);
}
.track-video-playback__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.track-video-playback__image {
  display: block;
  width: 100%;
  max-height: 22rem;
  object-fit: contain;
  background: var(--ui-color-surface);
}
.track-video-playback__image:fullscreen {
  max-height: none;
}
.track-video-playback--stage {
  min-block-size: 0;
  grid-template-rows: minmax(0, 1fr);
}
.track-video-playback--stage .track-video-playback__image {
  grid-area: 1 / 1;
  block-size: 100%;
  max-block-size: none;
  border-radius: var(--ui-radius-sm);
}
.track-video-playback__placeholder {
  grid-area: 1 / 1;
  place-self: center;
}
</style>
