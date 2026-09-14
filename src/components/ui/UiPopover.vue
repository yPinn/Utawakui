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
import {
  anchoredFloatingPosition,
  customLengthPixels,
} from './floatingPosition.js';

const props = defineProps({
  open: { type: Boolean, default: false },
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
});

const emit = defineEmits(['update:open', 'close']);
const anchorRef = useTemplateRef('anchor');
const panelRef = useTemplateRef('panel');
const panelId = `ui-popover-${useId()}`;
const position = shallowRef({ left: '0px', top: '0px' });
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
  if (!props.open || typeof window === 'undefined') return;
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

function handleOutsidePointer(event) {
  if (
    !props.open ||
    anchorRef.value?.contains(event.target) ||
    panelRef.value?.contains(event.target)
  ) {
    return;
  }
  requestClose('outside-pointer');
}

function handleKeydown(event) {
  if (!props.open || event.key !== 'Escape') return;
  event.preventDefault?.();
  event.stopPropagation?.();
  requestClose('escape');
}

function handleScroll(event) {
  if (
    !props.open ||
    event.target === panelRef.value ||
    panelRef.value?.contains(event.target)
  ) {
    return;
  }
  requestClose('external-scroll');
}

watch(
  () => props.open,
  (open) => {
    if (open) nextTick(updatePosition);
  },
  { immediate: true },
);

onMounted(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  document.addEventListener('pointerdown', handleOutsidePointer, true);
  window.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('scroll', handleScroll, true);
  window.addEventListener('resize', updatePosition);
});

onBeforeUnmount(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  document.removeEventListener('pointerdown', handleOutsidePointer, true);
  window.removeEventListener('keydown', handleKeydown, true);
  window.removeEventListener('scroll', handleScroll, true);
  window.removeEventListener('resize', updatePosition);
});
</script>

<template>
  <span ref="anchor" class="ui-popover__anchor">
    <slot name="trigger" :open="props.open" :trigger-props="triggerProps" />
  </span>
  <Teleport to="body">
    <section
      v-if="props.open"
      :id="panelId"
      ref="panel"
      class="ui-popover"
      :role="props.role"
      :aria-label="props.ariaLabel"
      :aria-modal="props.role === 'dialog' ? 'false' : undefined"
      :style="position"
    >
      <header v-if="$slots.header" class="ui-popover__header">
        <slot name="header" />
      </header>
      <div v-if="$slots.default" class="ui-popover__body">
        <slot />
      </div>
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
  padding: 0;
  overflow: auto;
  overscroll-behavior: contain;
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface-raised);
  box-shadow: var(--ui-shadow-overlay);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  scrollbar-color: var(--ui-color-border-strong) transparent;
  scrollbar-width: thin;
}

.ui-popover__header {
  min-width: 0;
  padding: var(--ui-space-3) var(--ui-space-3) 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
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
