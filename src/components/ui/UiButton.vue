<script setup>
// `aria-*`/`@click` and other native button attributes still reach the root
// button. `title` is deliberately owned here so operator-facing hints use the
// shared app tooltip instead of Chromium's native tooltip.
import { computed, mergeProps, useAttrs } from 'vue';
import { ICON_SIZE, Loader2 } from '../../icons/index.js';
import { nativeButtonAttrs } from './buttonAttrs.js';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import { isTooltipPlacement, useTooltip } from './useTooltip.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  icon: { type: [Object, Function], default: null },
  title: { type: String, default: '' },
  tooltipPlacement: {
    type: String,
    default: 'top',
    validator: isTooltipPlacement,
  },
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
  intent: {
    type: String,
    default: 'neutral',
    validator: (value) => ['neutral', 'danger'].includes(value),
  },
  active: { type: Boolean, default: false }, // toggle state, e.g. repeat-on
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  loadingLabel: { type: String, default: '處理中' },
});

const attrs = useAttrs();
const tooltipText = computed(() => props.title);
const hasOwnedTooltip = computed(() => Boolean(tooltipText.value));
const {
  open: tooltipOpen,
  position: tooltipPosition,
  setTooltip,
  tooltipId,
  triggerProps,
} = useTooltip({
  text: tooltipText,
  placement: computed(() => props.tooltipPlacement),
  disabled: computed(() => !hasOwnedTooltip.value),
  describedBy: false,
});

function buttonAttrs(tooltipTriggerProps) {
  const forwardedAttrs = nativeButtonAttrs(
    attrs,
    props.disabled || props.loading,
  );
  return hasOwnedTooltip.value
    ? mergeProps(forwardedAttrs, tooltipTriggerProps)
    : forwardedAttrs;
}
</script>

<template>
  <button
    v-bind="buttonAttrs(triggerProps)"
    :type="type"
    class="ui-btn"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :class="[
      `ui-btn--${variant}`,
      `ui-btn--intent-${intent}`,
      {
        'ui-btn--active': active,
        'ui-btn--icon-only': (icon || loading) && !$slots.default,
        'is-loading': loading,
      },
    ]"
  >
    <Loader2
      v-if="loading"
      class="ui-btn__spinner"
      :size="ICON_SIZE"
      aria-hidden="true"
    />
    <component
      :is="icon"
      v-else-if="icon"
      class="ui-btn__icon"
      :size="ICON_SIZE"
      aria-hidden="true"
    />
    <span v-if="loading" class="ui-btn__label">{{ loadingLabel }}</span>
    <span v-else-if="$slots.default" class="ui-btn__label"><slot /></span>
    <UiTooltipSurface
      :open="tooltipOpen"
      :text="tooltipText"
      :tooltip-id="tooltipId"
      :position="tooltipPosition"
      :placement="tooltipPlacement"
      :set-element="setTooltip"
    />
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
  border-radius: var(--ui-radius-md);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
  cursor: pointer;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    color var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard),
    opacity var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard);
}

@scope ([data-ui-system='v2']) to ([data-ui-system]) {
  .ui-btn {
    box-sizing: border-box;
    min-width: 0;
    max-width: 100%;
    justify-content: center;
    padding: var(--ui-space-1) var(--ui-space-3);
    border: var(--ui-border-width) solid transparent;
    -webkit-user-select: none;
    user-select: none;
  }

  .ui-btn__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ui-btn--ghost:not(:disabled):not([aria-disabled='true']):active {
    background: var(--ui-color-surface-active);
    color: var(--ui-color-text);
  }

  .ui-btn--secondary:not(:disabled):not([aria-disabled='true']):active {
    border-color: var(--ui-color-border-strong);
    background: var(--ui-color-surface-active);
  }

  .ui-btn--accent:not(:disabled):not([aria-disabled='true']):active {
    background: var(--ui-color-accent-active);
  }

  .ui-btn--intent-danger.ui-btn--ghost:not(:disabled):not(
      [aria-disabled='true']
    ):active {
    background: var(--ui-button-danger-surface-active);
    color: var(--ui-button-danger-text);
  }

  .ui-btn--intent-danger.ui-btn--secondary:not(:disabled):not(
      [aria-disabled='true']
    ):active {
    border-color: var(--ui-button-danger-border);
    background: var(--ui-button-danger-surface-active);
    color: var(--ui-button-danger-text);
  }

  .ui-btn--intent-danger.ui-btn--accent:not(:disabled):not(
      [aria-disabled='true']
    ):active {
    background: var(--ui-button-danger-fill-active);
  }
}

.ui-btn__icon,
.ui-btn__spinner {
  flex: 0 0 auto;
}

.ui-btn--icon-only {
  width: var(--ui-icon-button-size-md);
  height: var(--ui-icon-button-size-md);
  flex: 0 0 var(--ui-icon-button-size-md);
  justify-content: center;
  padding: 0;
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

.ui-btn--secondary {
  border: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-text);
}

.ui-btn--secondary:not(:disabled):not([aria-disabled='true']):hover {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-hover);
}

.ui-btn--secondary.ui-btn--active {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.ui-btn--accent {
  background: var(--ui-color-accent);
  color: var(--ui-color-accent-contrast);
}

.ui-btn--accent:not(:disabled):not([aria-disabled='true']):hover {
  background: var(--ui-color-accent-hover);
}

.ui-btn--intent-danger.ui-btn--ghost {
  color: var(--ui-button-danger-text);
}

.ui-btn--intent-danger.ui-btn--ghost:not(:disabled):not(
    [aria-disabled='true']
  ):hover {
  background: var(--ui-button-danger-surface-hover);
  color: var(--ui-button-danger-text);
}

.ui-btn--intent-danger.ui-btn--secondary {
  border-color: var(--ui-button-danger-border);
  color: var(--ui-button-danger-text);
}

.ui-btn--intent-danger.ui-btn--secondary:not(:disabled):not(
    [aria-disabled='true']
  ):hover {
  border-color: var(--ui-button-danger-border);
  background: var(--ui-button-danger-surface-hover);
  color: var(--ui-button-danger-text);
}

.ui-btn--intent-danger.ui-btn--accent {
  background: var(--ui-button-danger-fill);
  color: var(--ui-button-danger-contrast);
}

.ui-btn--intent-danger.ui-btn--accent:not(:disabled):not(
    [aria-disabled='true']
  ):hover {
  background: var(--ui-button-danger-fill-hover);
}

.ui-btn:disabled,
.ui-btn[aria-disabled='true'] {
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.ui-btn--ghost:disabled,
.ui-btn--ghost[aria-disabled='true'],
.ui-btn--secondary:disabled,
.ui-btn--secondary[aria-disabled='true'] {
  color: var(--ui-color-text-muted);
}

/* --ui-color-text-muted is calibrated for text on canvas/surface, not on
   the accent fill this variant keeps at rest — using it here read as
   barely-legible gray-on-teal. accent-contrast-muted is the token built
   for muted text on an accent-colored surface. */
.ui-btn--accent:disabled,
.ui-btn--accent[aria-disabled='true'] {
  color: var(--ui-color-accent-contrast-muted);
}

.ui-btn--intent-danger.ui-btn--ghost:disabled,
.ui-btn--intent-danger.ui-btn--ghost[aria-disabled='true'],
.ui-btn--intent-danger.ui-btn--secondary:disabled,
.ui-btn--intent-danger.ui-btn--secondary[aria-disabled='true'] {
  color: var(--ui-button-danger-text);
}

.ui-btn--intent-danger.ui-btn--accent:disabled,
.ui-btn--intent-danger.ui-btn--accent[aria-disabled='true'] {
  color: var(--ui-button-danger-contrast-muted);
}

.ui-btn:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-btn__spinner {
  animation: ui-btn-spin calc(var(--ui-motion-duration-slow) * 4) linear
    infinite;
}

@keyframes ui-btn-spin {
  to {
    transform: rotate(1turn);
  }
}

:global(:root[data-ui-motion='reduced'] .ui-btn__spinner) {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .ui-btn__spinner {
    animation: none;
  }
}
</style>
