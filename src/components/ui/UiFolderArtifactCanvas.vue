<script setup>
import { t } from '../../utils/i18n.js';
import {
  computed,
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
  folderArtifactFitsSideRegion,
  getFolderArtifactPlacement,
  moveFolderArtifactFromKeyboard,
  projectFolderArtifactPlacement,
} from '../../utils/folderArtifactGeometry.js';
import { Pin } from '../../icons/index.js';
import UiIconButton from './UiIconButton.vue';

const props = defineProps({
  artifacts: { type: Array, default: () => [] },
  label: { type: String, default: () => t('ui.artifactCanvas.label') },
  minimumVisibleSize: { type: Number, default: 48 },
  material: {
    type: String,
    default: 'document',
    validator: (value) => ['document', 'folder'].includes(value),
  },
});

const emit = defineEmits([
  'layoutChange',
  'pinChange',
  'stackChange',
  'activate',
  'contextmenu',
]);

const clampBounds = shallowRef(null);
const pinInsetMeasure = shallowRef(null);
const itemElements = new Map();
const placements = new Map();
const pendingAutoPlacements = new Set();
const positions = reactive({});
// Active paint sits one above the finite rebased order, never a fixed cap.
const activeLayer = computed(
  () =>
    Math.max(
      props.artifacts.length,
      ...Object.values(positions).map((position) => position.z),
    ) + 1,
);
const pinnedArtifactIds = reactive(new Set());
const activeArtifactId = shallowRef(null);
const instructionId = `folder-artifact-instructions-${useId()}`;
const isReady = ref(false);
let dragSession = null;
let resizeObserver = null;
let reclampFrame = null;
const DRAG_ACTIVATION_THRESHOLD = 5;

function copyPlacement(placement) {
  return {
    region: placement?.region ?? 'paper',
    anchor: { x: placement?.anchor?.x ?? 0, y: placement?.anchor?.y ?? 0 },
  };
}

function declaredPlacement(artifact) {
  return copyPlacement(artifact.initialPlacement);
}

function ensurePositions() {
  const activeIds = new Set(props.artifacts.map((artifact) => artifact.id));
  for (const id of Object.keys(positions)) {
    if (!activeIds.has(id)) {
      delete positions[id];
      placements.delete(id);
      pendingAutoPlacements.delete(id);
      pinnedArtifactIds.delete(id);
    }
  }
  props.artifacts.forEach((artifact, index) => {
    if (positions[artifact.id]) return;
    positions[artifact.id] = {
      x: 0,
      y: 0,
      z: artifact.initialZ ?? index + 1,
    };
    placements.set(artifact.id, declaredPlacement(artifact));
    if (artifact.autoPlace === true) pendingAutoPlacements.add(artifact.id);
    if (artifact.initialPinned === true) {
      pinnedArtifactIds.add(artifact.id);
    }
  });
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
  const previous = itemElements.get(id);
  if (previous === element) return;
  if (previous) resizeObserver?.unobserve(previous);
  if (element) itemElements.set(id, element);
  else itemElements.delete(id);
  if (element) resizeObserver?.observe(element);
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

function relativeRegion(element, canvasRect) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect || !canvasRect) return null;
  return {
    x: rect.left - canvasRect.left,
    y: rect.top - canvasRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function getFolderArtifactRegions() {
  const size = canvasSize();
  const fallback = {
    paper: { x: 0, y: 0, width: size.width, height: size.height },
    side: { x: size.width, y: 0, width: 0, height: size.height },
    bottom: { x: 0, y: size.height, width: size.width, height: 0 },
  };
  if (props.material !== 'folder' || !clampBounds.value) return fallback;
  const canvasRect = clampBounds.value.getBoundingClientRect?.();
  const canvasRoot = clampBounds.value.closest?.(
    '[data-folder-artifact-canvas]',
  );
  const workspace = canvasRoot?.parentElement?.parentElement;
  const paper = relativeRegion(
    workspace?.querySelector?.('[data-folder-artifact-region="paper"]'),
    canvasRect,
  );
  const bottom = relativeRegion(
    workspace?.querySelector?.('[data-folder-artifact-region="bottom"]'),
    canvasRect,
  );
  if (!paper || !bottom) return fallback;
  return {
    paper,
    side: {
      x: paper.x + paper.width,
      y: paper.y,
      width: Math.max(0, size.width - paper.x - paper.width),
      height: paper.height,
    },
    bottom,
  };
}

function placementRegionInset() {
  return elementSize(pinInsetMeasure.value).width;
}

function artifactRotation(id) {
  return props.artifacts.find((artifact) => artifact.id === id)?.rotation ?? 0;
}

function artifactGeometry(id) {
  return {
    itemSize: elementSize(itemElements.get(id)),
    canvasSize: canvasSize(),
    minimumVisibleSize: props.minimumVisibleSize,
    rotation: artifactRotation(id),
    regions: getFolderArtifactRegions(),
    regionInset: placementRegionInset(),
  };
}

// Side objects fall back to the bottom together when any of them cannot fit.
function sideProjectionContext(id) {
  const sideIds = Object.keys(positions)
    .filter((candidateId) => placements.get(candidateId)?.region === 'side')
    .sort((left, right) => positions[left].z - positions[right].z);
  const sideAvailable = sideIds.every((candidateId) =>
    folderArtifactFitsSideRegion(artifactGeometry(candidateId)),
  );
  return {
    sideAvailable,
    fallbackIndex: Math.max(0, sideIds.indexOf(id)),
    fallbackCount: Math.max(1, sideIds.length),
  };
}

function projectPlacedPosition(id) {
  return projectFolderArtifactPlacement(placements.get(id), {
    ...artifactGeometry(id),
    ...sideProjectionContext(id),
  }).position;
}

function reprojectArtifacts({ except = null } = {}) {
  props.artifacts.forEach((artifact) => {
    if (artifact.id === except || !positions[artifact.id]) return;
    applyPosition(artifact.id, projectPlacedPosition(artifact.id), {
      notify: false,
      updatePlacement: false,
    });
  });
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

function applyPosition(
  id,
  nextPosition,
  { notify = true, updatePlacement = true } = {},
) {
  const current = positions[id];
  if (!current) return;
  const bounded = clampPosition(id, nextPosition);
  current.x = bounded.x;
  current.y = bounded.y;
  if (updatePlacement) {
    placements.set(
      id,
      getFolderArtifactPlacement(bounded, artifactGeometry(id)),
    );
  }
  if (notify) {
    emit('layoutChange', {
      id,
      placement: copyPlacement(placements.get(id)),
      order: current.z,
      position: { x: bounded.x, y: bounded.y, z: current.z },
    });
  }
}

// Snap to the stored placement so a later resize never moves the object.
function settleArtifact(id) {
  applyPosition(id, projectPlacedPosition(id), {
    notify: false,
    updatePlacement: false,
  });
  reprojectArtifacts({ except: id });
}

function resetArtifact(id) {
  const artifact = props.artifacts.find((candidate) => candidate.id === id);
  if (!artifact || !positions[id]) return;
  placements.set(id, declaredPlacement(artifact));
  applyPosition(id, projectPlacedPosition(id), {
    notify: false,
    updatePlacement: false,
  });
}

// Steps a newly added object down-right from the topmost bottom-region object
// by the minimum grab size, so every earlier object keeps a grabbable edge.
function placeCascade(id) {
  const current = positions[id];
  if (!current) return;
  const regions = getFolderArtifactRegions();
  const ground = regions.bottom.height > 0 ? regions.bottom : regions.paper;
  const inset = placementRegionInset();
  const step = props.minimumVisibleSize;
  const size = elementSize(itemElements.get(id));
  const previousId = Object.keys(positions)
    .filter((candidateId) => candidateId !== id)
    .filter((candidateId) => placements.get(candidateId)?.region === 'bottom')
    .sort((left, right) => positions[right].z - positions[left].z)[0];
  let x = ground.x + inset;
  let y = ground.y + inset;
  if (previousId) {
    x = positions[previousId].x + step;
    y = positions[previousId].y + step;
  }
  if (y + size.height > ground.y + ground.height - inset) y = ground.y + inset;
  if (x + size.width > ground.x + ground.width - inset) x = ground.x + inset;
  applyPosition(id, { x, y });
  settleArtifact(id);
}

function reset() {
  ensurePositions();
  props.artifacts.forEach((artifact, index) => {
    if (positions[artifact.id]) {
      positions[artifact.id].z = artifact.initialZ ?? index + 1;
    }
  });
  props.artifacts.forEach((artifact) => resetArtifact(artifact.id));
  for (const id of pendingAutoPlacements) placeCascade(id);
  pendingAutoPlacements.clear();
  isReady.value = true;
}

function normalizeArtifactStack(frontId) {
  const orderedIds = Object.entries(positions)
    .sort(([, left], [, right]) => left.z - right.z)
    .map(([id]) => id)
    .filter((id) => id !== frontId);
  if (positions[frontId]) orderedIds.push(frontId);
  orderedIds.forEach((id, index) => {
    positions[id].z = index + 1;
  });
  return orderedIds;
}

function bringToFront(id) {
  if (!positions[id]) return;
  const previousOrder = positions[id].z;
  const orderedIds = normalizeArtifactStack(id);
  if (positions[id].z !== previousOrder) {
    emit('stackChange', { ids: orderedIds });
  }
}

function isArtifactPinned(id) {
  return pinnedArtifactIds.has(id);
}

function focusArtifact(id) {
  if (!isArtifactPinned(id)) bringToFront(id);
}

function togglePin(artifact) {
  const pinned = !isArtifactPinned(artifact.id);
  const current = positions[artifact.id];
  if (pinned) pinnedArtifactIds.add(artifact.id);
  else pinnedArtifactIds.delete(artifact.id);
  if (current) {
    // The visible pose wins, including a side object shown in its fallback.
    placements.set(
      artifact.id,
      getFolderArtifactPlacement(current, artifactGeometry(artifact.id)),
    );
    settleArtifact(artifact.id);
  }
  emit('pinChange', {
    id: artifact.id,
    pinned,
    placement: copyPlacement(placements.get(artifact.id)),
    order: current?.z,
    position: current
      ? { x: current.x, y: current.y, z: current.z }
      : undefined,
  });
}

// Text fields inside an artifact keep native selection, caret and keys.
function isEditableTarget(target) {
  return Boolean(
    target?.closest?.('textarea, input, select, [contenteditable="true"]'),
  );
}

function beginDrag(artifact, event) {
  if (event.button !== undefined && event.button !== 0) return;
  if (artifact.editing || isEditableTarget(event.target)) return;
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
  if (dragSession.moved && dragSession.draggable) {
    settleArtifact(dragSession.id);
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
  if (artifact.editing || isEditableTarget(event.target)) return;
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
  settleArtifact(artifact.id);
}

function togglePinById(id) {
  const artifact = props.artifacts.find((candidate) => candidate.id === id);
  if (artifact) togglePin(artifact);
}

// Keyboard-invoked menus carry no pointer position, so anchor to the item.
function openContextMenu(artifact, event) {
  if (artifact.editing || isEditableTarget(event.target)) return;
  event.preventDefault();
  const fromKeyboard = event.clientX === 0 && event.clientY === 0;
  emit('contextmenu', {
    id: artifact.id,
    anchor: fromKeyboard
      ? { kind: 'element', element: event.currentTarget }
      : { kind: 'point', x: event.clientX, y: event.clientY },
  });
}

function scheduleReclamp() {
  if (reclampFrame !== null) return;
  const run = () => {
    reclampFrame = null;
    reprojectArtifacts({ except: dragSession?.id ?? null });
  };
  if (typeof requestAnimationFrame === 'function') {
    reclampFrame = requestAnimationFrame(run);
  } else {
    run();
  }
}

function artifactLabel(artifact) {
  const pinned = isArtifactPinned(artifact.id);
  if (!artifact.activatable)
    return t(
      pinned ? 'ui.artifactCanvas.itemPinned' : 'ui.artifactCanvas.item',
      {
        label: artifact.label,
      },
    );
  return t(
    pinned
      ? 'ui.artifactCanvas.itemPinnedActivatable'
      : 'ui.artifactCanvas.itemActivatable',
    {
      label: artifact.label,
      action: artifact.activationLabel ?? t('ui.artifactCanvas.activate'),
    },
  );
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
    itemElements.forEach((element) => resizeObserver.observe(element));
    const canvasRoot = clampBounds.value?.closest?.(
      '[data-folder-artifact-canvas]',
    );
    const workspace = canvasRoot?.parentElement?.parentElement;
    workspace
      ?.querySelectorAll?.('[data-folder-artifact-region]')
      .forEach((region) => resizeObserver.observe(region));
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (reclampFrame !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(reclampFrame);
  }
});

defineExpose({ reset, togglePinById });
</script>

<template>
  <div
    data-folder-artifact-canvas
    class="ui-folder-artifact-canvas"
    :class="{
      'ui-folder-artifact-canvas--ready': isReady,
      'ui-folder-artifact-canvas--folder': props.material === 'folder',
    }"
    :style="{ '--ui-folder-artifact-z-active': activeLayer }"
    role="region"
    :aria-label="label"
  >
    <span
      ref="pinInsetMeasure"
      class="ui-folder-artifact-canvas__pin-inset-measure"
      aria-hidden="true"
    ></span>
    <div class="ui-folder-artifact-canvas__sheet" aria-hidden="true"></div>
    <p :id="instructionId" class="ui-visually-hidden">
      {{ t('ui.artifactCanvas.instructions') }}
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
        :aria-label="artifactLabel(artifact)"
        :aria-describedby="instructionId"
        @focus.self="focusArtifact(artifact.id)"
        @keydown="handleKeydown(artifact, $event)"
        @pointerdown="beginDrag(artifact, $event)"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="cancelDrag"
        @contextmenu="openContextMenu(artifact, $event)"
      >
        <slot :artifact="artifact"></slot>
        <UiIconButton
          class="ui-folder-artifact-canvas__pin"
          :icon="Pin"
          :label="
            t(
              isArtifactPinned(artifact.id)
                ? 'ui.artifactCanvas.unpinNamed'
                : 'ui.artifactCanvas.pinNamed',
              { label: artifact.label },
            )
          "
          :title="
            t(
              isArtifactPinned(artifact.id)
                ? 'ui.artifactCanvas.unpin'
                : 'ui.artifactCanvas.pin',
            )
          "
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
  background: var(--ui-folder-artifact-canvas-background);
}

.ui-folder-artifact-canvas__sheet {
  position: absolute;
  z-index: var(--ui-layer-base);
  inset: var(--ui-folder-artifact-sheet-inset-block)
    var(--ui-folder-artifact-sheet-inset-inline);
  border: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-folder-artifact-sheet-background);
}

.ui-folder-artifact-canvas__pin-inset-measure {
  position: absolute;
  inline-size: var(--ui-folder-artifact-pinned-region-inset);
  block-size: 0;
  visibility: hidden;
  pointer-events: none;
}

.ui-folder-artifact-canvas--folder {
  min-height: 0;
  block-size: 100%;
  overflow: visible;
  pointer-events: none;
  background: transparent;
}

.ui-folder-artifact-canvas--folder .ui-folder-artifact-canvas__sheet {
  display: none;
}

.ui-folder-artifact-canvas__bounds {
  position: absolute;
  inset: var(--ui-folder-artifact-safe-inset);
}

.ui-folder-artifact-canvas--folder .ui-folder-artifact-canvas__bounds {
  inset: 0;
}

.ui-folder-artifact-canvas__item {
  position: absolute;
  z-index: var(--ui-folder-artifact-z);
  inset: 0 auto auto 0;
  max-width: calc(100% - var(--ui-space-4));
  cursor: grab;
  pointer-events: auto;
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
  z-index: var(--ui-layer-raised);
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

@media (forced-colors: active) {
  .ui-folder-artifact-canvas__sheet,
  .ui-folder-artifact-canvas__item:focus-visible {
    border: var(--ui-border-width) solid CanvasText;
  }
}
</style>
