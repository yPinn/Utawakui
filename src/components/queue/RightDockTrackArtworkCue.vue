<script setup>
import { ICON_SIZE, Pause, Play } from '../../icons/index.js';
import UiArtworkReveal from '../ui/UiArtworkReveal.vue';

defineProps({
  playing: { type: Boolean, default: false },
});
</script>

<!-- UiTrackRow's UiArtworkOverlay owns geometry; UiArtworkReveal shows the cue
     while the row (data-artwork-reveal-scope="focus-within") is hovered or
     holds focus. -->
<template>
  <UiArtworkReveal>
    <span class="right-dock-track__artwork-cue" aria-hidden="true">
      <component
        :is="playing ? Pause : Play"
        :size="ICON_SIZE"
        class="right-dock-track__artwork-icon"
      />
    </span>
  </UiArtworkReveal>
</template>

<style scoped>
.right-dock-track__artwork-cue {
  display: grid;
  place-items: center;
  background: var(--ui-color-overlay-scrim);
  color: var(--ui-color-overlay-contrast);
}

.right-dock-track__artwork-icon {
  fill: currentColor;
}
</style>
