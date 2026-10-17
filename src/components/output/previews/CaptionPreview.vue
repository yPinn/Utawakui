<script setup>
import { computed } from 'vue';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});

const lyrics = computed(() => props.scene?.lyrics ?? {});
</script>

<template>
  <div
    class="obs-template-mockup__content obs-template-mockup__content--lyrics obs-template-mockup__caption"
  >
    <strong
      class="obs-template-mockup__caption-current obs-template-mockup__animated-primary"
    >
      {{ lyrics.current }}
    </strong>
    <span class="obs-template-mockup__caption-next">{{ lyrics.next }}</span>
  </div>
</template>

<style src="./CaptionPreview.css"></style>
