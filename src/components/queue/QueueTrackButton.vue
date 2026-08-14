<script setup>
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

defineProps({
  track: { type: Object, required: true },
  current: { type: Boolean, default: false },
  draggable: { type: Boolean, default: false },
  // Whether the title should jump to the track's source album (see
  // useAlbumNavigation.js). Owned by the parent — this component only renders.
  jumpable: { type: Boolean, default: false },
});

const emit = defineEmits([
  'select',
  'titleClick',
  'dragStart',
  'dragOver',
  'dragLeave',
  'drop',
  'dragEnd',
]);
</script>

<template>
  <!-- Stretched-sibling layout: a nested title button isn't valid inside a
       <button>, so .queue-track__select covers the row and the title button
       re-surfaces above it (see z-index below) as its own target. -->
  <div
    class="queue-track"
    :class="{ 'queue-track--current': current }"
    :draggable="draggable"
    @dragstart="emit('dragStart', $event)"
    @dragover="emit('dragOver', $event)"
    @dragleave="emit('dragLeave', $event)"
    @drop="emit('drop', $event)"
    @dragend="emit('dragEnd', $event)"
  >
    <button
      type="button"
      class="queue-track__select"
      :aria-label="`播放 ${track.title}`"
      @click="emit('select', track)"
    ></button>

    <UiTrackThumb
      class="queue-track__cover"
      :track="track"
      :size="48"
      radius="var(--ui-radius)"
      background="var(--ui-color-canvas)"
      font-size="var(--ui-font-size-lg)"
    />
    <span class="queue-track__copy">
      <UiTextButton
        v-if="jumpable"
        class="queue-track__title"
        :text="track.title"
        :aria-label="`前往專輯：${track.title}`"
        @click="emit('titleClick', track)"
      />
      <UiMarqueeText v-else class="queue-track__title" :text="track.title" />
      <span v-if="track.artist" class="queue-track__artist">
        {{ track.artist }}
      </span>
    </span>
  </div>
</template>

<style scoped>
.queue-track {
  --queue-track-cover-size: 48px;

  position: relative;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: var(--queue-track-cover-size) minmax(0, 1fr);
  gap: var(--ui-space-2);
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: var(--ui-space-1);
  border-radius: var(--ui-radius);
  color: var(--ui-color-text);
  font-size: inherit;
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

/* Covers the row; the title button opts back out via its own z-index. */
.queue-track__select {
  position: absolute;
  inset: 0;
  z-index: 0;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}

.queue-track__select:focus-visible {
  /* Inset offset avoids clipping against the adjacent row. */
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.queue-track--current .queue-track__title {
  color: var(--ui-color-current);
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
  /* Stacks above .queue-track__select. */
  position: relative;
  z-index: 1;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
}

.queue-track__artist {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}
</style>
