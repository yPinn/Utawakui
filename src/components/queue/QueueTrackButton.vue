<script setup>
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import { getTrackInitial } from '../../utils/trackDisplay.js';

defineProps({
  track: { type: Object, required: true },
  current: { type: Boolean, default: false },
  draggable: { type: Boolean, default: false },
});

const emit = defineEmits([
  'select',
  'dragstart',
  'dragover',
  'dragleave',
  'drop',
  'dragend',
]);
</script>

<template>
  <button
    type="button"
    class="queue-track"
    :class="{ 'queue-track--current': current }"
    :draggable="draggable"
    @click="emit('select', track)"
    @dragstart="emit('dragstart', $event)"
    @dragover="emit('dragover', $event)"
    @dragleave="emit('dragleave', $event)"
    @drop="emit('drop', $event)"
    @dragend="emit('dragend', $event)"
  >
    <span class="queue-track__cover">
      <img
        v-if="track.thumbnailUrl"
        class="queue-track__image"
        :src="track.thumbnailUrl"
        alt=""
        aria-hidden="true"
        draggable="false"
      />
      <span v-else>{{ getTrackInitial(track) }}</span>
    </span>
    <span class="queue-track__copy">
      <UiMarqueeText class="queue-track__title" :text="track.title" />
      <span v-if="track.artist" class="queue-track__artist">
        {{ track.artist }}
      </span>
    </span>
  </button>
</template>

<style scoped>
.queue-track {
  --queue-track-cover-size: 48px;

  box-sizing: border-box;
  display: grid;
  grid-template-columns: var(--queue-track-cover-size) minmax(0, 1fr);
  gap: var(--ui-space-2);
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: var(--ui-space-1);
  border: 0;
  border-radius: var(--ui-radius);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.queue-track:hover {
  background: var(--ui-surface-hover);
}

.queue-track[draggable='true'] {
  cursor: grab;
}

.queue-track[draggable='true']:active {
  cursor: grabbing;
}

.queue-track:focus-visible {
  /* Full-width row inside a list (queue-section__item li), same shape as
     UiTrackRow — inset offset avoids the ring being clipped by the
     adjacent row, per the B3 focus-ring convention. This was previously
     1px (a standalone-control-style offset that didn't fit its actual
     list-row layout); -2px is the correction, not a drift-preserving
     merge like the other 1px sites in this pass. */
  outline: var(--ui-focus-width) solid var(--ui-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.queue-track--current .queue-track__title {
  color: var(--ui-sort-indicator);
}

.queue-track__cover {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--queue-track-cover-size);
  height: var(--queue-track-cover-size);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  color: var(--ui-text);
  font-size: var(--ui-text-lg);
  font-weight: var(--ui-font-weight-strong);
  text-transform: uppercase;
  overflow: hidden;
  user-select: none;
  -webkit-user-drag: none;
}

.queue-track__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  -webkit-user-drag: none;
}

.queue-track__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.queue-track__artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-track__title {
  color: var(--ui-text);
  font-size: var(--ui-text-sm);
  font-weight: var(--ui-font-weight-strong);
}

.queue-track__artist {
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}
</style>
