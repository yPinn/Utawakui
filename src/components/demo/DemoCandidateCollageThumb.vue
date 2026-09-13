<script setup>
import { computed, shallowRef, useAttrs } from 'vue';
import DemoCandidateArtworkEmpty from './DemoCandidateArtworkEmpty.vue';
import DemoCandidateTrackArtwork from './DemoCandidateTrackArtwork.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  coverUrl: { type: String, default: '' },
  tracks: { type: Array, default: () => [] },
  canCollage: { type: Boolean, default: true },
  size: { type: Number, required: true },
  radius: { type: String, default: undefined },
  background: { type: String, default: undefined },
  color: { type: String, default: undefined },
  uppercase: { type: Boolean, default: true },
  decorative: { type: Boolean, default: true },
});

const attrs = useAttrs();
const failedCoverKey = shallowRef('');
const coverKey = computed(() => `cover:${props.coverUrl}`);
const hasActiveCover = computed(
  () => Boolean(props.coverUrl) && failedCoverKey.value !== coverKey.value,
);
const displayTracks = computed(() => props.tracks.slice(0, 4));
const singleTrack = computed(() => displayTracks.value[0]);
const presentation = computed(() => {
  if (hasActiveCover.value) return 'cover';
  if (!singleTrack.value) return 'empty';
  if (!props.canCollage || displayTracks.value.length === 1) return 'single';
  return 'collage';
});
const collageSlots = computed(() => {
  if (presentation.value !== 'collage') return [];

  return Array.from({ length: 4 }, (_, index) => {
    const track = displayTracks.value[index];
    return {
      index,
      key: track
        ? `${String(track.id ?? track.title ?? 'track')}:${index}`
        : `vacant:${index}`,
      track,
    };
  });
});

function handleCoverImageError() {
  failedCoverKey.value = coverKey.value;
}
</script>

<template>
  <span
    v-bind="attrs"
    class="demo-candidate-collage-thumb"
    :aria-hidden="decorative ? 'true' : undefined"
    :data-collage-presentation="presentation"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      '--ui-collage-thumb-radius': radius,
      '--ui-collage-thumb-bg': background,
      '--ui-collage-thumb-color': color,
      '--ui-collage-thumb-font-size': `${Math.max(8, Math.round(size / 5))}px`,
      '--ui-track-artwork-transform': uppercase ? 'uppercase' : 'none',
    }"
  >
    <img
      v-if="presentation === 'cover'"
      :key="coverKey"
      class="demo-candidate-collage-thumb__cover"
      :src="coverUrl"
      alt=""
      draggable="false"
      @error="handleCoverImageError"
    />

    <DemoCandidateTrackArtwork
      v-else-if="presentation === 'single'"
      class="demo-candidate-collage-thumb__single"
      :track="singleTrack"
    />

    <template v-else-if="presentation === 'collage'">
      <span
        v-for="slot in collageSlots"
        :key="slot.key"
        class="demo-candidate-collage-thumb__cell"
        :class="{
          'demo-candidate-collage-thumb__cell--alternate':
            slot.index === 1 || slot.index === 2,
          'demo-candidate-collage-thumb__cell--vacant': !slot.track,
        }"
        :data-collage-slot="slot.index + 1"
        :data-collage-slot-state="slot.track ? 'occupied' : 'vacant'"
      >
        <DemoCandidateTrackArtwork v-if="slot.track" :track="slot.track" />
      </span>
    </template>

    <DemoCandidateArtworkEmpty
      v-else
      class="demo-candidate-collage-thumb__empty"
    />

    <span v-if="$slots.overlay" class="demo-candidate-collage-thumb__overlay">
      <slot name="overlay" />
    </span>
  </span>
</template>

<style scoped>
.demo-candidate-collage-thumb {
  position: relative;
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  overflow: hidden;
  border-radius: var(--ui-collage-thumb-radius, var(--ui-radius-sm));
  background: var(--ui-collage-thumb-bg, var(--ui-color-surface-hover));
  box-shadow: inset 0 0 0 var(--ui-border-width) var(--ui-color-border);
  color: var(--ui-collage-thumb-color, var(--ui-color-text));
  font-size: var(--ui-collage-thumb-font-size);
  -webkit-user-select: none;
  user-select: none;
  -webkit-user-drag: none;
}

.demo-candidate-collage-thumb__cover,
.demo-candidate-collage-thumb__single,
.demo-candidate-collage-thumb__empty {
  grid-area: 1 / 1 / -1 / -1;
}

.demo-candidate-collage-thumb__cover {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  -webkit-user-select: none;
  user-select: none;
  -webkit-user-drag: none;
}

.demo-candidate-collage-thumb__cell {
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--ui-collage-thumb-bg, var(--ui-color-surface-hover));
}

.demo-candidate-collage-thumb__cell--alternate {
  background: var(--ui-collage-thumb-bg, var(--ui-color-surface));
}

.demo-candidate-collage-thumb__cell--vacant {
  color: var(--ui-color-text-muted);
}

.demo-candidate-collage-thumb__overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

.demo-candidate-collage-thumb__overlay :deep(*) {
  pointer-events: auto;
}
</style>
