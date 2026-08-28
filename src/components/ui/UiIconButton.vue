<script setup>
import { computed } from 'vue';
import { ICON_SIZE } from '../../icons/index.js';

const props = defineProps({
  icon: { type: [Object, Function], required: true },
  label: { type: String, required: true },
  title: { type: String, default: undefined },
  variant: {
    type: String,
    default: 'ghost',
    validator: (value) => ['ghost', 'accent', 'overlay'].includes(value),
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
  shape: {
    type: String,
    default: 'square',
    validator: (value) => ['square', 'circle', 'inherit'].includes(value),
  },
  active: { type: Boolean, default: false },
  fill: { type: Boolean, default: false },
});

const titleText = computed(() => props.title ?? props.label);
</script>

<template>
  <button
    type="button"
    class="ui-icon-btn"
    :class="[
      `ui-icon-btn--${variant}`,
      `ui-icon-btn--${size}`,
      `ui-icon-btn--${shape}`,
      { 'ui-icon-btn--active': active },
    ]"
    :aria-label="label"
    :title="titleText"
  >
    <component
      :is="icon"
      :size="ICON_SIZE"
      :fill="fill ? 'currentColor' : 'none'"
      aria-hidden="true"
    />
  </button>
</template>

<style scoped>
.ui-icon-btn {
  width: var(--ui-icon-btn-size);
  height: var(--ui-icon-btn-size);
  flex: 0 0 var(--ui-icon-btn-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: var(--ui-radius-md);
  font-family: var(--ui-font-family-base);
  cursor: pointer;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    color var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard),
    opacity var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard);
}

.ui-icon-btn--sm {
  --ui-icon-btn-size: var(--ui-icon-button-size-sm);
}

.ui-icon-btn--md {
  --ui-icon-btn-size: var(--ui-icon-button-size-md);
}

.ui-icon-btn--lg {
  --ui-icon-btn-size: var(--ui-icon-button-size-lg);
}

.ui-icon-btn--square {
  border-radius: var(--ui-radius-md);
}

.ui-icon-btn--circle {
  border-radius: var(--ui-radius-pill);
}

.ui-icon-btn--inherit {
  border-radius: inherit;
}

.ui-icon-btn--ghost {
  background: transparent;
  color: var(--ui-color-text-muted);
}

.ui-icon-btn--ghost:not(:disabled):hover {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.ui-icon-btn--ghost.ui-icon-btn--active {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.ui-icon-btn--accent {
  background: var(--ui-color-accent);
  color: var(--ui-color-accent-contrast);
}

.ui-icon-btn--accent:not(:disabled):hover {
  background: var(--ui-color-accent-hover);
}

.ui-icon-btn--overlay {
  background: var(--ui-color-overlay-scrim);
  color: var(--ui-color-overlay-contrast);
}

.ui-icon-btn:disabled,
.ui-icon-btn[aria-disabled='true'] {
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

/* Not the overlay variant — its color is deliberately theme-independent
   (see the scrim rationale in tokens.css) since it floats over arbitrary
   artwork/video, not an app surface a muted theme color reads well on. */
.ui-icon-btn--ghost:disabled,
.ui-icon-btn--ghost[aria-disabled='true'] {
  color: var(--ui-color-text-muted);
}

/* accent-contrast-muted, not text-muted — this variant keeps its accent
   fill at rest, and text-muted is calibrated for canvas/surface text, not
   text on that teal background (reads as barely-legible gray-on-teal). */
.ui-icon-btn--accent:disabled,
.ui-icon-btn--accent[aria-disabled='true'] {
  color: var(--ui-color-accent-contrast-muted);
}

.ui-icon-btn:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
