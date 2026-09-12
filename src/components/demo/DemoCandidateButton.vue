<script setup>
import { ICON_SIZE, Loader2 } from '../../icons/index.js';

defineProps({
  icon: { type: [Object, Function], default: null },
  type: {
    type: String,
    default: 'button',
    validator: (value) => ['button', 'submit', 'reset'].includes(value),
  },
  variant: {
    type: String,
    default: 'ghost',
    validator: (value) => ['ghost', 'secondary', 'accent'].includes(value),
  },
  active: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  loadingLabel: { type: String, default: '處理中' },
});
</script>

<template>
  <button
    :type="type"
    class="demo-candidate-btn"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :class="[
      `demo-candidate-btn--${variant}`,
      {
        'demo-candidate-btn--active': active,
        'is-loading': loading,
      },
    ]"
  >
    <Loader2
      v-if="loading"
      class="demo-candidate-btn__spinner"
      :size="ICON_SIZE"
      aria-hidden="true"
    />
    <component
      :is="icon"
      v-else-if="icon"
      class="demo-candidate-btn__icon"
      :size="ICON_SIZE"
      aria-hidden="true"
    />
    <span class="demo-candidate-btn__label">
      {{ loading ? loadingLabel : undefined }}<slot v-if="!loading" />
    </span>
  </button>
</template>

<style scoped>
.demo-candidate-btn {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  min-height: var(--demo-button-height, var(--ui-control-height));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-1);
  padding: var(--ui-space-1) var(--ui-space-3);
  border: var(--ui-border-width) solid transparent;
  border-radius: var(--ui-radius-md);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  -webkit-user-select: none;
  user-select: none;
  cursor: pointer;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    color var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard),
    opacity var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard);
}

.demo-candidate-btn__icon,
.demo-candidate-btn__spinner {
  flex: 0 0 auto;
}

.demo-candidate-btn__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-candidate-btn--ghost {
  background: transparent;
  color: var(--ui-color-text-muted);
}

.demo-candidate-btn--ghost:not(:disabled):hover {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.demo-candidate-btn--ghost:not(:disabled):active {
  background: var(--ui-color-surface-active);
  color: var(--ui-color-text);
}

.demo-candidate-btn--ghost.demo-candidate-btn--active {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.demo-candidate-btn--secondary {
  border-color: var(--ui-color-border);
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-text);
}

.demo-candidate-btn--secondary:not(:disabled):hover {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-hover);
}

.demo-candidate-btn--secondary:not(:disabled):active {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-active);
}

.demo-candidate-btn--secondary.demo-candidate-btn--active {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.demo-candidate-btn--accent {
  background: var(--ui-color-accent);
  color: var(--ui-color-accent-contrast);
}

.demo-candidate-btn--accent:not(:disabled):hover {
  background: var(--ui-color-accent-hover);
}

.demo-candidate-btn--accent:not(:disabled):active {
  background: var(--ui-color-accent-active);
}

.demo-candidate-btn:disabled,
.demo-candidate-btn[aria-disabled='true'] {
  opacity: var(--ui-opacity-disabled);
  cursor: not-allowed;
}

.demo-candidate-btn:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-candidate-btn__spinner {
  animation: demo-candidate-btn-spin calc(var(--ui-motion-duration-slow) * 4)
    linear infinite;
}

@keyframes demo-candidate-btn-spin {
  to {
    transform: rotate(1turn);
  }
}

:global(:root[data-ui-motion='reduced'] .demo-candidate-btn__spinner) {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .demo-candidate-btn__spinner {
    animation: none;
  }
}
</style>
