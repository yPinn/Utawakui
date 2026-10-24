<script setup>
import { computed, shallowRef } from 'vue';
import { hitTestElementBoxes } from '../../../shared/outputElementMessage.mjs';

const props = defineProps({
  boxes: { type: Object, required: true },
  scale: { type: Number, required: true },
  selectedId: { type: String, default: 'template' },
});

const emit = defineEmits(['select']);
const hoveredId = shallowRef('template');

function boxStyle(box) {
  return {
    left: `${box.x * props.scale}px`,
    top: `${box.y * props.scale}px`,
    width: `${box.width * props.scale}px`,
    height: `${box.height * props.scale}px`,
  };
}

const outlines = computed(() =>
  props.boxes.elements
    .filter(({ id }) => id === props.selectedId || id === hoveredId.value)
    .map((box) => ({
      id: box.id,
      selected: box.id === props.selectedId,
      style: boxStyle(box),
    })),
);

function capturePoint(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / props.scale,
    y: (event.clientY - rect.top) / props.scale,
  };
}

function updateHover(event) {
  hoveredId.value = hitTestElementBoxes(
    props.boxes.elements,
    capturePoint(event),
  );
}

function select(event) {
  emit(
    'select',
    hitTestElementBoxes(props.boxes.elements, capturePoint(event)),
  );
}
</script>

<template>
  <!-- Pointer shortcut only; the 調整對象 select is the accessible path. -->
  <span
    class="obs-element-selection-layer"
    aria-hidden="true"
    :data-hovered="hoveredId !== 'template' ? hoveredId : undefined"
    @pointermove="updateHover"
    @pointerleave="hoveredId = 'template'"
    @click="select"
  >
    <span
      v-for="outline in outlines"
      :key="outline.id"
      class="obs-element-selection-layer__outline"
      :class="{
        'obs-element-selection-layer__outline--selected': outline.selected,
      }"
      :data-element-id="outline.id"
      :style="outline.style"
    />
  </span>
</template>

<style scoped>
.obs-element-selection-layer {
  position: absolute;
  inset: 0;
  display: block;
  cursor: default;
}

.obs-element-selection-layer[data-hovered] {
  cursor: pointer;
}

.obs-element-selection-layer__outline {
  position: absolute;
  display: block;
  outline: var(--ui-border-width) dashed var(--ui-color-accent);
  pointer-events: none;
}

.obs-element-selection-layer__outline--selected {
  outline: var(--ui-focus-width) solid var(--ui-color-accent);
}
</style>
