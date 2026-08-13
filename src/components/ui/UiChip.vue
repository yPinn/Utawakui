<script setup>
// Small pill badge — platform tag, download-mode label, candidate
// confidence/selected marker. background/color default to the "muted
// badge on a canvas-colored panel" case; pass overrides for the surface
// variant or a filled/selected state.
defineProps({
  background: { type: String, default: undefined },
  color: { type: String, default: undefined },
});
</script>

<template>
  <span
    class="ui-chip"
    :style="{
      '--ui-chip-bg': background,
      '--ui-chip-color': color,
    }"
  >
    <slot />
  </span>
</template>

<style scoped>
.ui-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-1);
  min-height: calc(var(--ui-space-5) - var(--ui-space-1));
  padding: calc(var(--ui-space-1) / 2) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-chip-bg, var(--ui-color-canvas));
  color: var(--ui-chip-color, var(--ui-color-text-muted));
  font-size: var(--ui-font-size-sm);
  white-space: nowrap;
}
</style>
