<script setup>
import { computed, shallowRef, useAttrs, watch } from 'vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import { isTooltipPlacement, useTooltip } from './useTooltip.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  as: { type: [String, Object], default: 'span' },
  text: { type: [String, Number], default: '' },
  placement: {
    type: String,
    default: 'top',
    validator: isTooltipPlacement,
  },
});

const attrs = useAttrs();
const isOverflowing = shallowRef(false);
const displayText = computed(() => String(props.text ?? ''));
const disabled = computed(() => !isOverflowing.value || !displayText.value);
const {
  open,
  position,
  setTooltip,
  tooltipId,
  triggerProps: tooltipTriggerProps,
} = useTooltip({
  text: displayText,
  placement: computed(() => props.placement),
  disabled,
  describedBy: true,
});

const rootProps = computed(() => ({
  ...attrs,
  ...tooltipTriggerProps.value,
  onPointerenter: handlePointerenter,
  onFocusin: handleFocusin,
}));

function measure(element) {
  isOverflowing.value = Boolean(
    element &&
    (element.scrollWidth > element.clientWidth ||
      element.scrollHeight > element.clientHeight),
  );
}

function handlePointerenter(event) {
  measure(event.currentTarget);
  tooltipTriggerProps.value.onPointerenter(event);
}

function handleFocusin(event) {
  measure(event.currentTarget);
  tooltipTriggerProps.value.onFocusin(event);
}

watch(displayText, () => {
  isOverflowing.value = false;
});
</script>

<template>
  <component :is="props.as" v-bind="rootProps">
    <slot>{{ displayText }}</slot>
  </component>
  <UiTooltipSurface
    :open="open"
    :text="displayText"
    :tooltip-id="tooltipId"
    :position="position"
    :placement="props.placement"
    :set-element="setTooltip"
  />
</template>
