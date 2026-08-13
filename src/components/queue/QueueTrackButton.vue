<script setup>
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

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
    <UiTrackThumb
      class="queue-track__cover"
      :track="track"
      :size="48"
      radius="var(--ui-radius)"
      background="var(--ui-color-canvas)"
      font-size="var(--ui-font-size-lg)"
    />
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
  color: var(--ui-color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.queue-track:hover {
  background: var(--ui-color-surface-hover);
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
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.queue-track--current .queue-track__title {
  color: var(--ui-color-sort-indicator);
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
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
}

.queue-track__artist {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}
</style>
