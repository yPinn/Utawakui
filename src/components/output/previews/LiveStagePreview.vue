<script setup>
import { computed } from 'vue';
import {
  adaptLiveStageLyricsPresentation,
  analyzeLyricsSource,
} from '../../../../shared/presentation/lyricsPresentation.mjs';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});

const track = computed(() => props.scene?.track ?? {});
const lyrics = computed(() => props.scene?.lyrics ?? {});
const liveStageLines = computed(
  () =>
    adaptLiveStageLyricsPresentation(analyzeLyricsSource(lyrics.value.current))
      .lines,
);
</script>

<template>
  <div
    class="obs-template-mockup__content obs-template-mockup__content--lyrics"
  >
    <span class="obs-template-mockup__live-stage-brand">
      <strong>U</strong>
      <span class="obs-template-mockup__live-stage-brand-copy">
        <span>UTAWAKUI</span>
        <strong>LIVE STAGE</strong>
      </span>
    </span>
    <strong class="obs-template-mockup__live-stage-channel">UW</strong>
    <strong
      class="obs-template-mockup__live-stage-caption obs-template-mockup__animated-primary"
    >
      <span v-for="line in liveStageLines" :key="line">{{ line }}</span>
    </strong>
    <span
      class="obs-template-mockup__live-stage-card obs-template-mockup__animated-primary"
    >
      <span class="obs-template-mockup__live-stage-card-mark">
        <strong>U</strong>
        <span>LIVE</span>
      </span>
      <span class="obs-template-mockup__live-stage-card-copy">
        <strong>{{ track.title }}</strong>
        <span>{{ track.artist }}</span>
      </span>
    </span>
  </div>
</template>

<style src="./LiveStagePreview.css"></style>
