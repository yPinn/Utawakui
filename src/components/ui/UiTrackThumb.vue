<script setup>
// Track thumbnail square: custom artwork, stable default artwork, or a custom
// empty-state slot when there is no track identity at all.
import UiArtworkOverlay from './UiArtworkOverlay.vue';
import TrackArtworkContent from './TrackArtworkContent.vue';

defineProps({
  track: { type: Object, default: undefined },
  size: { type: [Number, String], required: true },
  radius: { type: String, default: undefined },
  background: { type: String, default: undefined },
  color: { type: String, default: undefined },
  fontSize: { type: String, default: undefined },
  uppercase: { type: Boolean, default: true },
  // False when the root shouldn't be aria-hidden — e.g. it wraps a real
  // interactive overlay control.
  decorative: { type: Boolean, default: true },
  loading: {
    type: String,
    default: 'eager',
    validator: (value) => value === 'eager' || value === 'lazy',
  },
  decoding: {
    type: String,
    default: 'auto',
    validator: (value) => ['auto', 'sync', 'async'].includes(value),
  },
});

function toCssLength(value) {
  return typeof value === 'number' ? `${value}px` : value;
}
</script>

<template>
  <span
    class="ui-track-thumb"
    :aria-hidden="decorative ? 'true' : undefined"
    :style="{
      width: toCssLength(size),
      height: toCssLength(size),
      '--ui-track-thumb-radius': radius,
      '--ui-track-thumb-background': background,
      '--ui-track-thumb-color': color,
      '--ui-track-thumb-font-size': fontSize,
      '--ui-track-thumb-transform': uppercase ? 'uppercase' : 'none',
    }"
  >
    <span class="ui-track-thumb__layers ui-artwork-composite">
      <TrackArtworkContent
        v-if="track"
        :track="track"
        :loading="loading"
        :decoding="decoding"
      />
      <slot v-else />
      <UiArtworkOverlay v-if="$slots.overlay">
        <slot name="overlay" />
      </UiArtworkOverlay>
    </span>
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
  border-radius: var(--ui-track-thumb-radius, var(--ui-radius-sm));
  color: var(--ui-track-thumb-color, var(--ui-color-text));
  font-size: var(--ui-track-thumb-font-size, var(--ui-type-label-size));
  font-weight: var(--ui-type-label-weight);
  text-transform: var(--ui-track-thumb-transform, uppercase);
  overflow: hidden;
  user-select: none;
  -webkit-user-drag: none;
}

/* The root is the only radius clip; background, image and overlay composite
   here first (see .ui-artwork-composite). */
.ui-track-thumb__layers {
  /* In flow, so the root keeps its original size and baseline. */
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ui-track-thumb-background, var(--ui-color-surface-hover));
}
</style>
