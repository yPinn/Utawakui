<script setup>
import { computed } from 'vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import { isTooltipPlacement, useTooltip } from './useTooltip.js';

const props = defineProps({
  text: { type: String, required: true },
  detail: { type: String, default: '' },
  placement: {
    type: String,
    default: 'top',
    validator: isTooltipPlacement,
  },
  delayMs: { type: Number, default: 500 },
  closeDelayMs: { type: Number, default: 100 },
  disabled: { type: Boolean, default: false },
});

const { open, position, setTooltip, tooltipId, triggerProps } = useTooltip({
  text: computed(() => props.text),
  placement: computed(() => props.placement),
  delayMs: computed(() => props.delayMs),
  closeDelayMs: computed(() => props.closeDelayMs),
  disabled: computed(() => props.disabled),
  describedBy: true,
});
</script>

<template>
  <slot name="trigger" :trigger-props="triggerProps" />
  <UiTooltipSurface
    :open="open"
    :text="props.text"
    :detail="props.detail"
    :tooltip-id="tooltipId"
    :position="position"
    :placement="props.placement"
    :set-element="setTooltip"
  />
</template>
