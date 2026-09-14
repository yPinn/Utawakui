<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useId,
  useTemplateRef,
} from 'vue';
import {
  anchoredFloatingPosition,
  customLengthPixels,
} from './floatingPosition.js';

const props = defineProps({
  text: { type: String, required: true },
  placement: {
    type: String,
    default: 'top',
    validator: (value) => ['bottom', 'end', 'start', 'top'].includes(value),
  },
  delayMs: { type: Number, default: 500 },
  closeDelayMs: { type: Number, default: 100 },
  disabled: { type: Boolean, default: false },
});

const anchorRef = useTemplateRef('anchor');
const tooltipRef = useTemplateRef('tooltip');
const tooltipId = `ui-tooltip-${useId()}`;
const open = shallowRef(false);
const position = shallowRef({ left: '0px', top: '0px' });
const triggerProps = computed(() => ({
  'aria-describedby': props.disabled || !props.text ? undefined : tooltipId,
}));

let openTimer;
let closeTimer;

function clearTimers() {
  clearTimeout(openTimer);
  clearTimeout(closeTimer);
  openTimer = undefined;
  closeTimer = undefined;
}

function updatePosition() {
  if (!open.value || typeof window === 'undefined') return;
  const anchor = anchorRef.value?.getBoundingClientRect();
  const tooltip = tooltipRef.value?.getBoundingClientRect();
  if (!anchor || !tooltip) return;

  const { left, top } = anchoredFloatingPosition({
    anchor,
    surface: tooltip,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    placement: props.placement,
    direction: window.getComputedStyle(anchorRef.value).direction,
    gap: customLengthPixels('--ui-floating-gap', 0.5),
    inset: customLengthPixels('--ui-floating-viewport-inset', 0.5),
  });
  position.value = { left: `${left}px`, top: `${top}px` };
}

function show() {
  if (props.disabled || !props.text) return;
  clearTimeout(closeTimer);
  open.value = true;
  nextTick(updatePosition);
}

function scheduleShow(event) {
  if (event.pointerType === 'touch' || props.disabled || !props.text) return;
  clearTimers();
  openTimer = setTimeout(show, Math.max(0, props.delayMs));
}

function scheduleHide() {
  clearTimers();
  closeTimer = setTimeout(
    () => {
      open.value = false;
    },
    Math.max(0, props.closeDelayMs),
  );
}

function hideNow() {
  clearTimers();
  open.value = false;
}

function handleKeydown(event) {
  if (event.key !== 'Escape' || !open.value) return;
  event.stopPropagation();
  hideNow();
}

onMounted(() => {
  if (typeof window === 'undefined') return;
  window.addEventListener('resize', updatePosition);
  window.addEventListener('scroll', updatePosition, true);
});

onBeforeUnmount(() => {
  clearTimers();
  if (typeof window === 'undefined') return;
  window.removeEventListener('resize', updatePosition);
  window.removeEventListener('scroll', updatePosition, true);
});
</script>

<template>
  <span
    ref="anchor"
    class="ui-tooltip__anchor"
    @pointerenter="scheduleShow"
    @pointerleave="scheduleHide"
    @focusin="show"
    @focusout="scheduleHide"
    @keydown="handleKeydown"
  >
    <slot name="trigger" :trigger-props="triggerProps" />
  </span>
  <Teleport to="body">
    <span
      v-if="open"
      :id="tooltipId"
      ref="tooltip"
      class="ui-tooltip"
      role="tooltip"
      :style="position"
    >
      {{ props.text }}
    </span>
  </Teleport>
</template>

<style scoped>
.ui-tooltip__anchor {
  display: inline-flex;
  min-width: 0;
}

.ui-tooltip {
  position: fixed;
  z-index: var(--ui-z-tooltip);
  max-inline-size: min(
    var(--ui-tooltip-max-inline-size),
    calc(100vw - (2 * var(--ui-floating-viewport-inset)))
  );
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-text);
  color: var(--ui-color-canvas);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
}
</style>
