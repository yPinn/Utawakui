<script setup>
import { computed } from 'vue';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});

const track = computed(() => props.scene?.track ?? {});
</script>

<template>
  <div
    class="obs-template-mockup__content obs-template-mockup__content--artwork obs-template-mockup__cover-player"
  >
    <span
      class="obs-template-mockup__cover-player-art obs-template-mockup__animated-primary"
    >
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
        <span>0:23</span>
        <span>-3:27</span>
      </span>
      <span class="obs-template-mockup__transport">
        <span>⇄</span>
        <span>◀</span>
        <span class="obs-template-mockup__transport-play">▶</span>
        <span>▶|</span>
        <span>↻</span>
      </span>
    </span>
  </div>
</template>

<style src="./CoverPlayerPreview.css"></style>
