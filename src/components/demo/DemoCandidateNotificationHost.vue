<script setup>
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { X } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import DemoCandidateNotice from './DemoCandidateNotice.vue';

const props = defineProps({
  notificationKey: { type: String, required: true },
  lifecycle: {
    type: String,
    required: true,
    validator: (value) =>
      ['transient', 'progress', 'persistent'].includes(value),
  },
  durationMs: { type: Number, default: 6000 },
  dismissible: { type: Boolean, default: false },
  announcement: {
    type: String,
    default: 'none',
    validator: (value) => ['none', 'polite', 'urgent'].includes(value),
  },
  tone: { type: String, default: 'neutral' },
  density: { type: String, default: 'standard' },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
});

const emit = defineEmits(['action', 'dismiss']);
const SWIPE_DISMISS_DISTANCE = 72;
const pausedByPointer = shallowRef(false);
const pausedByFocus = shallowRef(false);
const pausedByDocument = shallowRef(false);
const dragOffset = shallowRef(0);
const isDragging = shallowRef(false);
const isPaused = computed(
  () => pausedByPointer.value || pausedByFocus.value || pausedByDocument.value,
);
const announcementAttrs = computed(() => {
  if (props.announcement === 'urgent') {
    return { role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true' };
  }
  if (props.announcement === 'polite') {
    return { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' };
  }
  return {};
});

let timerId;
let startedAt = 0;
let remainingMs = props.durationMs;
let isMounted = false;
let activePointerId;
let dragStartX = 0;

function clearTimer() {
  if (timerId !== undefined) clearTimeout(timerId);
  timerId = undefined;
}

function scheduleTimer() {
  clearTimer();
  if (!isMounted || props.lifecycle !== 'transient' || isPaused.value) {
    return;
  }
  startedAt = Date.now();
  timerId = setTimeout(() => {
    timerId = undefined;
    emit('dismiss', 'timeout');
  }, remainingMs);
}

function resetTimer() {
  remainingMs = Math.max(0, props.durationMs);
  scheduleTimer();
}

function setPauseSource(source, value) {
  if (source === 'pointer') pausedByPointer.value = value;
  if (source === 'focus') pausedByFocus.value = value;
  if (source === 'document') pausedByDocument.value = value;
}

function pauseTimer(source) {
  const wasPaused = isPaused.value;
  setPauseSource(source, true);
  if (!wasPaused && timerId !== undefined) {
    remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
    clearTimer();
  }
}

function resumeTimer(source) {
  setPauseSource(source, false);
  if (!isPaused.value) scheduleTimer();
}

function syncDocumentVisibility() {
  if (document.hidden) pauseTimer('document');
  else resumeTimer('document');
}

function dismiss(reason) {
  clearTimer();
  dragOffset.value = 0;
  isDragging.value = false;
  emit('dismiss', reason);
}

function beginSwipe(event) {
  if (
    !props.dismissible ||
    props.lifecycle !== 'transient' ||
    !['touch', 'pen'].includes(event.pointerType)
  ) {
    return;
  }
  activePointerId = event.pointerId;
  dragStartX = event.clientX;
  dragOffset.value = 0;
  isDragging.value = true;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  pauseTimer('pointer');
}

function updateSwipe(event) {
  if (!isDragging.value || event.pointerId !== activePointerId) return;
  dragOffset.value = event.clientX - dragStartX;
}

function finishSwipe(event) {
  if (!isDragging.value || event.pointerId !== activePointerId) return;
  const shouldDismiss = Math.abs(dragOffset.value) >= SWIPE_DISMISS_DISTANCE;
  activePointerId = undefined;
  isDragging.value = false;
  if (shouldDismiss) {
    dismiss('swipe');
    return;
  }
  dragOffset.value = 0;
  resumeTimer('pointer');
}

function cancelSwipe(event) {
  if (!isDragging.value || event.pointerId !== activePointerId) return;
  activePointerId = undefined;
  isDragging.value = false;
  dragOffset.value = 0;
  resumeTimer('pointer');
}

watch(
  () => [props.notificationKey, props.lifecycle, props.durationMs],
  resetTimer,
);

onMounted(() => {
  isMounted = true;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', syncDocumentVisibility);
    syncDocumentVisibility();
  }
  resetTimer();
});

onBeforeUnmount(() => {
  isMounted = false;
  clearTimer();
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', syncDocumentVisibility);
  }
});
</script>

<template>
  <article
    class="demo-candidate-notification-host"
    :class="{
      'demo-candidate-notification-host--dismissible': dismissible,
      'demo-candidate-notification-host--swipeable':
        dismissible && lifecycle === 'transient',
      'demo-candidate-notification-host--dragging': isDragging,
    }"
    :style="{ '--demo-notification-drag-x': `${dragOffset}px` }"
    :data-notification-key="notificationKey"
    :data-notification-lifecycle="lifecycle"
    v-bind="announcementAttrs"
    @pointerenter="pauseTimer('pointer')"
    @pointerleave="resumeTimer('pointer')"
    @focusin="pauseTimer('focus')"
    @focusout="resumeTimer('focus')"
    @pointerdown="beginSwipe"
    @pointermove="updateSwipe"
    @pointerup="finishSwipe"
    @pointercancel="cancelSwipe"
  >
    <DemoCandidateNotice
      class="demo-candidate-notification-host__notice"
      :tone="tone"
      :density="density"
      :title="title"
      :message="message"
      :action-label="actionLabel"
      @action="emit('action')"
    />
    <UiIconButton
      v-if="dismissible"
      class="demo-candidate-notification-host__close"
      :icon="X"
      label="關閉通知"
      variant="ghost"
      @click="dismiss('manual')"
    />
  </article>
</template>

<style scoped>
.demo-candidate-notification-host {
  position: relative;
  min-inline-size: 0;
  max-inline-size: 100%;
  container-type: inline-size;
  -webkit-user-select: none;
  user-select: none;
  transform: translateX(var(--demo-notification-drag-x, 0));
  transition: transform var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.demo-candidate-notification-host--swipeable {
  touch-action: pan-y;
}

.demo-candidate-notification-host--dragging {
  will-change: transform;
  transition: none;
}

.demo-candidate-notification-host__notice {
  inline-size: 100%;
}

.demo-candidate-notification-host__close {
  --ui-icon-button-size-override: var(--ui-icon-button-size-md);

  position: absolute;
  inset-block-start: var(--ui-space-2);
  inset-inline-end: var(--ui-space-2);
}

.demo-candidate-notification-host--dismissible :deep(.demo-candidate-notice) {
  padding-inline-end: calc(
    var(--ui-space-2) + var(--ui-icon-button-size-md) + var(--ui-space-2)
  );
}

:global(:root[data-ui-motion='reduced']) .demo-candidate-notification-host {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .demo-candidate-notification-host {
    transition: none;
  }
}
</style>
