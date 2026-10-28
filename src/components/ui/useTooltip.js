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
export const TOOLTIP_SKIP_DELAY_MS = 300;

// Shared by every tooltip: only one is visible at a time, and moving to a
// neighbouring trigger soon after one starts closing skips the hover delay.
let hideActiveTooltip = null;
let lastLeftAt = Number.NEGATIVE_INFINITY;

function hoverDelaySkipped() {
  const elapsed = Date.now() - lastLeftAt;
  return elapsed >= 0 && elapsed < TOOLTIP_SKIP_DELAY_MS;
}

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
    onPointerdown: () => dismiss(),
    onFocusin: handleFocusin,
    onFocusout: handleFocusout,
    onKeydown: handleKeydown,
  }));

  let openTimer;
  let closeTimer;
  let viewportListenersAttached = false;
  let pointerInside = false;
  let keyboardFocused = false;
  // Set by activation or scroll; cleared once both hover and focus have left.
  let dismissed = false;

  function canShow() {
    return !toValue(options.disabled) && Boolean(toValue(options.text));
  }

  function triggerExpanded() {
    return anchorRef.value?.getAttribute?.('aria-expanded') === 'true';
  }

  function setAnchor(value) {
    anchorRef.value = value?.$el ?? value;
  }

  // WCAG 1.4.13: hovering the surface keeps it open like hovering the trigger.
  function setTooltip(value) {
    const element = value?.$el ?? value;
    if (element === tooltipRef.value) return;
    tooltipRef.value = element;
    element?.addEventListener?.('pointerenter', handleSurfacePointerenter);
    element?.addEventListener?.('pointerleave', handlePointerleave);
  }

  function handleSurfacePointerenter(event) {
    if (event?.pointerType === 'touch') return;
    pointerInside = true;
    clearTimers();
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

  // Only an ancestor scroll moves the trigger; sibling regions and the
  // trigger's own content (e.g. credit viewports) leave the tooltip open.
  function handleScroll(event) {
    const target = event?.target;
    const anchor = anchorRef.value;
    if (!anchor || target === anchor || !target?.contains?.(anchor)) return;
    dismiss({ warm: false });
  }

  function attachViewportListeners() {
    if (viewportListenersAttached || typeof window === 'undefined') return;
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleScroll, true);
    viewportListenersAttached = true;
  }

  function removeViewportListeners() {
    if (!viewportListenersAttached || typeof window === 'undefined') return;
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', handleScroll, true);
    viewportListenersAttached = false;
  }

  // A scroll dismissal cools the shared group so passing triggers stay quiet.
  function setOpen(value, { warm = true } = {}) {
    if (open.value === value) return;
    open.value = value;
    if (value) {
      if (hideActiveTooltip !== hideNow) hideActiveTooltip?.();
      hideActiveTooltip = hideNow;
      return;
    }
    if (hideActiveTooltip === hideNow) hideActiveTooltip = null;
    lastLeftAt = warm ? Date.now() : Number.NEGATIVE_INFINITY;
  }

  function show() {
    if (!canShow() || dismissed || triggerExpanded()) return;
    clearTimers();
    attachViewportListeners();
    setOpen(true);
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
    if (hoverDelaySkipped()) {
      show();
      return;
    }
    openTimer = setTimeout(show, Math.max(0, toValue(options.delayMs) ?? 500));
  }

  function handlePointerleave() {
    pointerInside = false;
    if (!keyboardFocused) dismissed = false;
    clearTimeout(openTimer);
    openTimer = undefined;
    scheduleHide();
  }

  function handleFocusout() {
    keyboardFocused = false;
    if (!pointerInside) dismissed = false;
    scheduleHide();
  }

  function scheduleHide() {
    if (pointerInside || keyboardFocused) return;
    if (open.value) lastLeftAt = Date.now();
    clearTimers();
    closeTimer = setTimeout(
      () => {
        setOpen(false);
        removeViewportListeners();
      },
      Math.max(0, toValue(options.closeDelayMs) ?? 100),
    );
  }

  function hideNow(closeOptions) {
    clearTimers();
    setOpen(false, closeOptions);
    removeViewportListeners();
  }

  function dismiss(closeOptions) {
    dismissed = pointerInside || keyboardFocused;
    hideNow(closeOptions);
  }

  function handleKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      dismiss();
      return;
    }
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
    if (hideActiveTooltip === hideNow) hideActiveTooltip = null;
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
