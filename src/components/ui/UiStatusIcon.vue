<script setup>
// Small circular status badge for repeated row-trailing states.
import { computed, mergeProps, useAttrs } from 'vue';
import { ICON_SIZE } from '../../icons/index.js';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import { useTooltip } from './useTooltip.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  icon: { type: [Object, Function], required: true },
  // Existing callers use muted/accent/danger/text/highlight; the rest are
  // already styled (see the tone rules below) for when new states need them.
  tone: {
    type: String,
    default: 'muted',
    validator: (value) =>
      [
        'muted',
        'accent',
        'info',
        'success',
        'warning',
        'danger',
        'current',
        'gated',
        'text',
        'highlight',
      ].includes(value),
  },
  spinning: { type: Boolean, default: false },
  label: { type: String, required: true },
  decorative: { type: Boolean, default: false },
});
const attrs = useAttrs();

const { open, position, setTooltip, tooltipId, triggerProps } = useTooltip({
  text: computed(() => props.label),
  placement: 'top',
  disabled: computed(() => props.decorative),
  describedBy: true,
});
function rootProps() {
  const bindings = mergeProps(attrs, triggerProps.value);
  const describedBy = [
    attrs['aria-describedby'],
    triggerProps.value['aria-describedby'],
  ]
    .filter(Boolean)
    .join(' ')
    .split(/\s+/u)
    .filter(Boolean);
  return {
    ...bindings,
    'aria-describedby': [...new Set(describedBy)].join(' ') || undefined,
  };
}
</script>

<template>
  <span
    v-bind="rootProps()"
    class="ui-status-icon"
    :class="`ui-status-icon--${tone}`"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : label"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <component
      :is="icon"
      class="ui-status-icon__glyph"
      :class="{ 'ui-status-icon__glyph--spin': spinning }"
      :size="ICON_SIZE"
      aria-hidden="true"
    />
  </span>
  <UiTooltipSurface
    :open="open"
    :text="label"
    :tooltip-id="tooltipId"
    :position="position"
    placement="top"
    :set-element="setTooltip"
  />
</template>

<style scoped>
.ui-status-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-space-5);
  height: var(--ui-space-5);
  border-radius: var(--ui-radius-pill);
  /* Not a tokens.css token — a per-context override a parent can set (see
     LyricsAuthoringWorkspace.vue's .lyrics-row-status) when its own background
     differs from the default contrast target below. Custom properties
     inherit through the DOM, so the scoped-style boundary doesn't block it. */
  background: var(--ui-status-icon-background, var(--ui-color-surface-hover));
  color: var(--ui-color-text-muted);
}

.ui-status-icon--accent {
  color: var(--ui-color-accent);
}

.ui-status-icon--info {
  color: var(--ui-color-info);
}

.ui-status-icon--success {
  color: var(--ui-color-success);
}

.ui-status-icon--warning {
  color: var(--ui-color-warning);
}

.ui-status-icon--danger {
  color: var(--ui-color-danger);
}

.ui-status-icon--current {
  color: var(--ui-color-current);
  background: var(--ui-color-current-soft);
}

.ui-status-icon--gated {
  color: var(--ui-color-gated);
  background: var(--ui-color-gated-background);
}

.ui-status-icon--text {
  color: var(--ui-color-text);
}

.ui-status-icon--highlight {
  color: var(--ui-color-text);
  background: var(--ui-color-surface-hover);
}

.ui-status-icon__glyph--spin {
  animation: ui-status-icon-spin calc(var(--ui-motion-duration-slow) * 4) linear
    infinite;
}

@keyframes ui-status-icon-spin {
  to {
    transform: rotate(360deg);
  }
}

:global(:root[data-ui-motion='reduced'] .ui-status-icon__glyph--spin) {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .ui-status-icon__glyph--spin {
    animation: none;
  }
}
</style>
