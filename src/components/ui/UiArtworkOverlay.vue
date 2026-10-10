<script setup>
// Shared full-cover plane for anything drawn over artwork (scrims, playback
// cues, loading shimmer, full-cover actions). Mount it inside the artwork's
// .ui-artwork-composite layer so it composites with the image before the one
// radius clip; it bleeds a hairline past the box and stretches its content,
// which needs no size, inset or radius. Corner controls stay outside it.
</script>

<template>
  <span class="ui-artwork-overlay">
    <slot />
  </span>
</template>

<style scoped>
.ui-artwork-overlay {
  position: absolute;
  inset: calc(-1 * var(--ui-border-width));
  z-index: var(--ui-layer-overlay);
  display: grid;
  pointer-events: none;
}

.ui-artwork-overlay > :slotted(*) {
  grid-area: 1 / 1;
  min-width: 0;
  min-height: 0;
  pointer-events: auto;
}
</style>
