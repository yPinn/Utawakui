<script setup>
import { computed, mergeProps, useAttrs } from 'vue';
import { ICON_SIZE } from '../../icons/index.js';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import { isTooltipPlacement, useTooltip } from './useTooltip.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  icon: { type: [Object, Function], required: true },
  label: { type: String, required: true },
  title: { type: String, default: undefined },
  tooltipPlacement: {
    type: String,
    default: 'top',
    validator: isTooltipPlacement,
  },
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

const attrs = useAttrs();
const titleText = computed(() => props.title ?? props.label);
const {
  open: tooltipOpen,
  position: tooltipPosition,
  setTooltip,
  tooltipId,
  triggerProps,
} = useTooltip({
  text: titleText,
  placement: computed(() => props.tooltipPlacement),
  describedBy: false,
});

function buttonAttrs(triggerProps) {
  const forwardedAttrs = { ...attrs };
  Reflect.deleteProperty(forwardedAttrs, 'aria-label');
  return mergeProps(forwardedAttrs, triggerProps);
}
</script>

<template>
  <button
    v-bind="buttonAttrs(triggerProps)"
    type="button"
    class="ui-icon-btn"
    :class="[
      `ui-icon-btn--${variant}`,
      `ui-icon-btn--${size}`,
      `ui-icon-btn--${shape}`,
      {
        'ui-icon-btn--active': active,
        'ui-icon-btn--stretch': stretch,
      },
    ]"
  >
    <component
      :is="icon"
      :size="ICON_SIZE"
      :fill="fill ? 'currentColor' : 'none'"
      aria-hidden="true"
    />
    <span class="ui-visually-hidden">{{ label }}</span>
    <UiTooltipSurface
      :open="tooltipOpen"
      :text="titleText"
      :tooltip-id="tooltipId"
      :position="tooltipPosition"
      :placement="tooltipPlacement"
      :set-element="setTooltip"
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

.ui-icon-btn--stretch {
  min-width: var(--ui-icon-button-size-md);
  min-height: var(--ui-icon-button-size-md);
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
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

.ui-icon-btn--ghost:not(:disabled):active {
  background: var(--ui-color-surface-active);
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

.ui-icon-btn--stretch:focus-visible {
  outline-offset: var(--ui-focus-offset-inset);
}
</style>
