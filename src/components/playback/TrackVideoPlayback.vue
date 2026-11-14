<script setup>
import { shallowRef, useTemplateRef, watch } from 'vue';
import { usePlayer } from '../../composables/usePlayer.js';
import { t } from '../../utils/i18n.js';
import { trackVideoFrame } from '../../utils/trackVideoClock.js';
import UiHint from '../ui/UiHint.vue';

const { asset, clock } = defineProps({
  asset: { type: Object, required: true },
  clock: { type: Function, default: null },
});
const emit = defineEmits(['frame-ready', 'error']);
const { state, samplePlaybackClock } = usePlayer();
const video = useTemplateRef('video');
const failed = shallowRef(false);
const sectionTransition = shallowRef(false);
watch(
  () => asset.url,
  () => {
    failed.value = false;
    sectionTransition.value = false;
  },
);

watch(
  video,
  (element, _previous, cleanup) => {
    if (!element) return;
    let request;
    let playingRequest = false;
    let lastContinuity;
    let lastDelay;
    let lastPhase;
    let lastOffset;
    let lastSegments;
    let lastSegmentStart;
    let lastPlaying;
    let transitionAfterSeek = false;
    let readyPosition;

    function revealSection() {
      if (!transitionAfterSeek) return;
      transitionAfterSeek = false;
      sectionTransition.value = true;
    }
    element.addEventListener('seeked', revealSection);

    function sync() {
      const sample = clock ? clock() : samplePlaybackClock();
      const delay = clock ? 0 : state.monitorPitchDelayMs || 0;
      if (
        element.readyState >= 1 &&
        sample &&
        (clock || sample.trackId === state.track?.id)
      ) {
        const frame = trackVideoFrame(
          sample,
          asset.offsetMs,
          delay,
          element.duration,
          asset.syncSegments,
        );
        if (!frame || sample.phase === 'seeking') {
          transitionAfterSeek = false;
          sectionTransition.value = false;
          if (!element.paused) element.pause();
        } else {
          const reset =
            lastContinuity !== sample.continuityRevision ||
            lastDelay !== delay ||
            lastPhase !== sample.phase ||
            lastOffset !== asset.offsetMs ||
            lastSegments !== asset.syncSegments ||
            lastSegmentStart !== frame.segmentStartMs ||
            lastPlaying !== frame.playing;
          if (element.playbackRate !== frame.rate)
            element.playbackRate = frame.rate;
          if (
            (reset ||
              (element.ended && frame.playing) ||
              Math.abs(element.currentTime - frame.position) > 0.16) &&
            !element.seeking
          ) {
            const continuousPlayback =
              lastContinuity === sample.continuityRevision &&
              lastPlaying &&
              frame.playing &&
              lastSegments === asset.syncSegments &&
              lastOffset === asset.offsetMs;
            const sectionChanged = lastSegmentStart !== frame.segmentStartMs;
            transitionAfterSeek = Boolean(
              continuousPlayback &&
              sectionChanged &&
              lastSegmentStart !== undefined,
            );
            if (!continuousPlayback || sectionChanged)
              sectionTransition.value = false;
            element.currentTime = frame.position;
            readyPosition = undefined;
            lastContinuity = sample.continuityRevision;
            lastDelay = delay;
            lastPhase = sample.phase;
            lastOffset = asset.offsetMs;
            lastSegments = asset.syncSegments;
            lastSegmentStart = frame.segmentStartMs;
            lastPlaying = frame.playing;
          }
          if (!frame.playing && !element.paused) element.pause();
          if (
            clock &&
            !frame.playing &&
            !element.seeking &&
            element.readyState >= 2 &&
            readyPosition !== frame.position &&
            Math.abs(element.currentTime - frame.position) < 0.05
          ) {
            readyPosition = frame.position;
            emit('frame-ready', sample.positionMs);
          }
          if (
            frame.playing &&
            element.paused &&
            !element.seeking &&
            !element.ended &&
            !playingRequest
          ) {
            element.muted = true;
            playingRequest = true;
            element
              .play()
              .catch((error) => {
                if (error.name !== 'AbortError' && video.value === element)
                  mediaFailed();
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
      element.removeEventListener('seeked', revealSection);
      element.pause();
    });
  },
  { flush: 'post' },
);

function mediaFailed() {
  failed.value = true;
  emit('error');
}
</script>

<template>
  <div class="track-video-playback">
    <video
      v-if="!failed"
      :key="asset.url"
      ref="video"
      class="track-video-playback__image"
      :class="{
        'track-video-playback__image--section-transition': sectionTransition,
      }"
      :src="asset.url"
      preload="metadata"
      muted
      playsinline
      @error="mediaFailed"
      @animationend.self="sectionTransition = false"
    />
    <UiHint v-if="failed" class="track-video-playback__placeholder">{{
      t('trackVideo.error.unavailable')
    }}</UiHint>
  </div>
</template>

<style scoped>
.track-video-playback {
  min-block-size: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
}
.track-video-playback__image {
  display: block;
  grid-area: 1 / 1;
  inline-size: 100%;
  block-size: 100%;
  object-fit: contain;
  background: var(--ui-color-surface);
  border-radius: var(--ui-radius-sm);
}
.track-video-playback__image--section-transition {
  animation: track-video-section-reveal var(--ui-motion-duration-standard)
    var(--ui-motion-easing-standard);
}
@keyframes track-video-section-reveal {
  from {
    opacity: var(--ui-opacity-muted);
  }
  to {
    opacity: 1;
  }
}
.track-video-playback__placeholder {
  grid-area: 1 / 1;
  place-self: center;
  padding-inline: var(--ui-space-2);
  text-align: center;
}
</style>
