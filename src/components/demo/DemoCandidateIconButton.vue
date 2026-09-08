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
    validator: (value) => ['md', 'lg'].includes(value),
  },
  shape: {
    type: String,
    default: 'square',
    validator: (value) => ['square', 'circle', 'inherit'].includes(value),
  },
  active: { type: Boolean, default: false },
  stretch: { type: Boolean, default: false },
  fill: { type: Boolean, default: false },
});

const titleText = computed(() => props.title ?? props.label);
</script>

<template>
  <button
    type="button"
    class="demo-candidate-icon-btn"
    :class="[
      `demo-candidate-icon-btn--${variant}`,
      `demo-candidate-icon-btn--${size}`,
      `demo-candidate-icon-btn--${shape}`,
      {
        'demo-candidate-icon-btn--active': active,
        'demo-candidate-icon-btn--stretch': stretch,
      },
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
.demo-candidate-icon-btn {
  box-sizing: border-box;
  width: var(--demo-candidate-icon-button-size);
  height: var(--demo-candidate-icon-button-size);
  flex: 0 0 var(--demo-candidate-icon-button-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--ui-radius-md);
  font-family: var(--ui-font-family-base);
  cursor: pointer;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    color var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard),
    opacity var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard);
}

.demo-candidate-icon-btn--md {
  --demo-candidate-icon-button-size: var(
    --demo-icon-button-size,
    var(--ui-icon-button-size-md)
  );
}

.demo-candidate-icon-btn--lg {
  --demo-candidate-icon-button-size: var(--ui-icon-button-size-lg);
}

.demo-candidate-icon-btn--square {
  border-radius: var(--ui-radius-md);
}

.demo-candidate-icon-btn--circle {
  border-radius: var(--ui-radius-pill);
}

.demo-candidate-icon-btn--inherit {
  border-radius: inherit;
}

.demo-candidate-icon-btn--stretch {
  min-width: var(--demo-icon-button-size, var(--ui-icon-button-size-md));
  min-height: var(--demo-icon-button-size, var(--ui-icon-button-size-md));
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
  border-radius: inherit;
  --demo-icon-focus-offset: var(--ui-focus-offset-inset);
}

.demo-candidate-icon-btn--ghost {
  background: transparent;
  color: var(--ui-color-text-muted);
}

.demo-candidate-icon-btn--ghost:not(:disabled):hover {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.demo-candidate-icon-btn--ghost:not(:disabled):active {
  background: var(--ui-color-surface-active);
  color: var(--ui-color-text);
}

.demo-candidate-icon-btn--ghost.demo-candidate-icon-btn--active {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.demo-candidate-icon-btn--accent {
  background: var(--ui-color-accent);
  color: var(--ui-color-accent-contrast);
}

.demo-candidate-icon-btn--accent:not(:disabled):hover {
  background: var(--ui-color-accent-hover);
}

.demo-candidate-icon-btn--accent:not(:disabled):active {
  background: var(--ui-color-accent-active);
}

.demo-candidate-icon-btn--overlay {
  background: var(--ui-color-overlay-scrim);
  color: var(--ui-color-overlay-contrast);
}

.demo-candidate-icon-btn--overlay:not(:disabled):hover {
  background: var(--ui-color-overlay-scrim-hover);
}

.demo-candidate-icon-btn--overlay:not(:disabled):active {
  background: var(--ui-color-overlay-scrim-active);
}

.demo-candidate-icon-btn:disabled,
.demo-candidate-icon-btn[aria-disabled='true'] {
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.demo-candidate-icon-btn--accent:disabled,
.demo-candidate-icon-btn--accent[aria-disabled='true'] {
  color: var(--ui-color-accent-contrast-muted);
}

.demo-candidate-icon-btn:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--demo-icon-focus-offset, var(--ui-focus-offset));
}
</style>
