<script setup>
import { computed } from 'vue';
import { ICON_SIZE } from '../../icons/index.js';

const props = defineProps({
  icon: { type: [Object, Function], required: true },
  label: { type: String, required: true },
  title: { type: String, default: undefined },
  variant: { type: String, default: 'ghost' }, // 'ghost' | 'accent' | 'overlay'
  size: { type: String, default: 'md' }, // 'sm' | 'md' | 'lg'
  shape: { type: String, default: 'square' }, // 'square' | 'circle' | 'inherit'
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
  border-radius: var(--ui-radius);
  font-family: var(--ui-font-family-base);
  cursor: pointer;
  transition:
    background-color var(--ui-motion-fast) var(--ui-motion-ease),
    color var(--ui-motion-fast) var(--ui-motion-ease),
    opacity var(--ui-motion-fast) var(--ui-motion-ease);
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
  border-radius: var(--ui-radius);
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
  background: rgb(0 0 0 / 55%);
  color: #fff;
}

.ui-icon-btn:disabled,
.ui-icon-btn[aria-disabled='true'] {
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.ui-icon-btn:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
