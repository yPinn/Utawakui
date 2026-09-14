<script setup>
import { ChevronRight, ICON_SIZE } from '../../icons/index.js';

const props = defineProps({
  label: { type: String, required: true },
  open: { type: Boolean, default: false },
});

const emit = defineEmits(['update:open', 'toggle']);

function handleToggle(event) {
  const nextOpen = Boolean(event.currentTarget.open);
  emit('update:open', nextOpen);
  emit('toggle', nextOpen);
}
</script>

<template>
  <details class="ui-disclosure" :open="props.open" @toggle="handleToggle">
    <summary class="ui-disclosure__summary">
      <ChevronRight
        class="ui-disclosure__indicator"
        :size="ICON_SIZE"
        aria-hidden="true"
      />
      <span class="ui-disclosure__label">
        <slot name="summary">{{ props.label }}</slot>
      </span>
    </summary>
    <div class="ui-disclosure__body">
      <slot />
    </div>
  </details>
</template>

<style scoped>
.ui-disclosure {
  min-width: 0;
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.ui-disclosure__summary {
  min-height: var(--ui-control-height);
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  cursor: pointer;
  list-style: none;
  -webkit-user-select: none;
  user-select: none;
}

.ui-disclosure__summary::-webkit-details-marker {
  display: none;
}

.ui-disclosure__summary:hover {
  background: var(--ui-color-surface-hover);
}

.ui-disclosure__summary:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.ui-disclosure__indicator {
  flex: 0 0 auto;
  color: var(--ui-color-text-muted);
  transition: transform var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.ui-disclosure[open] .ui-disclosure__indicator {
  transform: rotate(90deg);
}

.ui-disclosure__label {
  min-width: 0;
}

.ui-disclosure__body {
  min-width: 0;
  padding: var(--ui-space-2) var(--ui-space-3) var(--ui-space-3);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
  -webkit-user-select: text;
  user-select: text;
}

:global(:root[data-ui-motion='reduced']) .ui-disclosure__indicator {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .ui-disclosure__indicator {
    transition: none;
  }
}
</style>
