<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useAttrs,
  watch,
} from 'vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import { useTooltip } from './useTooltip.js';

const props = defineProps({
  text: { type: [String, Number], default: '' },
  tooltipEnabled: { type: Boolean, default: true },
});
defineOptions({ inheritAttrs: false });
const attrs = useAttrs();

const rootRef = ref(null);
const textRef = ref(null);
const isOverflowing = shallowRef(false);
const distance = shallowRef(0);
const motionReduced = shallowRef(false);

const displayText = computed(() => String(props.text ?? ''));
// The moving text already reveals the full value; only a reduced-motion
// ellipsis needs the tooltip, so long and short titles otherwise match.
const tooltipDisabled = computed(
  () =>
    !props.tooltipEnabled ||
    !motionReduced.value ||
    !isOverflowing.value ||
    !displayText.value,
);
const {
  open: tooltipOpen,
  position: tooltipPosition,
  setTooltip,
  tooltipId,
  triggerProps: tooltipTriggerProps,
} = useTooltip({
  text: displayText,
  placement: 'top',
  disabled: tooltipDisabled,
  describedBy: true,
});
const motionAwareTriggerProps = computed(() => ({
  ...tooltipTriggerProps.value,
  onPointerenter: handlePointerenter,
  onFocusin: handleFocusin,
}));
defineExpose({ triggerProps: motionAwareTriggerProps });
const rootProps = computed(() => ({
  ...attrs,
  ...motionAwareTriggerProps.value,
}));

// Mirrors the CSS stop conditions: root data-ui-motion or the OS preference.
function readMotionReduced() {
  motionReduced.value =
    globalThis.document?.documentElement?.dataset?.uiMotion === 'reduced' ||
    Boolean(
      globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')
        ?.matches,
    );
}

function handlePointerenter(event) {
  readMotionReduced();
  tooltipTriggerProps.value.onPointerenter(event);
}

function handleFocusin(event) {
  readMotionReduced();
  tooltipTriggerProps.value.onFocusin(event);
}
const marqueeDuration = computed(() => {
  const seconds = distance.value / 26 + 4;
  return `${Math.min(16, Math.max(7, seconds)).toFixed(2)}s`;
});
const marqueeStyle = computed(() => ({
  '--ui-marquee-distance': `${distance.value}px`,
  '--ui-marquee-duration': marqueeDuration.value,
}));

let resizeObserver;
let frameId = 0;
let mounted = false;

function setRoot(value) {
  rootRef.value = value?.$el ?? value;
  tooltipTriggerProps.value.ref(value);
}

function measure() {
  if (!mounted) return;
  cancelAnimationFrame(frameId);
  frameId = requestAnimationFrame(() => {
    const root = rootRef.value;
    const text = textRef.value;
    if (!root || !text) return;
    readMotionReduced();
    if (!(root.clientWidth > 0 && root.clientHeight > 0)) {
      isOverflowing.value = false;
      distance.value = 0;
      return;
    }
    // Reduced motion removes the trailing padding. Read the rendered value
    // rather than inferring it from the overflow class or a fixed pixel gap.
    const appliedBuffer = parseFloat(getComputedStyle(text).paddingRight) || 0;
    const naturalScrollWidth = text.scrollWidth - appliedBuffer;
    const overflow = Math.ceil(naturalScrollWidth - root.clientWidth);
    isOverflowing.value = overflow > 1;
    distance.value = isOverflowing.value ? overflow : 0;
  });
}

onMounted(() => {
  mounted = true;
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(measure);
    // Observe only the root, not the text span: the text's size changes *because*
    // isOverflowing toggles (.ui-marquee--overflow flips its max-width/padding), so
    // observing it would loop (measure() sets overflow, the resize re-fires, it
    // flips back off) faster than the 0.8s start delay completes. The text's real
    // size inputs (content change, font swap) are covered by the displayText watcher
    // below and document.fonts.ready.
    if (rootRef.value) resizeObserver.observe(rootRef.value);
  } else {
    globalThis.window?.addEventListener?.('resize', measure);
  }
  measure();
  // A row that mounts before its font finishes loading measures against
  // fallback-font metrics; scrollWidth changes once the real font swaps in,
  // but nothing re-triggers ResizeObserver for a font-only change, so a
  // borderline-overflowing CJK/Latin-mixed string can get stuck reporting
  // "not overflowing" forever. document.fonts is unavailable under Vitest's
  // plain-Node environment, hence the guard.
  document.fonts?.ready?.then(measure);
});

onBeforeUnmount(() => {
  mounted = false;
  cancelAnimationFrame(frameId);
  resizeObserver?.disconnect();
  if (!resizeObserver)
    globalThis.window?.removeEventListener?.('resize', measure);
});

watch(displayText, measure, { flush: 'post' });
</script>

<template>
  <span
    v-bind="rootProps"
    :ref="setRoot"
    class="ui-marquee"
    :class="{ 'ui-marquee--overflow': isOverflowing }"
    :style="marqueeStyle"
  >
    <span :key="displayText" ref="textRef" class="ui-marquee__text">{{
      displayText
    }}</span>
  </span>
  <UiTooltipSurface
    :open="tooltipOpen"
    :text="displayText"
    :tooltip-id="tooltipId"
    :position="tooltipPosition"
    placement="top"
    :set-element="setTooltip"
  />
</template>

<style scoped>
.ui-marquee {
  display: block;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.ui-marquee__text {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap;
}

.ui-marquee--overflow .ui-marquee__text {
  max-width: none;
  padding-right: var(--ui-space-4);
  will-change: transform;
  animation: ui-marquee-scroll var(--ui-marquee-duration) ease-in-out 0.8s
    infinite alternate;
}

@keyframes ui-marquee-scroll {
  0%,
  20% {
    transform: translateX(0);
  }

  80%,
  100% {
    transform: translateX(
      calc((var(--ui-marquee-distance) + var(--ui-space-4)) * -1)
    );
  }
}

:global(
  :root[data-ui-motion='reduced'] .ui-marquee--overflow .ui-marquee__text
) {
  max-width: 100%;
  padding-right: 0;
  animation: none;
  will-change: auto;
}

@media (prefers-reduced-motion: reduce) {
  .ui-marquee--overflow .ui-marquee__text {
    max-width: 100%;
    padding-right: 0;
    animation: none;
    will-change: auto;
  }
}
</style>
