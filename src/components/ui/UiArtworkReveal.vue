<script setup>
// Shared "reveal on hover" recipe for artwork overlay content and corner
// controls. The caller marks the trigger area on an ancestor:
//   data-artwork-reveal-scope                 reveal while the area is hovered
//   data-artwork-reveal-scope="focus-within"  also while focus is inside it
// Hovering this content or keyboard focus on a control inside it always
// reveals. Timing uses --ui-motion-duration-fast, which reduced motion zeroes.
</script>

<template>
  <span class="ui-artwork-reveal">
    <slot />
  </span>
</template>

<style scoped>
.ui-artwork-reveal {
  display: grid;
  min-width: 0;
  min-height: 0;
  opacity: 0;
  transition: opacity var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.ui-artwork-reveal > :slotted(*) {
  grid-area: 1 / 1;
  min-width: 0;
  min-height: 0;
}

.ui-artwork-reveal:hover,
.ui-artwork-reveal:has(:focus-visible) {
  opacity: 1;
}

/* Whole selector inside :global(): Vue drops anything after :global(x). */
:global([data-artwork-reveal-scope]:hover .ui-artwork-reveal),
:global(
  [data-artwork-reveal-scope='focus-within']:focus-within .ui-artwork-reveal
) {
  opacity: 1;
}
</style>
