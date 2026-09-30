<script setup>
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  useId,
  watch,
} from 'vue';
import {
  clampFolderArtifactPosition,
  moveFolderArtifactFromKeyboard,
} from '../../utils/folderArtifactGeometry.js';
import { Pin } from '../../icons/index.js';
import UiIconButton from './UiIconButton.vue';

const props = defineProps({
  artifacts: { type: Array, default: () => [] },
  label: { type: String, default: '可移動物件' },
  minimumVisibleSize: { type: Number, default: 48 },
});

const emit = defineEmits(['layoutChange', 'pinChange', 'activate']);

const clampBounds = shallowRef(null);
const itemElements = new Map();
const positions = reactive({});
const pinnedArtifactIds = reactive(new Set());
const activeArtifactId = shallowRef(null);
const instructionId = `folder-artifact-instructions-${useId()}`;
const isReady = ref(false);
let highestZ = 0;
let dragSession = null;
let resizeObserver = null;
let reclampFrame = null;
const DRAG_ACTIVATION_THRESHOLD = 5;

function ensurePositions() {
  const activeIds = new Set(props.artifacts.map((artifact) => artifact.id));
  for (const id of Object.keys(positions)) {
    if (!activeIds.has(id)) {
      delete positions[id];
      pinnedArtifactIds.delete(id);
    }
  }
  props.artifacts.forEach((artifact, index) => {
    if (positions[artifact.id]) return;
    positions[artifact.id] = { x: 0, y: 0, z: index + 1 };
  });
  highestZ = Math.max(
    0,
    ...Object.values(positions).map((position) => position.z),
  );
}

ensurePositions();

watch(
  () => props.artifacts.map((artifact) => artifact.id).join('\0'),
  () => {
    ensurePositions();
    void nextTick(reset);
  },
);

function setItemElement(id, element) {
  if (element) itemElements.set(id, element);
  else itemElements.delete(id);
}

function elementSize(element) {
  const rect = element?.getBoundingClientRect?.();
  return {
    width: element?.offsetWidth ?? rect?.width ?? 0,
    height: element?.offsetHeight ?? rect?.height ?? 0,
  };
}

function canvasSize() {
  return elementSize(clampBounds.value);
}

function artifactRotation(id) {
  return props.artifacts.find((artifact) => artifact.id === id)?.rotation ?? 0;
}

function clampPosition(id, position) {
  return clampFolderArtifactPosition(
    position,
    elementSize(itemElements.get(id)),
    canvasSize(),
    props.minimumVisibleSize,
    artifactRotation(id),
  );
}

function applyPosition(id, nextPosition, notify = true) {
  const current = positions[id];
  if (!current) return;
  const bounded = clampPosition(id, nextPosition);
  current.x = bounded.x;
  current.y = bounded.y;
  if (notify) {
    emit('layoutChange', {
      id,
      position: { x: bounded.x, y: bounded.y, z: current.z },
    });
  }
}

function resetArtifact(id) {
  const artifact = props.artifacts.find((candidate) => candidate.id === id);
  const current = positions[id];
  if (!artifact || !current) return;
  const bounds = canvasSize();
  const item = elementSize(itemElements.get(id));
  const availableWidth = Math.max(0, bounds.width - item.width);
  const availableHeight = Math.max(0, bounds.height - item.height);
  applyPosition(id, {
    x: availableWidth * Math.min(1, Math.max(0, artifact.initialX ?? 0)),
    y: availableHeight * Math.min(1, Math.max(0, artifact.initialY ?? 0)),
  });
}

function reset() {
  ensurePositions();
  props.artifacts.forEach((artifact, index) => {
    if (positions[artifact.id]) positions[artifact.id].z = index + 1;
    resetArtifact(artifact.id);
  });
  highestZ = props.artifacts.length;
  isReady.value = true;
}

function bringToFront(id) {
  const current = positions[id];
  if (!current) return;
  highestZ += 1;
  current.z = highestZ;
}

function isArtifactPinned(id) {
  return pinnedArtifactIds.has(id);
}

function focusArtifact(id) {
  if (!isArtifactPinned(id)) bringToFront(id);
}

function togglePin(artifact) {
  const pinned = !isArtifactPinned(artifact.id);
  if (pinned) pinnedArtifactIds.add(artifact.id);
  else pinnedArtifactIds.delete(artifact.id);

  const current = positions[artifact.id];
  emit('pinChange', {
    id: artifact.id,
    pinned,
    position: current
      ? { x: current.x, y: current.y, z: current.z }
      : undefined,
  });
}

function beginDrag(artifact, event) {
  if (event.button !== undefined && event.button !== 0) return;
  const draggable = !isArtifactPinned(artifact.id);
  const activatable = artifact.activatable === true;
  const activationTarget = event.target?.closest?.('[data-artifact-activate]');
  const activationIntent = activationTarget?.dataset.artifactActivate;
  if (!draggable && !activatable) return;
  event.preventDefault?.();
  const target = event.currentTarget;
  const current = positions[artifact.id];
  if (!target || !current) return;

  if (draggable) bringToFront(artifact.id);
  target.setPointerCapture?.(event.pointerId);
  dragSession = {
    id: artifact.id,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: current.x,
    startY: current.y,
    draggable,
    activatable,
    activationIntent,
    moved: false,
  };
}

function moveDrag(event) {
  if (!dragSession || event.pointerId !== dragSession.pointerId) return;
  const deltaX = event.clientX - dragSession.startClientX;
  const deltaY = event.clientY - dragSession.startClientY;
  if (
    !dragSession.moved &&
    Math.hypot(deltaX, deltaY) < DRAG_ACTIVATION_THRESHOLD
  ) {
    return;
  }
  dragSession.moved = true;
  if (!dragSession.draggable) return;
  activeArtifactId.value = dragSession.id;
  applyPosition(dragSession.id, {
    x: dragSession.startX + deltaX,
    y: dragSession.startY + deltaY,
  });
}

function finishDrag(event, shouldActivate) {
  if (!dragSession || event.pointerId !== dragSession.pointerId) return;
  if (shouldActivate && !dragSession.moved && dragSession.activatable) {
    emit('activate', dragSession.id, dragSession.activationIntent);
  }
  event.currentTarget?.releasePointerCapture?.(event.pointerId);
  dragSession = null;
  activeArtifactId.value = null;
}

function endDrag(event) {
  finishDrag(event, true);
}

function cancelDrag(event) {
  finishDrag(event, false);
}

function handleKeydown(artifact, event) {
  if (artifact.activatable && ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    emit('activate', artifact.id);
    return;
  }
  if (isArtifactPinned(artifact.id)) return;
  if (event.key === 'Home') {
    event.preventDefault();
    bringToFront(artifact.id);
    resetArtifact(artifact.id);
    return;
  }

  const current = positions[artifact.id];
  if (!current) return;
  const nextPosition = moveFolderArtifactFromKeyboard(
    current,
    event.key,
    event.shiftKey,
    {
      itemSize: elementSize(itemElements.get(artifact.id)),
      canvasSize: canvasSize(),
      minimumVisibleSize: props.minimumVisibleSize,
      rotation: artifact.rotation ?? 0,
    },
  );
  if (!nextPosition) return;
  event.preventDefault();
  bringToFront(artifact.id);
  applyPosition(artifact.id, nextPosition);
}

function scheduleReclamp() {
  if (reclampFrame !== null) return;
  const run = () => {
    reclampFrame = null;
    props.artifacts.forEach((artifact) => {
      const current = positions[artifact.id];
      if (current) applyPosition(artifact.id, current, false);
    });
  };
  if (typeof requestAnimationFrame === 'function') {
    reclampFrame = requestAnimationFrame(run);
  } else {
    run();
  }
}

function itemStyle(artifact) {
  const position = positions[artifact.id] ?? { x: 0, y: 0, z: 1 };
  return {
    '--ui-folder-artifact-x': `${position.x}px`,
    '--ui-folder-artifact-y': `${position.y}px`,
    '--ui-folder-artifact-rotation': `${artifact.rotation ?? 0}deg`,
    '--ui-folder-artifact-z': position.z,
  };
}

onMounted(async () => {
  await nextTick();
  reset();
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(scheduleReclamp);
    if (clampBounds.value) resizeObserver.observe(clampBounds.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (reclampFrame !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(reclampFrame);
  }
});

defineExpose({ reset });
</script>

<template>
  <div
    class="ui-folder-artifact-canvas"
    :class="{ 'ui-folder-artifact-canvas--ready': isReady }"
    role="region"
    :aria-label="label"
  >
    <div class="ui-folder-artifact-canvas__sheet" aria-hidden="true"></div>
    <p :id="instructionId" class="ui-visually-hidden">
      未固定時可用方向鍵移動，Shift 加速，Home 回到預設位置
    </p>
    <div ref="clampBounds" class="ui-folder-artifact-canvas__bounds">
      <div
        v-for="artifact in artifacts"
        :key="artifact.id"
        :ref="(element) => setItemElement(artifact.id, element)"
        class="ui-folder-artifact-canvas__item"
        :class="{
          'ui-folder-artifact-canvas__item--active':
            activeArtifactId === artifact.id,
          'ui-folder-artifact-canvas__item--pinned': isArtifactPinned(
            artifact.id,
          ),
          'ui-folder-artifact-canvas__item--activatable': artifact.activatable,
        }"
        :style="itemStyle(artifact)"
        role="group"
        tabindex="0"
        :aria-label="`${artifact.label}${
          isArtifactPinned(artifact.id) ? '，已固定' : ''
        }${
          artifact.activatable
            ? `，按 Enter 或空白鍵${artifact.activationLabel ?? '啟用'}`
            : ''
        }`"
        :aria-describedby="instructionId"
        @focus.self="focusArtifact(artifact.id)"
        @keydown="handleKeydown(artifact, $event)"
        @pointerdown="beginDrag(artifact, $event)"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="cancelDrag"
      >
        <slot :artifact="artifact"></slot>
        <UiIconButton
          class="ui-folder-artifact-canvas__pin"
          :icon="Pin"
          :label="
            isArtifactPinned(artifact.id)
              ? `取消固定${artifact.label}`
              : `固定${artifact.label}`
          "
          :title="isArtifactPinned(artifact.id) ? '取消固定' : '固定'"
          :active="isArtifactPinned(artifact.id)"
          :fill="isArtifactPinned(artifact.id)"
          :aria-pressed="isArtifactPinned(artifact.id)"
          :variant="artifact.kind === 'note' ? 'ghost' : 'overlay'"
          tooltip-placement="bottom"
          @keydown.stop
          @pointerdown.stop
          @click.stop="togglePin(artifact)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ui-folder-artifact-canvas {
  position: relative;
  isolation: isolate;
  min-width: 0;
  min-height: var(--ui-folder-artifact-canvas-min-height);
  overflow: hidden;
  border-radius: var(--ui-radius-xs);
  background: var(--ui-folder-artifact-canvas-bg);
}

.ui-folder-artifact-canvas__sheet {
  position: absolute;
  z-index: 0;
  inset: var(--ui-folder-artifact-sheet-inset-block)
    var(--ui-folder-artifact-sheet-inset-inline);
  border: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-folder-artifact-sheet-bg);
}

.ui-folder-artifact-canvas__bounds {
  position: absolute;
  inset: var(--ui-folder-artifact-safe-inset);
}

.ui-folder-artifact-canvas__item {
  position: absolute;
  z-index: var(--ui-folder-artifact-z);
  inset: 0 auto auto 0;
  max-width: calc(100% - var(--ui-space-4));
  cursor: grab;
  touch-action: none;
  visibility: hidden;
  transform: translate3d(
      var(--ui-folder-artifact-x),
      var(--ui-folder-artifact-y),
      0
    )
    rotate(var(--ui-folder-artifact-rotation));
  transform-origin: center;
  transition:
    filter var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard),
    scale var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard);
  will-change: transform;
}

.ui-folder-artifact-canvas--ready .ui-folder-artifact-canvas__item {
  visibility: visible;
}

.ui-folder-artifact-canvas__item--active {
  z-index: var(--ui-folder-artifact-z-active);
  cursor: grabbing;
  filter: drop-shadow(var(--ui-folder-artifact-drag-shadow));
  scale: var(--ui-folder-artifact-drag-scale);
}

.ui-folder-artifact-canvas__item--pinned {
  cursor: default;
  touch-action: auto;
}

.ui-folder-artifact-canvas__item--activatable {
  cursor: pointer;
}

.ui-folder-artifact-canvas__item--activatable.ui-folder-artifact-canvas__item--active {
  cursor: grabbing;
}

.ui-folder-artifact-canvas__item:hover
  :deep(.ui-folder-artifact__stack-position),
.ui-folder-artifact-canvas__item:focus-visible
  :deep(.ui-folder-artifact__stack-position) {
  opacity: 1;
}

.ui-folder-artifact-canvas__pin {
  position: absolute;
  z-index: 1;
  inset: var(--ui-space-2) var(--ui-space-2) auto auto;
  opacity: 0;
  pointer-events: none;
}

.ui-folder-artifact-canvas__item:hover .ui-folder-artifact-canvas__pin,
.ui-folder-artifact-canvas__item:focus-within .ui-folder-artifact-canvas__pin,
.ui-folder-artifact-canvas__item--pinned .ui-folder-artifact-canvas__pin {
  opacity: 1;
  pointer-events: auto;
}

.ui-folder-artifact-canvas__item:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

:global(:root[data-ui-motion='reduced']) .ui-folder-artifact-canvas__item {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .ui-folder-artifact-canvas__item {
    transition: none;
  }
}

@media (forced-colors: active) {
  .ui-folder-artifact-canvas__sheet,
  .ui-folder-artifact-canvas__item:focus-visible {
    border: var(--ui-border-width) solid CanvasText;
  }
}
</style>
