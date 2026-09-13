<script setup>
import { computed, useAttrs } from 'vue';
import DemoCandidateArtworkEmpty from './DemoCandidateArtworkEmpty.vue';
import DemoCandidateTrackArtwork from './DemoCandidateTrackArtwork.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  track: { type: Object, default: undefined },
  size: { type: [Number, String], required: true },
  radius: { type: String, default: undefined },
  background: { type: String, default: undefined },
  color: { type: String, default: undefined },
  fontSize: { type: String, default: undefined },
  uppercase: { type: Boolean, default: true },
  decorative: { type: Boolean, default: true },
});

const attrs = useAttrs();
const semanticRole = computed(() =>
  props.decorative ? undefined : (attrs.role ?? 'img'),
);

function toCssLength(value) {
  return typeof value === 'number' ? `${value}px` : value;
}
</script>

<template>
  <span
    v-bind="attrs"
    class="demo-candidate-track-thumb"
    :aria-hidden="decorative ? 'true' : undefined"
    :role="semanticRole"
    :style="{
      width: toCssLength(size),
      height: toCssLength(size),
      '--ui-track-thumb-radius': radius,
      '--ui-track-thumb-bg': background,
      '--ui-track-thumb-color': color,
      '--ui-track-thumb-font-size': fontSize,
      '--ui-track-artwork-transform': uppercase ? 'uppercase' : 'none',
    }"
  >
    <DemoCandidateTrackArtwork v-if="track" :track="track" />
    <slot v-else>
      <DemoCandidateArtworkEmpty />
    </slot>
    <slot name="overlay" />
  </span>
</template>

<style scoped>
.demo-candidate-track-thumb {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--ui-track-thumb-radius, var(--ui-radius-sm));
  background: var(--ui-track-thumb-bg, var(--ui-color-surface-hover));
  color: var(--ui-track-thumb-color, var(--ui-color-text));
  font-size: var(--ui-track-thumb-font-size, var(--ui-font-size-sm));
  font-weight: var(--ui-font-weight-semibold);
  -webkit-user-select: none;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
