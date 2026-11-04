<script setup>
defineProps({ scene: { type: Object, required: true } });
</script>

<template>
  <span class="centered-vertical-preview">{{
    scene.frame?.currentText ?? scene.lyrics?.current ?? ''
  }}</span>
</template>

<style scoped>
.centered-vertical-preview {
  position: relative;
  inset-block-start: 15%;
  place-self: start center;
  max-inline-size: 39.375cqi;
  overflow: clip;
  color: var(--obs-preview-ink);
  font:
    400 2.53cqi / 1.16 'Utawakui Open Huninn',
    sans-serif;
  letter-spacing: 0.08em;
  writing-mode: vertical-rl;
  white-space: pre;
}
</style>
