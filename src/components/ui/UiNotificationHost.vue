<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, watch } from 'vue';
import { useUiOverlayHost } from '../../composables/useUiOverlayHost.js';
import { customLengthPixels } from './floatingPosition.js';
import UiButton from './UiButton.vue';
import UiNotice from './UiNotice.vue';
import UiProgress from './UiProgress.vue';

const overlayHost = useUiOverlayHost();

const LIFECYCLES = new Set(['persistent', 'progress', 'transient']);
const VARIANTS = new Set(['result', 'recovery', 'progress', 'confirmation']);
const SWIPE_DISMISS_WIDTH_RATIO = 0.35;
const SWIPE_DIRECTION_RATIO = 1.5;

const props = defineProps({
  items: { type: Array, default: () => [] },
  suspended: { type: Boolean, default: false },
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
  inlineSize: {
    type: Number,
    default: null,
    validator: (value) => Number.isFinite(value) && value > 0,
  },
});

const hostStyle = computed(() =>
  props.inlineSize === null
    ? null
    : {
        '--ui-notification-preferred-inline-size': `${props.inlineSize}px`,
        '--ui-notification-min-inline-size': `${props.inlineSize}px`,
        '--ui-notification-max-inline-size': `${props.inlineSize}px`,
      },
);

const emit = defineEmits(['action', 'dismiss']);
const timerState = new Map();
const swipeState = reactive(new Map());
const leavingSwipes = new Map();
const visibleItems = computed(() =>
  (props.suspended ? [] : props.items)
    .filter(
      (item) =>
        item &&
        item.id !== undefined &&
        item.id !== null &&
        (item.title || item.message),
    )
    .toSorted((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, props.maxVisible),
);
let mounted = false;

function lifecycleFor(item) {
  if (item.variant === 'confirmation') return 'persistent';
  return LIFECYCLES.has(item.lifecycle) ? item.lifecycle : 'persistent';
}

function durationFor(item) {
  return Number.isFinite(item.durationMs) ? Math.max(0, item.durationMs) : 6000;
}

function variantFor(item) {
  if (VARIANTS.has(item.variant)) return item.variant;
  if (lifecycleFor(item) === 'progress') return 'progress';
  if (lifecycleFor(item) === 'transient') return 'result';
  return 'recovery';
}

function dismissLabelFor(item) {
  if (!item.dismissible) return '';
  if (typeof item.dismissLabel === 'string' && item.dismissLabel.trim()) {
    return item.dismissLabel;
  }
  return variantFor(item) === 'confirmation' ? '知道了' : '';
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
  if (state) state.dismissed = true;
  const swipe = swipeState.get(item.id);
  if (swipe) {
    swipe.dragging = false;
    if (reason === 'swipe') {
      leavingSwipes.set(String(item.id), {
        offset: swipe.offset,
        target: Math.sign(swipe.offset) * swipe.width,
      });
    } else {
      swipe.offset = 0;
    }
    swipe.pointerId = undefined;
  }
  emit('dismiss', { id: item.id, reason });
}

function schedule(item, state) {
  clearTimer(state);
  if (
    !mounted ||
    state.dismissed ||
    lifecycleFor(item) !== 'transient' ||
    state.paused.size > 0
  ) {
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
      paused: new Set(state?.paused),
      dismissed: false,
      remainingMs: durationMs,
      startedAt: 0,
      timer: undefined,
    };
    timerState.set(item.id, state);
    schedule(item, state);
  } else if (state.timer === undefined && state.startedAt === 0) {
    schedule(item, state);
  }
}

function syncTimers() {
  const visibleIds = new Set(visibleItems.value.map((item) => item.id));
  const itemsById = new Map(
    props.items.filter(Boolean).map((item) => [item.id, item]),
  );
  for (const [id, state] of timerState) {
    if (!itemsById.has(id)) {
      clearTimer(state);
      timerState.delete(id);
      swipeState.delete(id);
    } else if (!visibleIds.has(id)) {
      pause(itemsById.get(id), 'hidden');
      // Hover/focus cannot survive removal of the visible article.
      state.paused.delete('pointer');
      state.paused.delete('focus');
      state.paused.delete('gesture');
      swipeState.delete(id);
    }
  }
  for (const item of visibleItems.value) {
    ensureTimer(item);
    resume(item, 'hidden');
  }
  if (mounted && typeof document !== 'undefined') syncDocumentVisibility();
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
  resume(item, 'pointer');
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
      startY: 0,
      width: 0,
      intentDistance: 0,
      dismissDistance: 0,
      suppressClick: false,
    });
  }
  return swipeState.get(item.id);
}

function canSwipe(item) {
  return Boolean(item.dismissible);
}

function beginSwipe(item, event) {
  if (
    !canSwipe(item) ||
    !['mouse', 'pen', 'touch'].includes(event.pointerType) ||
    event.isPrimary === false ||
    (event.button !== undefined && event.button !== 0) ||
    event.target?.closest?.(
      'button, a, input, textarea, select, summary, [role="button"], [contenteditable]',
    )
  )
    return;
  const state = swipeFor(item);
  if (state.pointerId !== undefined) return;
  state.dragging = false;
  state.offset = 0;
  state.suppressClick = false;
  state.pointerId = event.pointerId;
  state.startX = event.clientX;
  state.startY = event.clientY ?? 0;
  // Snapshot the stationary layout box once. List FLIP and drag must never
  // measure or transform the same node while the pointer is moving.
  const measuredWidth = event.currentTarget?.getBoundingClientRect?.().width;
  state.width =
    measuredWidth > 0
      ? measuredWidth
      : props.inlineSize ||
        customLengthPixels('--ui-notification-preferred-inline-size', 22);
  state.intentDistance = customLengthPixels(
    '--ui-notification-swipe-intent-distance',
    0.75,
  );
  state.dismissDistance = Math.min(
    state.width,
    Math.max(
      customLengthPixels('--ui-notification-swipe-dismiss-distance', 4.5),
      state.width * SWIPE_DISMISS_WIDTH_RATIO,
    ),
  );
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  pause(item, 'gesture');
}

function updateSwipe(item, event) {
  const state = swipeFor(item);
  if (state.pointerId === undefined || state.pointerId !== event.pointerId)
    return;
  if (!canSwipe(item)) return cancelSwipe(item, event);
  const dx = event.clientX - state.startX;
  const dy = (event.clientY ?? state.startY) - state.startY;
  if (!state.dragging) {
    if (Math.abs(dy) >= state.intentDistance && Math.abs(dy) >= Math.abs(dx))
      return cancelSwipe(item, event);
    if (
      Math.abs(dx) < state.intentDistance ||
      Math.abs(dx) < SWIPE_DIRECTION_RATIO * Math.abs(dy)
    )
      return;
    state.dragging = true;
  }
  state.offset =
    Math.sign(dx) *
    Math.min(state.width, Math.max(0, Math.abs(dx) - state.intentDistance));
}

function finishSwipe(item, event) {
  const state = swipeFor(item);
  if (state.pointerId === undefined || state.pointerId !== event.pointerId)
    return;
  if (state.dragging && Number.isFinite(event.clientX))
    updateSwipe(item, event);
  const shouldDismiss =
    canSwipe(item) &&
    state.dragging &&
    Math.abs(state.offset) + Number.EPSILON * state.width >=
      state.dismissDistance;
  state.suppressClick = state.dragging;
  cancelSwipe(item, event, !shouldDismiss);
  if (shouldDismiss) {
    event.preventDefault?.();
    dismiss(item, 'swipe');
  }
}

function cancelSwipe(item, event, restore = true) {
  const state = swipeFor(item);
  if (state.pointerId === undefined || state.pointerId !== event.pointerId)
    return;
  state.dragging = false;
  if (restore) state.offset = 0;
  state.pointerId = undefined;
  if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  resume(item, 'gesture');
}

function handleClick(item, event) {
  const state = swipeFor(item);
  if (!state.suppressClick || event.detail === 0) return;
  state.suppressClick = false;
  event.preventDefault();
  event.stopPropagation();
}

function dismissFromKeyboard(item, event) {
  if (!item.dismissible) return;
  event.stopPropagation();
  dismiss(item, 'manual');
}

function itemStyle(item) {
  return { '--ui-notification-drag-x': `${swipeFor(item).offset}px` };
}

function freezeLeavePosition(element) {
  // The shelf is bottom-anchored and shrinks as a row leaves. Preserve its
  // layout distance from that bottom so the exiting row cannot jump into Player.
  const inset = Math.max(
    0,
    (element.parentNode?.clientHeight ?? 0) -
      (element.offsetTop ?? 0) -
      (element.offsetHeight ?? 0),
  );
  element.style.insetBlockEnd = `${inset}px`;
  const swipe = leavingSwipes.get(element.dataset?.notificationId);
  if (swipe) {
    element.classList.add('ui-notification-host__item--swipe-dismissed');
    element.style.setProperty('--ui-notification-drag-x', `${swipe.offset}px`);
    element.style.setProperty(
      '--ui-notification-swipe-exit-x',
      `${swipe.target}px`,
    );
  }
}

function cancelLeavePosition(element) {
  element.style.insetBlockEnd = '';
  element.classList.remove('ui-notification-host__item--swipe-dismissed');
  element.style.removeProperty?.('--ui-notification-swipe-exit-x');
  element.style.removeProperty?.('--ui-notification-drag-x');
  clearLeavingSwipe(element);
}

function clearLeavingSwipe(element) {
  leavingSwipes.delete(element.dataset?.notificationId);
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
  leavingSwipes.clear();
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', syncDocumentVisibility);
  }
});
</script>

<template>
  <!-- Deferred: an always-mounted overlay can mount in the same pass as its
       surface host, before that host is in the document. -->
  <Teleport defer :to="overlayHost || undefined" :disabled="!overlayHost">
    <TransitionGroup
      tag="section"
      name="ui-notification"
      appear
      class="ui-notification-host"
      :style="hostStyle"
      :hidden="suspended || undefined"
      :aria-label="visibleItems.length ? props.ariaLabel : undefined"
      @before-leave="freezeLeavePosition"
      @leave-cancelled="cancelLeavePosition"
      @after-leave="clearLeavingSwipe"
    >
      <article
        v-for="item in visibleItems"
        :key="item.id"
        class="ui-notification-host__item"
        :class="{
          'ui-notification-host__item--swipeable': canSwipe(item),
          'ui-notification-host__item--dragging': swipeFor(item).dragging,
        }"
        :style="itemStyle(item)"
        :data-notification-id="item.id"
        :data-notification-lifecycle="lifecycleFor(item)"
        :data-notification-variant="variantFor(item)"
        :tabindex="
          item.dismissible &&
          (!item.actionLabel || item.actionDisabled) &&
          !dismissLabelFor(item)
            ? 0
            : undefined
        "
        v-bind="announcementAttrs(item)"
        @pointerenter="pause(item, 'pointer')"
        @pointerleave="handlePointerLeave(item)"
        @focusin="pause(item, 'focus')"
        @focusout="handleFocusOut(item, $event)"
        @pointerdown="beginSwipe(item, $event)"
        @pointermove="updateSwipe(item, $event)"
        @pointerup="finishSwipe(item, $event)"
        @pointercancel="cancelSwipe(item, $event)"
        @lostpointercapture="cancelSwipe(item, $event)"
        @click.capture="handleClick(item, $event)"
        @keydown.esc="dismissFromKeyboard(item, $event)"
      >
        <div class="ui-notification-host__card">
          <UiNotice
            class="ui-notification-host__notice"
            :tone="noticeTone(item)"
            :title="item.title"
            :message="item.message"
            :compact="(item.density || props.density) === 'compact'"
            role="presentation"
            aria-live="off"
          >
            <template v-if="dismissLabelFor(item) || item.actionLabel" #actions>
              <UiButton
                v-if="dismissLabelFor(item)"
                :variant="
                  variantFor(item) === 'confirmation' ? 'secondary' : 'ghost'
                "
                @click="dismiss(item, 'manual')"
              >
                {{ dismissLabelFor(item) }}
              </UiButton>
              <UiButton
                v-if="item.actionLabel"
                variant="secondary"
                :disabled="Boolean(item.actionDisabled)"
                @click="!item.actionDisabled && emit('action', item.id)"
              >
                {{ item.actionLabel }}
              </UiButton>
            </template>
            <template v-if="lifecycleFor(item) === 'progress'" #details>
              <div class="ui-notification-host__progress">
                <UiProgress
                  :label="item.title"
                  label-hidden
                  :value="item.progress ?? 0"
                  :value-text="
                    Number.isFinite(item.progress)
                      ? `${Math.round(item.progress)}%`
                      : ''
                  "
                  :indeterminate="!Number.isFinite(item.progress)"
                />
                <span v-if="Number.isFinite(item.progress)" aria-hidden="true"
                  >{{ Math.round(item.progress) }}%</span
                >
              </div>
            </template>
          </UiNotice>
        </div>
      </article>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.ui-notification-host[hidden] {
  display: none;
}

.ui-notification-host__progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  padding-block-start: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-variant-numeric: tabular-nums;
}

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
  container-type: inline-size;
  container-name: ui-notification;
  gap: var(--ui-notification-stack-gap);
  pointer-events: none;
}

.ui-notification-host__item {
  --ui-notification-motion-y: 0;
  --ui-notification-swipe-exit-x: 0;

  position: relative;
  min-inline-size: 0;
  max-inline-size: 100%;
  border-radius: var(--ui-radius-lg);
  overflow: clip;
  opacity: 1;
  pointer-events: auto;
  -webkit-user-select: none;
  user-select: none;
  transform: translate3d(0, var(--ui-notification-motion-y), 0);
  transition: transform var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.ui-notification-host__card {
  min-inline-size: 0;
  border-radius: inherit;
  background: var(--ui-color-surface-raised);
  transform: translate3d(var(--ui-notification-drag-x, 0), 0, 0);
  transition: transform var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.ui-notification-host__item--swipeable {
  touch-action: pan-y;
  cursor: grab;
}

.ui-notification-host__item:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-notification-host__item--dragging .ui-notification-host__card {
  cursor: grabbing;
  will-change: transform;
  transition: none;
}

.ui-notification-host__notice {
  inline-size: 100%;
}

.ui-notification-enter-active {
  will-change: transform;
  transition: transform var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.ui-notification-leave-active {
  position: absolute;
  inline-size: 100%;
  pointer-events: none;
  will-change: transform;
  transition: transform var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.ui-notification-leave-active .ui-notification-host__card {
  transition: transform var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.ui-notification-host__item--swipe-dismissed.ui-notification-leave-to {
  --ui-notification-motion-y: 0;
}

.ui-notification-host__item--swipe-dismissed.ui-notification-leave-to
  .ui-notification-host__card {
  transform: translate3d(var(--ui-notification-swipe-exit-x), 0, 0);
}

.ui-notification-move {
  transition: transform var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.ui-notification-enter-from,
.ui-notification-leave-to {
  --ui-notification-motion-y: var(--ui-notification-motion-offset);
}

:global(:root[data-ui-motion='reduced'] .ui-notification-host__item) {
  --ui-notification-motion-y: 0;

  opacity: 1;
  will-change: auto;
  transition: none;
}

:global(:root[data-ui-motion='reduced'] .ui-notification-host__card) {
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

  .ui-notification-host__item .ui-notification-host__card {
    will-change: auto;
    transition: none;
  }
}
</style>
