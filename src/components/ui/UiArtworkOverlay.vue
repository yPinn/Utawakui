<script setup>
// Shared full-cover plane for anything drawn over artwork (scrims, playback
// cues, loading shimmer, full-cover actions). The host artwork box owns the
// clip (overflow + radius); this plane bleeds one hairline past it so that clip
// is the only antialiased edge, and stretches its content, which therefore
// needs no size, inset or radius of its own. Corner controls are not
// full-cover content and stay outside this plane.
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
  z-index: 2;
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
