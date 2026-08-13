<script setup>
// Track thumbnail square: image, or initial-letter fallback, or a custom
// fallback via the default slot when there's no track at all.
import { getTrackInitial } from '../../utils/trackDisplay.js';

defineProps({
  track: { type: Object, default: undefined },
  size: { type: Number, required: true },
  radius: { type: String, default: undefined },
  background: { type: String, default: undefined },
  color: { type: String, default: undefined },
  fontSize: { type: String, default: undefined },
  uppercase: { type: Boolean, default: true },
  // False when the root shouldn't be aria-hidden — e.g. it wraps a real
  // interactive overlay control.
  decorative: { type: Boolean, default: true },
});
</script>

<template>
  <span
    class="ui-track-thumb"
    :aria-hidden="decorative ? 'true' : undefined"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      '--ui-track-thumb-radius': radius,
      '--ui-track-thumb-bg': background,
      '--ui-track-thumb-color': color,
      '--ui-track-thumb-font-size': fontSize,
      '--ui-track-thumb-transform': uppercase ? 'uppercase' : 'none',
    }"
  >
    <img
      v-if="track?.thumbnailUrl"
      class="ui-track-thumb__image"
      :src="track.thumbnailUrl"
      alt=""
      draggable="false"
    />
    <span v-else-if="track">{{ getTrackInitial(track) }}</span>
    <slot v-else />
    <slot name="overlay" />
  </span>
</template>

<style scoped>
.ui-track-thumb {
  /* Custom-property overrides (not direct color/background/etc.) so a
     caller-scope selector overriding the old class name (e.g.
     .playlist-sidebar-row--active .playlist-sidebar-row__thumb) still wins
     on normal cascade specificity instead of losing to an inline style. */
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-track-thumb-radius, var(--ui-radius-sm));
  background: var(--ui-track-thumb-bg, var(--ui-color-surface-hover));
  color: var(--ui-track-thumb-color, var(--ui-color-text));
  font-size: var(--ui-track-thumb-font-size, var(--ui-font-size-sm));
  font-weight: var(--ui-font-weight-strong);
  text-transform: var(--ui-track-thumb-transform, uppercase);
  overflow: hidden;
  user-select: none;
  -webkit-user-drag: none;
}

.ui-track-thumb__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
