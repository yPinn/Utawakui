<script setup>
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

function trackInitial(track) {
  return String(track.title || track.id || '?')
    .trim()
    .slice(0, 1)
    .toUpperCase();
}
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
    <span class="queue-track__cover">{{ trackInitial(track) }}</span>
    <span class="queue-track__copy">
      <span class="queue-track__title">{{ track.title }}</span>
      <span v-if="track.artist" class="queue-track__artist">
        {{ track.artist }}
      </span>
    </span>
  </button>
</template>

<style scoped>
.queue-track {
  --queue-track-cover-size: 40px;

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
  outline: 2px solid var(--ui-focus);
  outline-offset: 1px;
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
}

.queue-track__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.queue-track__title,
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
