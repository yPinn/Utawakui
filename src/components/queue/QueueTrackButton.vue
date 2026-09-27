<script setup>
import { ICON_SIZE, Play } from '../../icons/index.js';
import UiTrackRow from '../ui/UiTrackRow.vue';

defineProps({
  track: { type: Object, required: true },
  active: { type: Boolean, default: false },
  current: { type: Boolean, default: false },
  draggable: { type: Boolean, default: false },
});

const emit = defineEmits([
  'select',
  'activate',
  'dragStart',
  'dragOver',
  'dragLeave',
  'drop',
  'dragEnd',
]);
</script>

<template>
  <UiTrackRow
    class="queue-track"
    :track="track"
    :active="active"
    :current="current"
    interactive
    activate-on-enter
    :draggable="draggable"
    artwork-clickable
    :artwork-aria-label="`播放：${track.title}`"
    hide-duration
    overflow="ellipsis"
    thumb-loading="lazy"
    thumb-decoding="async"
    @click="emit('select', track)"
    @dblclick="emit('activate', track)"
    @activate="emit('activate', track)"
    @artwork-click="emit('activate', track)"
    @dragstart="emit('dragStart', $event)"
    @dragover="emit('dragOver', $event)"
    @dragleave="emit('dragLeave', $event)"
    @drop="emit('drop', $event)"
    @dragend="emit('dragEnd', $event)"
  >
    <template #artworkOverlay>
      <span class="queue-track__artwork-cue" aria-hidden="true">
        <Play :size="ICON_SIZE" class="queue-track__artwork-icon" />
      </span>
    </template>
  </UiTrackRow>
</template>

<style scoped>
.queue-track__artwork-cue {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: inherit;
  background: var(--ui-color-overlay-scrim);
  color: var(--ui-color-overlay-contrast);
  opacity: 0;
  transition: opacity var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.queue-track__artwork-icon {
  fill: currentColor;
}

.queue-track:hover .queue-track__artwork-cue,
.queue-track:focus-within .queue-track__artwork-cue {
  opacity: 1;
}

:global(:root[data-ui-motion='reduced']) .queue-track__artwork-cue {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .queue-track__artwork-cue {
    transition: none;
  }
}
</style>
