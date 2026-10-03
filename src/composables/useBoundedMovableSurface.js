import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  toValue,
  watch,
} from 'vue';
import {
  clampBoundedSurfacePosition,
  moveBoundedSurfaceFromKeyboard,
} from '../utils/boundedSurfaceGeometry.js';

const DRAG_ACTIVATION_THRESHOLD = 5;

function resolveElement(elementRef) {
  const value = toValue(elementRef);
  return value?.$el ?? value ?? null;
}

function elementSize(element) {
  const rect = element?.getBoundingClientRect?.();
  return {
    width: element?.offsetWidth ?? rect?.width ?? 0,
    height: element?.offsetHeight ?? rect?.height ?? 0,
  };
}

export function useBoundedMovableSurface({
  elementRef,
  pinned,
  minimumVisibleSize = 48,
} = {}) {
  const offsetX = shallowRef(0);
  const offsetY = shallowRef(0);
  const isDragging = shallowRef(false);
  let dragSession = null;
  let resizeObserver = null;
  let reclampFrame = null;
  let mounted = false;

  const surfaceStyle = computed(() => ({
    '--ui-bounded-surface-x': `${offsetX.value}px`,
    '--ui-bounded-surface-y': `${offsetY.value}px`,
  }));

  function getPlacement() {
    const element = resolveElement(elementRef);
    const container = element?.parentElement;
    const rect = element?.getBoundingClientRect?.();
    const containerRect = container?.getBoundingClientRect?.();
    if (!element || !container || !rect || !containerRect) return null;
    return {
      element,
      container,
      position: {
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
      },
      itemSize: elementSize(element),
      containerSize: elementSize(container),
    };
  }

  function applyPosition(nextPosition, placement = getPlacement()) {
    if (!placement) return;
    const bounded = clampBoundedSurfacePosition(
      nextPosition,
      placement.itemSize,
      placement.containerSize,
      minimumVisibleSize,
    );
    offsetX.value += bounded.x - placement.position.x;
    offsetY.value += bounded.y - placement.position.y;
  }

  function reclamp() {
    const placement = getPlacement();
    if (placement) applyPosition(placement.position, placement);
  }

  function scheduleReclamp() {
    if (reclampFrame !== null) return;
    const run = () => {
      reclampFrame = null;
      reclamp();
    };
    if (typeof requestAnimationFrame === 'function') {
      reclampFrame = requestAnimationFrame(run);
    } else {
      run();
    }
  }

  function beginDrag(event) {
    if (toValue(pinned)) return;
    if (event.button !== undefined && event.button !== 0) return;
    const placement = getPlacement();
    if (!placement) return;
    event.preventDefault?.();
    event.currentTarget?.focus?.();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    dragSession = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: placement.position,
      startOffsetX: offsetX.value,
      startOffsetY: offsetY.value,
      itemSize: placement.itemSize,
      containerSize: placement.containerSize,
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
    isDragging.value = true;
    const bounded = clampBoundedSurfacePosition(
      {
        x: dragSession.startPosition.x + deltaX,
        y: dragSession.startPosition.y + deltaY,
      },
      dragSession.itemSize,
      dragSession.containerSize,
      minimumVisibleSize,
    );
    offsetX.value =
      dragSession.startOffsetX + bounded.x - dragSession.startPosition.x;
    offsetY.value =
      dragSession.startOffsetY + bounded.y - dragSession.startPosition.y;
  }

  function finishDrag(event) {
    if (!dragSession || event?.pointerId !== dragSession.pointerId) return;
    event.currentTarget?.releasePointerCapture?.(event.pointerId);
    dragSession = null;
    isDragging.value = false;
  }

  function cancelDrag() {
    dragSession = null;
    isDragging.value = false;
  }

  function handleMoveKeydown(event) {
    if (event.target !== event.currentTarget) return;
    if (toValue(pinned)) return;
    if (event.key === 'Home') {
      event.preventDefault();
      offsetX.value = 0;
      offsetY.value = 0;
      void nextTick(reclamp);
      return;
    }
    const placement = getPlacement();
    if (!placement) return;
    const nextPosition = moveBoundedSurfaceFromKeyboard(
      placement.position,
      event.key,
      event.shiftKey,
      {
        itemSize: placement.itemSize,
        containerSize: placement.containerSize,
        minimumVisibleSize,
      },
    );
    if (!nextPosition) return;
    event.preventDefault();
    applyPosition(nextPosition, placement);
  }

  function observeCurrentElement() {
    resizeObserver?.disconnect();
    const element = resolveElement(elementRef);
    if (!element) return;
    resizeObserver?.observe(element);
    if (element.parentElement) resizeObserver?.observe(element.parentElement);
    void nextTick(reclamp);
  }

  watch(
    () => toValue(elementRef),
    () => {
      if (mounted) void nextTick(observeCurrentElement);
    },
  );

  watch(
    () => toValue(pinned),
    (isPinned) => {
      if (isPinned) cancelDrag();
    },
  );

  onMounted(() => {
    mounted = true;
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(scheduleReclamp);
    }
    observeCurrentElement();
  });

  onBeforeUnmount(() => {
    mounted = false;
    resizeObserver?.disconnect();
    if (reclampFrame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(reclampFrame);
    }
  });

  return {
    surfaceStyle,
    isDragging,
    beginDrag,
    moveDrag,
    endDrag: finishDrag,
    cancelDrag,
    handleMoveKeydown,
    reclamp,
  };
}
