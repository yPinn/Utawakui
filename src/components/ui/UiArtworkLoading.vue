<script setup>
// Shared loading shimmer for artwork that is still being fetched. Place it in
// an artwork host's overlay slot; UiArtworkOverlay sizes and clips it.
defineProps({
  // Announced to assistive technology while the artwork loads.
  label: { type: String, required: true },
});
</script>

<template>
  <span class="ui-artwork-loading" role="status">
    <span class="ui-visually-hidden">{{ label }}</span>
  </span>
</template>

<style scoped>
.ui-artwork-loading {
  background: var(--ui-color-surface-hover);
  opacity: 0.72;
  animation: ui-artwork-loading var(--ui-motion-duration-loop)
    var(--ui-motion-easing-standard) infinite alternate;
}

@keyframes ui-artwork-loading {
  to {
    opacity: 0.38;
  }
}

/* The keyframes use a literal duration, so reduced motion is handled here.
   Whole selector inside :global(): Vue drops anything after :global(x). */
:global(:root[data-ui-motion='reduced'] .ui-artwork-loading) {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .ui-artwork-loading {
    animation: none;
  }
}
</style>
