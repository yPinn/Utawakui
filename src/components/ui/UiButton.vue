<script setup>
// `disabled`/`aria-*`/`title`/`@click` reach the root <button> via Vue's
// attribute fallthrough, so they aren't declared as props.
import { ICON_SIZE } from '../../icons/index.js';

defineProps({
  icon: { type: [Object, Function], default: null },
  variant: { type: String, default: 'ghost' }, // 'ghost' | 'accent'
  active: { type: Boolean, default: false }, // toggle state, e.g. repeat-on
});
</script>

<template>
  <button
    type="button"
    class="ui-btn"
    :class="[
      `ui-btn--${variant}`,
      {
        'ui-btn--active': active,
        'ui-btn--icon-only': icon && !$slots.default,
      },
    ]"
  >
    <component :is="icon" v-if="icon" :size="ICON_SIZE" />
    <span v-if="$slots.default"><slot /></span>
  </button>
</template>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  min-height: var(--ui-control-height);
  padding: var(--ui-space-1) var(--ui-space-2);
  border: none;
  border-radius: var(--ui-radius);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  cursor: pointer;
  transition:
    background-color var(--ui-motion-fast) var(--ui-motion-ease),
    color var(--ui-motion-fast) var(--ui-motion-ease);
}

.ui-btn--icon-only {
  padding: var(--ui-space-1);
}

.ui-btn--ghost {
  background: transparent;
  color: var(--ui-color-text-muted);
}

.ui-btn--ghost:not(:disabled):not([aria-disabled='true']):hover {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

/* Background fill, not just icon color — an active toggle (repeat, guide
   vocal) needs a non-color signal too, for users who can't rely on hue
   alone to tell it apart from the off state. */
.ui-btn--ghost.ui-btn--active {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.ui-btn--accent {
  background: var(--ui-color-accent);
  color: var(--ui-color-accent-contrast);
}

.ui-btn--accent:not(:disabled):hover {
  background: var(--ui-color-accent-hover);
}

.ui-btn:disabled,
.ui-btn[aria-disabled='true'] {
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.ui-btn:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
