import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
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
    onPointerleave: scheduleHide,
    onFocusin: show,
    onFocusout: scheduleHide,
    onKeydown: handleKeydown,
  }));

  let openTimer;
  let closeTimer;

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

  function show() {
    if (!canShow()) return;
    clearTimeout(closeTimer);
    open.value = true;
    nextTick(updatePosition);
  }

  function scheduleShow(event) {
    if (event?.pointerType === 'touch' || !canShow()) return;
    clearTimers();
    openTimer = setTimeout(show, Math.max(0, toValue(options.delayMs) ?? 500));
  }

  function scheduleHide() {
    clearTimers();
    closeTimer = setTimeout(
      () => {
        open.value = false;
      },
      Math.max(0, toValue(options.closeDelayMs) ?? 100),
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

  watch(canShow, (available) => {
    if (!available) hideNow();
  });

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

  return {
    open,
    position,
    setTooltip,
    tooltipId,
    triggerProps,
  };
}
