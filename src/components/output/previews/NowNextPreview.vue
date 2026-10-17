<script setup>
import { computed } from 'vue';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});

const track = computed(() => props.scene?.track ?? {});
const nextTrack = computed(() => props.scene?.nextTrack ?? {});
</script>

<template>
  <div
    class="obs-template-mockup__content obs-template-mockup__content--now-playing"
  >
    <span class="obs-template-mockup__now-player">
      <span class="obs-template-mockup__now-player-shell">
        <span class="obs-template-mockup__now-disc">
          <span class="obs-template-mockup__now-disc-label">UW</span>
        </span>
        <span class="obs-template-mockup__now-spindle" />
        <span class="obs-template-mockup__now-pickup" />
        <span class="obs-template-mockup__now-controls">
          <span />
          <span />
          <span />
        </span>
      </span>
    </span>
    <span class="obs-template-mockup__now-information">
      <span class="obs-template-mockup__now-current">
        <strong
          class="obs-template-mockup__now-title obs-template-mockup__animated-primary"
        >
          {{ track.title }}
        </strong>
        <span class="obs-template-mockup__now-artist">{{ track.artist }}</span>
      </span>
      <span v-if="nextTrack.title" class="obs-template-mockup__now-next">
        Next: {{ nextTrack.title }}
      </span>
    </span>
  </div>
</template>

<style src="./NowNextPreview.css"></style>
