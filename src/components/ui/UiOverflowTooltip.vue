<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useAttrs,
  watch,
} from 'vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import { isTooltipPlacement, useTooltip } from './useTooltip.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  as: { type: [String, Object], default: 'span' },
  text: { type: [String, Number], default: '' },
  tooltipEnabled: { type: Boolean, default: true },
  placement: {
    type: String,
    default: 'top',
    validator: isTooltipPlacement,
  },
});

const attrs = useAttrs();
const isOverflowing = shallowRef(false);
const hasInlineEndOverflow = shallowRef(false);
const rootElement = shallowRef(null);
let resizeObserver;
let mounted = false;
const displayText = computed(() => String(props.text ?? ''));
const disabled = computed(
  () => !props.tooltipEnabled || !isOverflowing.value || !displayText.value,
);
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

defineExpose({
  triggerProps: tooltipTriggerProps,
  element: rootElement,
  hasInlineEndOverflow,
});

const rootProps = computed(() => ({
  ...attrs,
  ...tooltipTriggerProps.value,
  ref: setRoot,
  onPointerenter: handlePointerenter,
  onFocusin: handleFocusin,
}));

function setRoot(value) {
  rootElement.value = value?.$el ?? value;
  tooltipTriggerProps.value.ref(value);
}

function measure(element = rootElement.value) {
  isOverflowing.value = Boolean(
    element &&
    element.clientWidth > 0 &&
    element.clientHeight > 0 &&
    (element.scrollWidth > element.clientWidth ||
      element.scrollHeight > element.clientHeight),
  );
  hasInlineEndOverflow.value = Boolean(
    element &&
    element.clientWidth > 0 &&
    element.clientHeight > 0 &&
    element.scrollWidth -
      element.clientWidth -
      Math.abs(element.scrollLeft || 0) >
      0.5,
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

const remeasure = () => measure();
watch(displayText, remeasure, { flush: 'post' });
watch(
  rootElement,
  (element, previous) => {
    if (previous) resizeObserver?.unobserve(previous);
    if (element) resizeObserver?.observe(element);
    measure(element);
  },
  { flush: 'post' },
);

onMounted(() => {
  mounted = true;
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(remeasure);
    if (rootElement.value) resizeObserver.observe(rootElement.value);
  } else {
    globalThis.window?.addEventListener?.('resize', remeasure);
  }
  remeasure();
  globalThis.document?.fonts?.ready?.then(() => {
    if (mounted) remeasure();
  });
});

onBeforeUnmount(() => {
  mounted = false;
  resizeObserver?.disconnect();
  if (!resizeObserver)
    globalThis.window?.removeEventListener?.('resize', remeasure);
});
</script>

<template>
  <component :is="props.as" v-bind="rootProps" @scroll="remeasure">
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
