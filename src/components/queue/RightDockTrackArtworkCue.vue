<script setup>
import { ICON_SIZE, Pause, Play } from '../../icons/index.js';

defineProps({
  playing: { type: Boolean, default: false },
});
</script>

<template>
  <span class="right-dock-track__artwork-cue" aria-hidden="true">
    <component
      :is="playing ? Pause : Play"
      :size="ICON_SIZE"
      class="right-dock-track__artwork-icon"
    />
  </span>
</template>

<style scoped>
.right-dock-track__artwork-cue {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  border-radius: inherit;
  background: var(--ui-color-overlay-scrim);
  color: var(--ui-color-overlay-contrast);
  opacity: 0;
  transition: opacity var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.right-dock-track__artwork-icon {
  fill: currentColor;
}

:global(.right-dock-track:hover .right-dock-track__artwork-cue),
:global(.right-dock-track:focus-within .right-dock-track__artwork-cue) {
  opacity: 1;
}

:global(:root[data-ui-motion='reduced'] .right-dock-track__artwork-cue) {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .right-dock-track__artwork-cue {
    transition: none;
  }
}
</style>
