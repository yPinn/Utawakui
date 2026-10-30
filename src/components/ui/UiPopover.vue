<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue';
import { useUiOverlayHost } from '../../composables/useUiOverlayHost.js';
import {
  anchoredFloatingPosition,
  customLengthPixels,
} from './floatingPosition.js';
import UiScrollRegion from './UiScrollRegion.vue';

// Two roots (anchor + teleported panel): caller layout attrs belong on the
// in-flow anchor, never on the floating panel.
defineOptions({ inheritAttrs: false });

const overlayHost = useUiOverlayHost();

const props = defineProps({
  maximized: { type: Boolean, default: false },
  open: { type: Boolean, default: false },
  focusOnOpen: { type: Boolean, default: false },
  closeOnScroll: { type: Boolean, default: true },
  closeOnOutsidePointer: { type: Boolean, default: true },
  closeOnEscape: { type: Boolean, default: true },
  ariaLabel: { type: String, required: true },
  placement: {
    type: String,
    default: 'bottom-start',
    validator: (value) =>
      ['bottom-end', 'bottom-start', 'top-end', 'top-start'].includes(value),
  },
  role: {
    type: String,
    default: 'dialog',
    validator: (value) => ['dialog', 'region'].includes(value),
  },
  panelStyle: {
    type: [String, Array, Object],
    default: undefined,
  },
  scrollAxis: {
    type: String,
    default: 'both',
    validator: (value) => ['vertical', 'horizontal', 'both'].includes(value),
  },
  scrollAriaLabel: { type: String, default: '' },
});

const emit = defineEmits(['update:open', 'close']);
const anchorRef = useTemplateRef('anchor');
const panelRef = useTemplateRef('panel');
const panelId = `ui-popover-${useId()}`;
const position = shallowRef({ left: '0px', top: '0px' });
let sizeObserver = null;
const triggerElement = shallowRef(null);
function registerTrigger(element) {
  triggerElement.value = element?.$el ?? element;
}
const triggerProps = computed(() => ({
  ref: registerTrigger,
  'aria-controls': panelId,
  'aria-expanded': props.open,
  'aria-haspopup': props.role === 'dialog' ? 'dialog' : undefined,
}));

function updatePosition() {
  if (!props.open || props.maximized || typeof window === 'undefined') return;
  const anchor = anchorRef.value?.getBoundingClientRect();
  const panel = panelRef.value?.getBoundingClientRect();
  if (!anchor || !panel) return;

  const { left, top } = anchoredFloatingPosition({
    anchor,
    surface: panel,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    placement: props.placement,
    direction: window.getComputedStyle(anchorRef.value).direction,
    gap: customLengthPixels('--ui-floating-gap', 0.5),
    inset: customLengthPixels('--ui-floating-viewport-inset', 0.5),
  });
  position.value = { left: `${left}px`, top: `${top}px` };
}

function requestClose(reason) {
  if (!props.open) return;
  const returnFocus = reason === 'escape' ? triggerElement.value : null;
  emit('update:open', false);
  emit('close', reason);
  if (returnFocus?.focus) nextTick(() => returnFocus.focus());
}
function maximizedTabStops() {
  return [
    ...(panelRef.value?.querySelectorAll?.(
      'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])',
    ) ?? []),
  ].filter(
    (node) =>
      node.getClientRects?.().length && !node.closest?.('[inert], [hidden]'),
  );
}
function handleMaximizedTab(event) {
  if (
    !props.maximized ||
    event.key !== 'Tab' ||
    event.defaultPrevented ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey
  )
    return;
  const stops = maximizedTabStops(),
    first = stops[0],
    last = stops.at(-1),
    active = globalThis.document?.activeElement;
  if (!stops.length) {
    event.preventDefault();
    panelRef.value?.focus?.();
    return;
  }
  if (
    event.shiftKey
      ? active === first || !stops.includes(active)
      : active === last || !stops.includes(active)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

function isRelatedFloatingSurface(target) {
  if (target?.closest?.('.ui-action-menu')) return true;
  const listbox = target?.closest?.('[role="listbox"]');
  if (!listbox?.id) return false;
  return Array.from(
    panelRef.value?.querySelectorAll?.('[role="combobox"]') ?? [],
  ).some((control) =>
    control.getAttribute('aria-controls')?.split(/\s+/).includes(listbox.id),
  );
}

function handleOutsidePointer(event) {
  if (
    !props.open ||
    !props.closeOnOutsidePointer ||
    anchorRef.value?.contains(event.target) ||
    panelRef.value?.contains(event.target) ||
    isRelatedFloatingSurface(event.target)
  ) {
    return;
  }
  requestClose('outside-pointer');
}

function handleKeydown(event) {
  if (
    !props.open ||
    !props.closeOnEscape ||
    event.key !== 'Escape' ||
    isRelatedFloatingSurface(event.target) ||
    (panelRef.value?.contains(event.target) &&
      event.target?.closest?.('[role="combobox"][aria-expanded="true"]'))
  ) {
    return;
  }
  event.preventDefault?.();
  event.stopPropagation?.();
  requestClose('escape');
}

function handleScroll(event) {
  if (
    !props.open ||
    panelRef.value?.contains(event.target) ||
    isRelatedFloatingSurface(event.target)
  ) {
    return;
  }
  if (props.closeOnScroll) requestClose('external-scroll');
  else if (
    event.target === window ||
    event.target === document ||
    event.target?.contains?.(anchorRef.value)
  )
    updatePosition();
}

function openPanel() {
  if (!props.open) return;
  updatePosition();
  if (!props.focusOnOpen) return;
  const first = panelRef.value?.querySelector?.(
    'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  );
  (first ?? panelRef.value)?.focus?.({ preventScroll: true });
}

watch(
  () => props.maximized,
  () =>
    nextTick(() => {
      updatePosition();
      if (
        props.maximized &&
        !panelRef.value?.contains?.(globalThis.document?.activeElement)
      )
        (maximizedTabStops()[0] ?? panelRef.value)?.focus?.({
          preventScroll: true,
        });
    }),
  { flush: 'post' },
);
watch(
  () => props.open,
  (open) => {
    if (open) nextTick(openPanel);
  },
  { flush: 'post' },
);

// Search results and async content can change height after the first anchor pass.
watch(
  panelRef,
  (panel) => {
    sizeObserver?.disconnect();
    sizeObserver = null;
    if (!panel || typeof ResizeObserver === 'undefined') return;
    sizeObserver = new ResizeObserver(updatePosition);
    sizeObserver.observe(panel);
  },
  { flush: 'post' },
);

onMounted(() => {
  if (props.open) nextTick(openPanel);
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  document.addEventListener('pointerdown', handleOutsidePointer, true);
  window.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('scroll', handleScroll, true);
  window.addEventListener('resize', updatePosition);
});

onBeforeUnmount(() => {
  sizeObserver?.disconnect();
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  document.removeEventListener('pointerdown', handleOutsidePointer, true);
  window.removeEventListener('keydown', handleKeydown, true);
  window.removeEventListener('scroll', handleScroll, true);
  window.removeEventListener('resize', updatePosition);
});
</script>

<template>
  <span ref="anchor" class="ui-popover__anchor" v-bind="$attrs">
    <slot name="trigger" :open="props.open" :trigger-props="triggerProps" />
  </span>
  <!-- Deferred: an always-mounted overlay can mount in the same pass as its
       surface host, before that host is in the document. -->
  <Teleport defer :to="overlayHost || undefined" :disabled="!overlayHost">
    <section
      v-if="props.open"
      :id="panelId"
      ref="panel"
      class="ui-popover"
      :role="props.role"
      :aria-label="props.ariaLabel"
      :aria-modal="props.role === 'dialog' ? 'false' : undefined"
      :tabindex="focusOnOpen ? -1 : undefined"
      :style="[
        props.panelStyle,
        position,
        props.maximized
          ? {
              left: 'var(--ui-floating-viewport-inset)',
              top: 'var(--ui-floating-viewport-inset)',
              width: 'calc(100vw - 2 * var(--ui-floating-viewport-inset))',
              height: 'calc(100vh - 2 * var(--ui-floating-viewport-inset))',
              maxInlineSize: 'none',
              translate: 'none',
            }
          : undefined,
      ]"
      @keydown="handleMaximizedTab"
    >
      <header v-if="$slots.header" class="ui-popover__header">
        <slot name="header" />
      </header>
      <UiScrollRegion
        v-if="$slots.default"
        class="ui-popover__scroll"
        :axis="props.scrollAxis"
        :aria-label="props.scrollAriaLabel || undefined"
        :tabindex="props.scrollAriaLabel ? 0 : undefined"
      >
        <div class="ui-popover__body">
          <slot />
        </div>
      </UiScrollRegion>
      <footer v-if="$slots.footer" class="ui-popover__footer">
        <slot name="footer" />
      </footer>
    </section>
  </Teleport>
</template>

<style scoped>
.ui-popover__anchor {
  display: inline-flex;
  min-width: 0;
}

.ui-popover {
  position: fixed;
  z-index: var(--ui-z-popover);
  inline-size: max-content;
  max-inline-size: min(
    var(--ui-popover-max-inline-size),
    calc(100vw - (2 * var(--ui-floating-viewport-inset)))
  );
  max-block-size: calc(100vh - (2 * var(--ui-floating-viewport-inset)));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding: 0;
  overflow: hidden;
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface-raised);
  box-shadow: var(--ui-shadow-overlay);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.ui-popover__scroll {
  min-block-size: 0;
  overscroll-behavior: contain;
}

.ui-popover__header {
  min-width: 0;
  padding: var(--ui-space-3) var(--ui-space-3) 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
  overflow-wrap: anywhere;
}

.ui-popover__header:last-child {
  padding-block-end: var(--ui-space-3);
}

.ui-popover__body {
  min-width: 0;
  padding: var(--ui-space-3);
  overflow-wrap: anywhere;
}

.ui-popover__footer {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding: 0 var(--ui-space-3) var(--ui-space-3);
}

.ui-popover__footer:first-child,
.ui-popover__header + .ui-popover__footer {
  padding-block-start: var(--ui-space-3);
}
</style>
