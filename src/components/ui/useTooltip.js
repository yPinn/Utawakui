import {
  computed,
  nextTick,
  onBeforeUnmount,
  shallowRef,
  toValue,
  useId,
  watch,
} from 'vue';
import {
  anchoredFloatingPosition,
  customLengthPixels,
} from './floatingPosition.js';

export const TOOLTIP_PLACEMENTS = ['bottom', 'end', 'start', 'top'];

export function isTooltipPlacement(value) {
  return TOOLTIP_PLACEMENTS.includes(value);
}

export function useTooltip(options) {
  const anchorRef = shallowRef(null);
  const tooltipRef = shallowRef(null);
  const tooltipId = `ui-tooltip-${useId()}`;
  const open = shallowRef(false);
  const position = shallowRef({ left: '0px', top: '0px' });

  const triggerProps = computed(() => ({
    ref: setAnchor,
    ...(toValue(options.describedBy) && canShow()
      ? { 'aria-describedby': tooltipId }
      : {}),
    onPointerenter: scheduleShow,
    onPointerleave: handlePointerleave,
    onFocusin: handleFocusin,
    onFocusout: handleFocusout,
    onKeydown: handleKeydown,
  }));

  let openTimer;
  let closeTimer;
  let viewportListenersAttached = false;
  let pointerInside = false;
  let keyboardFocused = false;

  function canShow() {
    return !toValue(options.disabled) && Boolean(toValue(options.text));
  }

  function setAnchor(value) {
    anchorRef.value = value?.$el ?? value;
  }

  function setTooltip(value) {
    tooltipRef.value = value?.$el ?? value;
  }

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
      placement: toValue(options.placement) ?? 'top',
      direction: window.getComputedStyle(anchorRef.value).direction,
      gap: customLengthPixels('--ui-floating-gap', 0.5),
      inset: customLengthPixels('--ui-floating-viewport-inset', 0.5),
    });
    position.value = { left: `${left}px`, top: `${top}px` };
  }

  function attachViewportListeners() {
    if (viewportListenersAttached || typeof window === 'undefined') return;
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    viewportListenersAttached = true;
  }

  function removeViewportListeners() {
    if (!viewportListenersAttached || typeof window === 'undefined') return;
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', updatePosition, true);
    viewportListenersAttached = false;
  }

  function show() {
    if (!canShow()) return;
    clearTimers();
    attachViewportListeners();
    open.value = true;
    nextTick(updatePosition);
  }

  function handleFocusin(event) {
    const focusTarget = event?.target ?? event?.currentTarget;
    if (
      typeof focusTarget?.matches === 'function' &&
      !focusTarget.matches(':focus-visible')
    ) {
      return;
    }
    keyboardFocused = true;
    show();
  }

  function scheduleShow(event) {
    if (event?.pointerType === 'touch') return;
    pointerInside = true;
    clearTimers();
    if (!canShow()) return;
    if (open.value) return;
    openTimer = setTimeout(show, Math.max(0, toValue(options.delayMs) ?? 500));
  }

  function handlePointerleave() {
    pointerInside = false;
    clearTimeout(openTimer);
    openTimer = undefined;
    scheduleHide();
  }

  function handleFocusout() {
    keyboardFocused = false;
    scheduleHide();
  }

  function scheduleHide() {
    if (pointerInside || keyboardFocused) return;
    clearTimers();
    closeTimer = setTimeout(
      () => {
        open.value = false;
        removeViewportListeners();
      },
      Math.max(0, toValue(options.closeDelayMs) ?? 100),
    );
  }

  function hideNow() {
    clearTimers();
    open.value = false;
    removeViewportListeners();
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape' || !open.value) return;
    event.stopPropagation();
    hideNow();
  }

  watch(canShow, (available) => {
    if (!available) hideNow();
    else if (keyboardFocused) show();
    else if (pointerInside) scheduleShow();
  });

  watch(
    () => toValue(options.text),
    () => {
      if (open.value) nextTick(updatePosition);
    },
  );

  onBeforeUnmount(() => {
    clearTimers();
    removeViewportListeners();
  });

  return {
    open,
    position,
    setTooltip,
    tooltipId,
    triggerProps,
  };
}
