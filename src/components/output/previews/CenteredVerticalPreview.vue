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
  font-family:
    var(--ovl-hangul-font-prefix,) 'Utawakui Open Huninn',
    sans-serif;
  font-size: calc(var(--ovl-authored-font-rem, 2.5) * var(--obs-canvas-rem));
  font-weight: 400;
  line-height: 1.16;
  letter-spacing: 0.08em;
  writing-mode: vertical-rl;
  white-space: pre;
}
</style>
