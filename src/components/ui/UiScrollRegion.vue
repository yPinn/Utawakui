<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useAttrs,
  useTemplateRef,
  watch,
} from 'vue';
import {
  getOverlayThumbGeometry,
  getScrollOffsetFromThumbDelta,
} from './scrollRegionGeometry.js';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  axis: {
    type: String,
    default: 'vertical',
    validator: (value) => ['vertical', 'horizontal', 'both'].includes(value),
  },
  viewportClass: {
    type: [String, Array, Object],
    default: undefined,
  },
  viewportTag: {
    type: String,
    default: 'div',
  },
  viewportStyle: {
    type: [String, Array, Object],
    default: undefined,
  },
  scrollbarVisibility: {
    type: String,
    default: 'auto',
    validator: (value) => ['auto', 'hidden'].includes(value),
  },
});

const attrs = useAttrs();
const rootRef = useTemplateRef('root');
const viewportRef = useTemplateRef('viewport');
const verticalRailRef = useTemplateRef('verticalRail');
const horizontalRailRef = useTemplateRef('horizontalRail');
const verticalThumbRef = useTemplateRef('verticalThumb');
const horizontalThumbRef = useTemplateRef('horizontalThumb');

const hiddenGeometry = () => ({
  visible: false,
  length: 0,
  offset: 0,
  maxScroll: 0,
  travel: 0,
});
const verticalGeometry = shallowRef(hiddenGeometry());
const horizontalGeometry = shallowRef(hiddenGeometry());
const draggingAxis = shallowRef('');

const rootAttrs = computed(() =>
  Object.fromEntries(
    Object.entries(attrs).filter(
      ([name]) =>
        name === 'class' || name === 'style' || name.startsWith('data-'),
    ),
  ),
);
const viewportAttrs = computed(() =>
  Object.fromEntries(
    Object.entries(attrs).filter(
      ([name]) =>
        name !== 'class' && name !== 'style' && !name.startsWith('data-'),
    ),
  ),
);
const verticalThumbStyle = computed(() => ({
  '--ui-scrollbar-thumb-length': `${verticalGeometry.value.length}px`,
  '--ui-scrollbar-thumb-offset': `${verticalGeometry.value.offset}px`,
}));
const horizontalThumbStyle = computed(() => ({
  '--ui-scrollbar-thumb-length': `${horizontalGeometry.value.length}px`,
  '--ui-scrollbar-thumb-offset': `${horizontalGeometry.value.offset}px`,
}));

let resizeObserver;
let mutationObserver;
let frameId = 0;
let dragState;

function cancelScheduledMeasure() {
  if (frameId && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(frameId);
  }
  frameId = 0;
}

function resolvedMinThumbSize(axis) {
  const thumb =
    axis === 'vertical' ? verticalThumbRef.value : horizontalThumbRef.value;
  if (!thumb || typeof getComputedStyle !== 'function') return 32;

  const styles = getComputedStyle(thumb);
  const value = Number.parseFloat(
    axis === 'vertical' ? styles.minBlockSize : styles.minInlineSize,
  );
  return Number.isFinite(value) ? value : 32;
}

function resolvedMaxThumbSize(axis) {
  const thumb =
    axis === 'vertical' ? verticalThumbRef.value : horizontalThumbRef.value;
  if (!thumb || typeof getComputedStyle !== 'function') return 72;

  const styles = getComputedStyle(thumb);
  const value = Number.parseFloat(
    axis === 'vertical' ? styles.maxBlockSize : styles.maxInlineSize,
  );
  return Number.isFinite(value) ? value : 72;
}

function measure() {
  frameId = 0;
  const viewport = viewportRef.value;
  if (!viewport) return;

  const verticalTrackSize =
    verticalRailRef.value?.clientHeight ?? viewport.clientHeight;
  const horizontalTrackSize =
    horizontalRailRef.value?.clientWidth ?? viewport.clientWidth;

  verticalGeometry.value =
    props.axis === 'horizontal'
      ? hiddenGeometry()
      : getOverlayThumbGeometry({
          viewportSize: viewport.clientHeight,
          contentSize: viewport.scrollHeight,
          scrollOffset: viewport.scrollTop,
          trackSize: verticalTrackSize,
          minThumbSize: resolvedMinThumbSize('vertical'),
          maxThumbSize: resolvedMaxThumbSize('vertical'),
        });
  horizontalGeometry.value =
    props.axis === 'vertical'
      ? hiddenGeometry()
      : getOverlayThumbGeometry({
          viewportSize: viewport.clientWidth,
          contentSize: viewport.scrollWidth,
          scrollOffset: Math.abs(viewport.scrollLeft),
          trackSize: horizontalTrackSize,
          minThumbSize: resolvedMinThumbSize('horizontal'),
          maxThumbSize: resolvedMaxThumbSize('horizontal'),
        });
}

function scheduleMeasure() {
  cancelScheduledMeasure();
  if (typeof requestAnimationFrame === 'function') {
    frameId = requestAnimationFrame(measure);
    return;
  }
  measure();
}

function refreshObservedContent() {
  const viewport = viewportRef.value;
  if (!resizeObserver || !viewport) {
    scheduleMeasure();
    return;
  }

  resizeObserver.disconnect();
  resizeObserver.observe(viewport);
  for (const child of viewport.children) resizeObserver.observe(child);
  scheduleMeasure();
}

function geometryFor(axis) {
  return axis === 'vertical'
    ? verticalGeometry.value
    : horizontalGeometry.value;
}

function pointerCoordinate(axis, event) {
  return axis === 'vertical' ? event.clientY : event.clientX;
}

function startThumbDrag(axis, event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const viewport = viewportRef.value;
  const geometry = geometryFor(axis);
  if (!viewport || !geometry.visible) return;

  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  draggingAxis.value = axis;
  dragState = {
    axis,
    pointerId: event.pointerId,
    pointerStart: pointerCoordinate(axis, event),
    scrollStart:
      axis === 'vertical' ? viewport.scrollTop : Math.abs(viewport.scrollLeft),
    maxScroll: geometry.maxScroll,
    travel: geometry.travel,
  };
}

function moveThumbDrag(axis, event) {
  const viewport = viewportRef.value;
  if (
    !viewport ||
    !dragState ||
    dragState.axis !== axis ||
    dragState.pointerId !== event.pointerId
  ) {
    return;
  }

  event.preventDefault();
  const nextOffset = getScrollOffsetFromThumbDelta({
    startScrollOffset: dragState.scrollStart,
    delta: pointerCoordinate(axis, event) - dragState.pointerStart,
    maxScroll: dragState.maxScroll,
    travel: dragState.travel,
  });

  if (axis === 'vertical') viewport.scrollTop = nextOffset;
  else viewport.scrollLeft = nextOffset;
  scheduleMeasure();
}

function endThumbDrag(axis, event) {
  if (
    !dragState ||
    dragState.axis !== axis ||
    dragState.pointerId !== event.pointerId
  ) {
    return;
  }

  event.currentTarget.releasePointerCapture?.(event.pointerId);
  dragState = undefined;
  draggingAxis.value = '';
  scheduleMeasure();
}

function jumpFromTrack(axis, event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  const viewport = viewportRef.value;
  const geometry = geometryFor(axis);
  if (!viewport || !geometry.visible) return;

  const rect = event.currentTarget.getBoundingClientRect();
  const trackStart = axis === 'vertical' ? rect.top : rect.left;
  const pointer = pointerCoordinate(axis, event);
  const targetThumbOffset = Math.min(
    geometry.travel,
    Math.max(0, pointer - trackStart - geometry.length / 2),
  );
  const targetScroll =
    geometry.travel > 0
      ? (targetThumbOffset / geometry.travel) * geometry.maxScroll
      : 0;

  if (axis === 'vertical') viewport.scrollTop = targetScroll;
  else viewport.scrollLeft = targetScroll;
  scheduleMeasure();
}

function scrollTo(...args) {
  viewportRef.value?.scrollTo(...args);
}

defineExpose({ root: rootRef, viewport: viewportRef, scrollTo });

onMounted(() => {
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(scheduleMeasure);
  }
  if (typeof MutationObserver === 'function' && viewportRef.value) {
    mutationObserver = new MutationObserver(refreshObservedContent);
    mutationObserver.observe(viewportRef.value, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  refreshObservedContent();
  if (typeof document !== 'undefined') {
    document.fonts?.ready?.then(scheduleMeasure);
  }
});

onUnmounted(() => {
  cancelScheduledMeasure();
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
});

watch(
  () => [props.axis, props.scrollbarVisibility],
  async () => {
    await nextTick();
    refreshObservedContent();
  },
);
</script>

<template>
  <div
    ref="root"
    v-bind="rootAttrs"
    class="ui-scroll-region"
    :data-scroll-axis="props.axis"
    :data-overflow-x="horizontalGeometry.visible ? 'true' : 'false'"
    :data-overflow-y="verticalGeometry.visible ? 'true' : 'false'"
  >
    <component
      :is="props.viewportTag"
      ref="viewport"
      v-bind="viewportAttrs"
      :class="[props.viewportClass, 'ui-scroll-region__viewport']"
      :style="props.viewportStyle"
      @scroll="scheduleMeasure"
    >
      <slot />
    </component>

    <div
      v-if="props.scrollbarVisibility !== 'hidden'"
      ref="verticalRail"
      class="ui-scroll-region__rail ui-scroll-region__rail--vertical"
      aria-hidden="true"
      @pointerdown.self="jumpFromTrack('vertical', $event)"
    >
      <span
        ref="verticalThumb"
        class="ui-scroll-region__thumb"
        :data-dragging="draggingAxis === 'vertical' ? 'true' : 'false'"
        :style="verticalThumbStyle"
        @pointerdown="startThumbDrag('vertical', $event)"
        @pointermove="moveThumbDrag('vertical', $event)"
        @pointerup="endThumbDrag('vertical', $event)"
        @pointercancel="endThumbDrag('vertical', $event)"
        @lostpointercapture="endThumbDrag('vertical', $event)"
      />
    </div>

    <div
      v-if="props.scrollbarVisibility !== 'hidden'"
      ref="horizontalRail"
      class="ui-scroll-region__rail ui-scroll-region__rail--horizontal"
      aria-hidden="true"
      @pointerdown.self="jumpFromTrack('horizontal', $event)"
    >
      <span
        ref="horizontalThumb"
        class="ui-scroll-region__thumb"
        :data-dragging="draggingAxis === 'horizontal' ? 'true' : 'false'"
        :style="horizontalThumbStyle"
        @pointerdown="startThumbDrag('horizontal', $event)"
        @pointermove="moveThumbDrag('horizontal', $event)"
        @pointerup="endThumbDrag('horizontal', $event)"
        @pointercancel="endThumbDrag('horizontal', $event)"
        @lostpointercapture="endThumbDrag('horizontal', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.ui-scroll-region {
  position: relative;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: clip;
  isolation: isolate;
}

.ui-scroll-region__viewport {
  min-inline-size: 0;
  min-block-size: 0;
  inline-size: 100%;
  block-size: 100%;
  box-sizing: border-box;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.ui-scroll-region__viewport::-webkit-scrollbar {
  display: none;
  inline-size: 0;
  block-size: 0;
}

[data-scroll-axis='vertical'] > .ui-scroll-region__viewport {
  overflow-x: hidden;
  overflow-y: auto;
}

[data-scroll-axis='horizontal'] > .ui-scroll-region__viewport {
  overflow-x: auto;
  overflow-y: hidden;
}

[data-scroll-axis='both'] > .ui-scroll-region__viewport {
  overflow: auto;
}

.ui-scroll-region__viewport:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: calc(var(--ui-focus-width) * -1);
}

.ui-scroll-region__rail {
  position: absolute;
  z-index: 1;
  border-radius: var(--ui-scrollbar-radius);
  background: var(--ui-scrollbar-track);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.ui-scroll-region__rail--vertical {
  inset-block: var(--ui-scrollbar-edge-inset);
  inset-inline-end: 0;
  inline-size: var(--ui-scrollbar-lane-size);
}

.ui-scroll-region__rail--horizontal {
  inset-inline: var(--ui-scrollbar-edge-inset);
  inset-block-end: 0;
  block-size: var(--ui-scrollbar-lane-size);
}

.ui-scroll-region[data-overflow-x='true'][data-overflow-y='true']
  > .ui-scroll-region__rail--vertical {
  inset-block-end: calc(
    var(--ui-scrollbar-edge-inset) + var(--ui-scrollbar-lane-size)
  );
}

.ui-scroll-region[data-overflow-x='true'][data-overflow-y='true']
  > .ui-scroll-region__rail--horizontal {
  inset-inline-end: calc(
    var(--ui-scrollbar-edge-inset) + var(--ui-scrollbar-lane-size)
  );
}

.ui-scroll-region[data-overflow-y='true'] > .ui-scroll-region__rail--vertical,
.ui-scroll-region[data-overflow-x='true']
  > .ui-scroll-region__rail--horizontal {
  opacity: 1;
  pointer-events: auto;
}

.ui-scroll-region__thumb {
  position: absolute;
  border-radius: var(--ui-scrollbar-radius);
  background: var(--ui-scrollbar-thumb);
  cursor: grab;
  touch-action: none;
  transition: background-color var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.ui-scroll-region__rail--vertical > .ui-scroll-region__thumb {
  inset-block-start: 0;
  inset-inline: var(--ui-scrollbar-thumb-inset);
  min-block-size: var(--ui-scrollbar-thumb-min-length);
  max-block-size: var(--ui-scrollbar-thumb-max-length);
  block-size: var(--ui-scrollbar-thumb-length);
  transform: translateY(var(--ui-scrollbar-thumb-offset));
}

.ui-scroll-region__rail--horizontal > .ui-scroll-region__thumb {
  inset-block: var(--ui-scrollbar-thumb-inset);
  inset-inline-start: 0;
  min-inline-size: var(--ui-scrollbar-thumb-min-length);
  max-inline-size: var(--ui-scrollbar-thumb-max-length);
  inline-size: var(--ui-scrollbar-thumb-length);
  transform: translateX(var(--ui-scrollbar-thumb-offset));
}

.ui-scroll-region__thumb:hover {
  background: var(--ui-scrollbar-thumb-hover);
}

.ui-scroll-region__thumb[data-dragging='true'] {
  background: var(--ui-scrollbar-thumb-active);
  cursor: grabbing;
}

@media (prefers-reduced-motion: reduce) {
  .ui-scroll-region__rail,
  .ui-scroll-region__thumb {
    transition: none;
  }
}

@media (forced-colors: active) {
  .ui-scroll-region__rail,
  .ui-scroll-region__thumb {
    forced-color-adjust: none;
  }

  .ui-scroll-region__rail {
    background: transparent;
  }

  .ui-scroll-region__thumb,
  .ui-scroll-region__thumb:hover,
  .ui-scroll-region__thumb[data-dragging='true'] {
    outline: var(--ui-border-width) solid Canvas;
    outline-offset: calc(var(--ui-border-width) * -1);
    background: CanvasText;
  }
}
</style>
