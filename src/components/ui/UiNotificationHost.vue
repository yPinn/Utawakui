<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, watch } from 'vue';
import { X } from '../../icons/index.js';
import { customLengthPixels } from './floatingPosition.js';
import UiIconButton from './UiIconButton.vue';
import UiNotice from './UiNotice.vue';

const LIFECYCLES = new Set(['persistent', 'progress', 'transient']);

const props = defineProps({
  items: { type: Array, default: () => [] },
  maxVisible: {
    type: Number,
    default: 3,
    validator: (value) => Number.isInteger(value) && value >= 1 && value <= 6,
  },
  density: {
    type: String,
    default: 'standard',
    validator: (value) => ['compact', 'standard'].includes(value),
  },
  ariaLabel: { type: String, default: '通知' },
});

const emit = defineEmits(['action', 'dismiss']);
const timerState = new Map();
const swipeState = reactive(new Map());
const visibleItems = computed(() =>
  props.items
    .filter(
      (item) =>
        item &&
        item.id !== undefined &&
        item.id !== null &&
        (item.title || item.message),
    )
    .slice(0, props.maxVisible),
);
let mounted = false;

function lifecycleFor(item) {
  return LIFECYCLES.has(item.lifecycle) ? item.lifecycle : 'persistent';
}

function durationFor(item) {
  return Number.isFinite(item.durationMs) ? Math.max(0, item.durationMs) : 6000;
}

function noticeTone(item) {
  return item.tone === 'neutral' ? 'muted' : item.tone || 'muted';
}

function announcementAttrs(item) {
  if (item.announcement === 'urgent') {
    return { role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true' };
  }
  if (item.announcement === 'polite') {
    return { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' };
  }
  return {};
}

function clearTimer(state) {
  if (state?.timer !== undefined) clearTimeout(state.timer);
  if (state) state.timer = undefined;
}

function dismiss(item, reason) {
  const state = timerState.get(item.id);
  clearTimer(state);
  const swipe = swipeState.get(item.id);
  if (swipe) {
    swipe.dragging = false;
    swipe.offset = 0;
    swipe.pointerId = undefined;
  }
  emit('dismiss', { id: item.id, reason });
}

function schedule(item, state) {
  clearTimer(state);
  if (!mounted || lifecycleFor(item) !== 'transient' || state.paused.size > 0) {
    return;
  }
  state.startedAt = Date.now();
  state.timer = setTimeout(() => {
    state.timer = undefined;
    dismiss(item, 'timeout');
  }, state.remainingMs);
}

function ensureTimer(item) {
  const lifecycle = lifecycleFor(item);
  const durationMs = durationFor(item);
  let state = timerState.get(item.id);
  if (
    !state ||
    state.lifecycle !== lifecycle ||
    state.durationMs !== durationMs
  ) {
    clearTimer(state);
    state = {
      durationMs,
      lifecycle,
      paused: new Set(),
      remainingMs: durationMs,
      startedAt: 0,
      timer: undefined,
    };
    timerState.set(item.id, state);
  }
  schedule(item, state);
}

function syncTimers() {
  const visibleIds = new Set(visibleItems.value.map((item) => item.id));
  for (const [id, state] of timerState) {
    if (!visibleIds.has(id)) {
      clearTimer(state);
      timerState.delete(id);
      swipeState.delete(id);
    }
  }
  for (const item of visibleItems.value) ensureTimer(item);
}

function pause(item, source) {
  const state = timerState.get(item.id);
  if (!state || state.paused.has(source)) return;
  if (state.paused.size === 0 && state.timer !== undefined) {
    state.remainingMs = Math.max(
      0,
      state.remainingMs - (Date.now() - state.startedAt),
    );
    clearTimer(state);
  }
  state.paused.add(source);
}

function resume(item, source) {
  const state = timerState.get(item.id);
  if (!state || !state.paused.has(source)) return;
  state.paused.delete(source);
  if (state.paused.size === 0) schedule(item, state);
}

function handleFocusOut(item, event) {
  if (event.currentTarget?.contains(event.relatedTarget)) return;
  resume(item, 'focus');
}

function handlePointerLeave(item) {
  if (!swipeFor(item).dragging) resume(item, 'pointer');
}

function syncDocumentVisibility() {
  for (const item of visibleItems.value) {
    if (document.hidden) pause(item, 'document');
    else resume(item, 'document');
  }
}

function swipeFor(item) {
  if (!swipeState.has(item.id)) {
    swipeState.set(item.id, {
      dragging: false,
      offset: 0,
      pointerId: undefined,
      startX: 0,
    });
  }
  return swipeState.get(item.id);
}

function canSwipe(item) {
  return Boolean(item.dismissible) && lifecycleFor(item) === 'transient';
}

function beginSwipe(item, event) {
  if (!canSwipe(item) || !['pen', 'touch'].includes(event.pointerType)) return;
  const state = swipeFor(item);
  state.dragging = true;
  state.offset = 0;
  state.pointerId = event.pointerId;
  state.startX = event.clientX;
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  pause(item, 'pointer');
}

function updateSwipe(item, event) {
  const state = swipeFor(item);
  if (!state.dragging || state.pointerId !== event.pointerId) return;
  state.offset = event.clientX - state.startX;
}

function finishSwipe(item, event) {
  const state = swipeFor(item);
  if (!state.dragging || state.pointerId !== event.pointerId) return;
  const shouldDismiss =
    Math.abs(state.offset) >=
    customLengthPixels('--ui-notification-swipe-dismiss-distance', 4.5);
  state.dragging = false;
  state.pointerId = undefined;
  if (shouldDismiss) {
    dismiss(item, 'swipe');
    return;
  }
  state.offset = 0;
  resume(item, 'pointer');
}

function cancelSwipe(item, event) {
  const state = swipeFor(item);
  if (!state.dragging || state.pointerId !== event.pointerId) return;
  state.dragging = false;
  state.offset = 0;
  state.pointerId = undefined;
  resume(item, 'pointer');
}

function itemStyle(item) {
  return { '--ui-notification-drag-x': `${swipeFor(item).offset}px` };
}

watch(
  () =>
    visibleItems.value.map((item) => [
      item.id,
      lifecycleFor(item),
      durationFor(item),
    ]),
  syncTimers,
  { deep: true },
);

onMounted(() => {
  mounted = true;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', syncDocumentVisibility);
  }
  syncTimers();
  syncDocumentVisibility();
});

onBeforeUnmount(() => {
  mounted = false;
  for (const state of timerState.values()) clearTimer(state);
  timerState.clear();
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', syncDocumentVisibility);
  }
});
</script>

<template>
  <Teleport to="body">
    <TransitionGroup
      tag="section"
      name="ui-notification"
      appear
      class="ui-notification-host"
      :aria-label="visibleItems.length ? props.ariaLabel : undefined"
    >
      <article
        v-for="item in visibleItems"
        :key="item.id"
        class="ui-notification-host__item"
        :class="{
          'ui-notification-host__item--dismissible': item.dismissible,
          'ui-notification-host__item--swipeable': canSwipe(item),
          'ui-notification-host__item--dragging': swipeFor(item).dragging,
        }"
        :style="itemStyle(item)"
        :data-notification-id="item.id"
        :data-notification-lifecycle="lifecycleFor(item)"
        v-bind="announcementAttrs(item)"
        @pointerenter="pause(item, 'pointer')"
        @pointerleave="handlePointerLeave(item)"
        @focusin="pause(item, 'focus')"
        @focusout="handleFocusOut(item, $event)"
        @pointerdown="beginSwipe(item, $event)"
        @pointermove="updateSwipe(item, $event)"
        @pointerup="finishSwipe(item, $event)"
        @pointercancel="cancelSwipe(item, $event)"
      >
        <UiNotice
          class="ui-notification-host__notice"
          :tone="noticeTone(item)"
          :title="item.title"
          :message="item.message"
          :action-label="item.actionLabel"
          :compact="(item.density || props.density) === 'compact'"
          role="presentation"
          aria-live="off"
          @action="emit('action', item.id)"
        />
        <UiIconButton
          v-if="item.dismissible"
          class="ui-notification-host__close"
          :icon="X"
          label="關閉通知"
          variant="ghost"
          @click="dismiss(item, 'manual')"
        />
      </article>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.ui-notification-host {
  position: fixed;
  z-index: var(--ui-z-toast);
  inset-block-end: var(--ui-notification-block-end-offset);
  inset-inline-end: var(--ui-notification-safe-inset);
  inline-size: min(
    var(--ui-notification-preferred-inline-size),
    calc(100vw - (2 * var(--ui-notification-safe-inset)))
  );
  min-inline-size: min(
    var(--ui-notification-min-inline-size),
    calc(100vw - (2 * var(--ui-notification-safe-inset)))
  );
  max-inline-size: min(
    var(--ui-notification-max-inline-size),
    calc(100vw - (2 * var(--ui-notification-safe-inset)))
  );
  display: grid;
  gap: var(--ui-notification-stack-gap);
  pointer-events: none;
}

.ui-notification-host__item {
  --ui-notification-motion-y: 0;

  position: relative;
  min-inline-size: 0;
  max-inline-size: 100%;
  pointer-events: auto;
  -webkit-user-select: none;
  user-select: none;
  transform: translate3d(
    var(--ui-notification-drag-x, 0),
    var(--ui-notification-motion-y),
    0
  );
  transition: transform var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.ui-notification-host__item--swipeable {
  touch-action: pan-y;
}

.ui-notification-host__item--dragging {
  will-change: transform;
  transition: none;
}

.ui-notification-host__notice {
  inline-size: 100%;
}

.ui-notification-host__close {
  position: absolute;
  inset-block-start: var(--ui-space-2);
  inset-inline-end: var(--ui-space-2);
}

.ui-notification-host__item--dismissible :deep(.ui-notice) {
  padding-inline-end: calc(
    var(--ui-space-2) + var(--ui-icon-button-size-md) + var(--ui-space-2)
  );
}

.ui-notification-enter-active {
  will-change: transform, opacity;
  transition:
    opacity var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard),
    transform var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.ui-notification-leave-active {
  position: absolute;
  inline-size: 100%;
  pointer-events: none;
  will-change: transform, opacity;
  transition:
    opacity var(--ui-motion-duration-fast) var(--ui-motion-easing-standard),
    transform var(--ui-motion-duration-fast) var(--ui-motion-easing-standard);
}

.ui-notification-move {
  transition: transform var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.ui-notification-enter-from,
.ui-notification-leave-to {
  --ui-notification-motion-y: var(--ui-notification-motion-offset);

  opacity: 0;
}

:global(:root[data-ui-motion='reduced']) .ui-notification-host__item {
  --ui-notification-motion-y: 0;

  opacity: 1;
  will-change: auto;
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .ui-notification-host__item {
    --ui-notification-motion-y: 0;

    opacity: 1;
    will-change: auto;
    transition: none;
  }
}
</style>
