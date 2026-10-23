<script setup>
import { computed } from 'vue';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});

const track = computed(() => props.scene?.track ?? {});
const progress = computed(() =>
  Math.max(0, Math.min(1, Number(props.scene?.playback?.progress) || 0)),
);
const volumeKnown = computed(() =>
  Number.isFinite(props.scene?.playback?.volume),
);
const volumeMuted = computed(
  () =>
    props.scene?.playback?.muted === true ||
    (volumeKnown.value && props.scene.playback.volume === 0),
);
const volume = computed(() =>
  volumeKnown.value && !props.scene.playback.muted
    ? Math.max(0, Math.min(1, props.scene.playback.volume))
    : 0,
);
</script>

<template>
  <div
    class="obs-template-mockup__content obs-template-mockup__content--artwork obs-template-mockup__cover-player"
    :style="{
      '--obs-cover-player-progress': `${progress * 100}%`,
      '--obs-cover-player-volume': `${volume * 100}%`,
    }"
    :data-volume-known="volumeKnown"
    :data-volume-muted="volumeMuted"
  >
    <span class="obs-template-mockup__cover-player-art">
      {{ track.title?.slice(0, 1) }}
    </span>
    <span class="obs-template-mockup__cover-player-copy">
      <strong class="obs-template-mockup__cover-player-title">
        {{ track.title }}
      </strong>
      <span class="obs-template-mockup__cover-player-artist">
        {{ track.artist }}
      </span>
    </span>
    <span class="obs-template-mockup__cover-player-controls">
      <span class="obs-template-mockup__progress">
        <span class="obs-template-mockup__progress-fill" />
      </span>
      <span class="obs-template-mockup__timeline">
        <span>{{ scene.playback?.elapsed ?? '0:00' }}</span>
        <span>{{ scene.playback?.remaining ?? '-0:00' }}</span>
      </span>
      <span class="obs-template-mockup__transport">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5.5v13L2 12Zm10 0v13L12 12Z" />
        </svg>
        <span class="obs-template-mockup__transport-play">
          <svg
            v-if="scene.playback?.playbackStatus === 'playing'"
            viewBox="0 0 24 24"
            aria-hidden="true"
            class="obs-template-mockup__pause"
          >
            <path d="M8 5v14M16 5v14" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="m8 5 11 7-11 7Z" />
          </svg>
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 5.5v13L12 12Zm10 0v13L22 12Z" />
        </svg>
      </span>
      <span class="obs-template-mockup__volume" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M3 9h4l5-4v14l-5-4H3Z" />
          <path v-if="!volumeMuted" d="M16 8q4 4 0 8" />
          <path v-else d="m16 9 6 6m0-6-6 6" />
        </svg>
        <span class="obs-template-mockup__volume-track"></span>
      </span>
    </span>
  </div>
</template>

<style src="./CoverPlayerPreview.css"></style>
