<script setup>
import { computed, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue';
import {
  dragPerformerGuide,
  isPerformerGuideSizeLocked,
  performerGuideStyle,
  snapPerformerGuide,
} from '../../utils/outputPerformerGuide.js';

const props = defineProps({
  guide: { type: Object, required: true },
});
const emit = defineEmits(['preview', 'commit']);
const layer = useTemplateRef('layer');
const noMatches = { x: null, y: null };
const activeMatches = shallowRef(noMatches);
const selectionStyle = computed(() => performerGuideStyle(props.guide));
const handles = [
  { id: 'nw', axis: [-1, -1] },
  { id: 'n', axis: [0, -1] },
  { id: 'ne', axis: [1, -1] },
  { id: 'e', axis: [1, 0] },
  { id: 'se', axis: [1, 1] },
  { id: 's', axis: [0, 1] },
  { id: 'sw', axis: [-1, 1] },
  { id: 'w', axis: [-1, 0] },
];
const visibleHandles = computed(() =>
  isPerformerGuideSizeLocked(props.guide.shape)
    ? handles.filter(
        ({ axis: [horizontal, vertical] }) => horizontal && vertical,
      )
    : handles,
);
let gesture = null;

function start(event, axis) {
  if (gesture || event.button !== 0) return;
  const { width, height } = layer.value.getBoundingClientRect();
  if (!width || !height) return;
  event.preventDefault();
  layer.value.setPointerCapture(event.pointerId);
  gesture = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    width,
    height,
    guide: props.guide,
    axis,
  };
}

function guideAtPointer(event) {
  const { guide, axis, width, height, x, y } = gesture;
  if (event.clientX === x && event.clientY === y) {
    activeMatches.value = noMatches;
    return guide;
  }
  const next = dragPerformerGuide(
    guide,
    axis,
    { x: (event.clientX - x) / width, y: (event.clientY - y) / height },
    width / height,
  );
  if (event.altKey) {
    activeMatches.value = noMatches;
    return next;
  }
  const aligned = snapPerformerGuide(
    next,
    axis,
    { width, height },
    activeMatches.value,
  );
  activeMatches.value = aligned.matches;
  return aligned.guide;
}

function move(event) {
  if (event.pointerId === gesture?.id) emit('preview', guideAtPointer(event));
}

function stop(event) {
  if (event.pointerId !== gesture?.id) return;
  const finalGuide = guideAtPointer(event);
  const startGuide = gesture.guide;
  gesture = null;
  activeMatches.value = noMatches;
  if (
    Object.keys(finalGuide).some((key) => finalGuide[key] !== startGuide[key])
  ) {
    emit('commit', finalGuide);
  } else {
    emit('preview', null);
  }
}

function cancel(event) {
  if (!gesture || (event && event.pointerId !== gesture.id)) return;
  gesture = null;
  activeMatches.value = noMatches;
  emit('preview', null);
}

onBeforeUnmount(() => cancel());
</script>

<template>
  <div
    ref="layer"
    class="obs-performer-guide-selection"
    aria-hidden="true"
    @pointermove="move"
    @pointerup="stop"
    @pointercancel="cancel"
    @lostpointercapture="cancel"
  >
    <span
      v-if="activeMatches.x"
      class="obs-performer-guide-selection__alignment"
      data-performer-guide-line="x"
      :style="{ left: `${activeMatches.x.line * 100}%` }"
    />
    <span
      v-if="activeMatches.y"
      class="obs-performer-guide-selection__alignment"
      data-performer-guide-line="y"
      :style="{ top: `${activeMatches.y.line * 100}%` }"
    />
    <div class="obs-performer-guide-selection__box" :style="selectionStyle">
      <div
        class="obs-performer-guide-selection__outline"
        @pointerdown="start($event, [0, 0])"
      />
      <span
        v-for="{ id, axis } in visibleHandles"
        :key="id"
        class="obs-performer-guide-selection__handle"
        :data-performer-handle="id"
        :style="{
          left: `${50 * (1 + axis[0])}%`,
          top: `${50 * (1 + axis[1])}%`,
        }"
        @pointerdown="start($event, axis)"
      />
    </div>
  </div>
</template>

<style scoped>
.obs-performer-guide-selection {
  position: absolute;
  z-index: var(--ui-output-preview-layer-selection);
  inset: 0;
  pointer-events: none;
}

.obs-performer-guide-selection__box {
  position: absolute;
  transform: translate(-50%, -50%);
}

.obs-performer-guide-selection__alignment {
  position: absolute;
  background: var(--ui-output-preview-accent);
  box-shadow: 0 0 0 var(--ui-border-width)
    var(--ui-output-preview-accent-contrast);
}

[data-performer-guide-line='x'] {
  inset-block: 0;
  width: var(--ui-border-width);
  transform: translateX(-50%);
}

[data-performer-guide-line='y'] {
  inset-inline: 0;
  height: var(--ui-border-width);
  transform: translateY(-50%);
}

.obs-performer-guide-selection__outline {
  position: absolute;
  inset: 0;
  border: var(--ui-focus-width) solid var(--ui-color-focus);
  border-radius: inherit;
  box-shadow: 0 0 0 var(--ui-border-width) var(--ui-color-accent-contrast);
  pointer-events: auto;
  touch-action: none;
  cursor: move;
}

.obs-performer-guide-selection__handle {
  position: absolute;
  display: grid;
  place-items: center;
  inline-size: var(--ui-space-6);
  block-size: var(--ui-space-6);
  transform: translate(-50%, -50%);
  pointer-events: auto;
  touch-action: none;
}

.obs-performer-guide-selection__handle::before {
  content: '';
  inline-size: var(--ui-space-2);
  block-size: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-accent-contrast);
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-focus);
}

[data-performer-handle='nw'],
[data-performer-handle='se'] {
  cursor: nwse-resize;
}

[data-performer-handle='ne'],
[data-performer-handle='sw'] {
  cursor: nesw-resize;
}

[data-performer-handle='e'],
[data-performer-handle='w'] {
  cursor: ew-resize;
}

[data-performer-handle='n'],
[data-performer-handle='s'] {
  cursor: ns-resize;
}
</style>
