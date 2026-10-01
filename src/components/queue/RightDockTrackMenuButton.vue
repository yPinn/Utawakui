<script setup>
import { Ellipsis } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';

defineProps({
  trackTitle: { type: String, required: true },
  menuOpen: { type: Boolean, default: false },
});

defineEmits(['open']);
</script>

<template>
  <UiIconButton
    class="right-dock-track__menu"
    :icon="Ellipsis"
    :label="`${trackTitle}的更多選項`"
    :title="trackTitle"
    tooltip-suffix="的更多選項"
    aria-haspopup="menu"
    :aria-expanded="menuOpen ? 'true' : 'false'"
    @click.stop="$emit('open', $event)"
    @dblclick.stop
  />
</template>

<style scoped>
.right-dock-track__menu {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

:global(.right-dock-track:hover .right-dock-track__menu),
:global(.right-dock-track:focus-within .right-dock-track__menu),
:global(.right-dock-track.ui-track--active .right-dock-track__menu),
:global(.right-dock-track--menu-open .right-dock-track__menu) {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

:global(:root[data-ui-motion='reduced'] .right-dock-track__menu) {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .right-dock-track__menu {
    transition: none;
  }
}
</style>
