<script setup>
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import { Minus, Plus } from '../../icons/index.js';
import { formatDuration } from '../../utils/format.js';
import { t } from '../../utils/i18n.js';
import {
  waveformPath,
  waveformRange,
} from '../../utils/waveformPresentation.js';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import WaveformSignal from '../waveform/WaveformSignal.vue';
import TrackVideoSegmentPreview from './TrackVideoSegmentPreview.vue';

const props = defineProps({
  waveforms: { type: Object, required: true },
  audioUrl: { type: String, default: '' },
  videoUrl: { type: String, default: '' },
  offsetMs: { type: Number, required: true },
  segments: { type: Array, default: null },
  reviewRange: { type: Object, default: null },
  disabled: Boolean,
  previewDisabled: Boolean,
});
const emit = defineEmits(['update:offset']);
const duration = computed(() => {
  const { frames, sampleRate } = props.waveforms.source.detail;
  return Math.ceil((frames / sampleRate) * 1000);
});
const center = shallowRef(null);
const span = shallowRef(null);
const selecting = shallowRef(null);
const moving = shallowRef(null);
const previewPosition = shallowRef(null);
const draft = computed(() => moving.value ?? props.offsetMs);
const minimumSpan = 500;
const defaultSpan = 6000;
let gesture;

const viewport = computed(() => {
  if (span.value === null) return { fromMs: 0, toMs: duration.value };
  return waveformRange(
    duration.value,
    center.value - span.value / 2,
    span.value,
  );
});
const viewSpan = computed(() => viewport.value.toMs - viewport.value.fromMs);
const resolution = computed(() =>
  viewSpan.value > 20000 ? 'overview' : 'detail',
);
const source = computed(() => props.waveforms.source[resolution.value]);
const target = computed(() => props.waveforms.target[resolution.value]);
const overview = computed(() => waveformPath(props.waveforms.source.overview));
const sourcePath = computed(() => waveformPath(source.value, viewport.value));
const sourceEnergy = computed(() =>
  waveformPath(source.value, viewport.value, 'rms'),
);
const mapping = (time) => {
  const segments = props.segments;
  const segment =
    segments?.findLast(({ startMs }) => time >= startMs) ?? segments?.[0];
  return draft.value + (segment ? segment.offsetMs - segments[0].offsetMs : 0);
};
const targetPath = computed(() =>
  waveformPath(target.value, viewport.value, 'peaks', mapping),
);
const targetEnergy = computed(() =>
  waveformPath(target.value, viewport.value, 'rms', mapping),
);
const jumps = computed(() =>
  (props.segments ?? [])
    .slice(1)
    .filter(
      ({ startMs }) =>
        startMs >= viewport.value.fromMs && startMs < viewport.value.toMs,
    )
    .map(({ startMs }) => ({ startMs, x: xFor(startMs) })),
);
const box = computed(() => {
  const { fromMs, toMs } = selecting.value ?? viewport.value;
  return {
    x: (fromMs / duration.value) * 640,
    width: ((toMs - fromMs) / duration.value) * 640,
  };
});
const review = computed(() => {
  if (!props.reviewRange) return null;
  const fromMs = Math.max(props.reviewRange.startMs, viewport.value.fromMs);
  const toMs = Math.min(props.reviewRange.endMs, viewport.value.toMs);
  return toMs > fromMs
    ? { x: xFor(fromMs), width: xFor(toMs) - xFor(fromMs) }
    : null;
});
const times = computed(() =>
  [
    viewport.value.fromMs,
    viewport.value.fromMs + viewSpan.value / 2,
    viewport.value.toMs,
  ].map(labelTime),
);

function labelTime(ms) {
  const base = formatDuration(ms / 1000);
  return viewSpan.value <= defaultSpan
    ? `${base}.${String(Math.floor(ms % 1000)).padStart(3, '0')}`
    : base;
}

function xFor(time) {
  return ((time - viewport.value.fromMs) / viewSpan.value) * 640;
}

function focusRange(time, width) {
  center.value = time;
  span.value = Math.min(duration.value, Math.max(minimumSpan, width));
}

function zoom(scale) {
  finish(null, true);
  const { fromMs, toMs } = viewport.value;
  focusRange((fromMs + toMs) / 2, viewSpan.value * scale);
}

function fullSong() {
  finish(null, true);
  span.value = null;
}

function begin(event, kind) {
  if (props.disabled || gesture || event.button !== 0 || !event.isPrimary)
    return;
  const element = event.currentTarget;
  const { left, width } = element.getBoundingClientRect();
  if (!width) return;
  element.focus({ preventScroll: true });
  gesture = {
    element,
    kind,
    left,
    width,
    id: event.pointerId,
    x: event.clientX,
    original: props.offsetMs,
    scale: viewSpan.value / width,
  };
  element.setPointerCapture(event.pointerId);
}

function songTime(x) {
  return Math.round(
    Math.min(1, Math.max(0, (x - gesture.left) / gesture.width)) *
      duration.value,
  );
}

function move(event) {
  if (gesture?.id !== event.pointerId) return;
  const delta = event.clientX - gesture.x;
  if (Math.abs(delta) < 3 && moving.value === null && !selecting.value) return;
  if (gesture.kind === 'offset') {
    moving.value = Math.max(
      -120000,
      Math.min(120000, Math.round(gesture.original - delta * gesture.scale)),
    );
  } else {
    const start = songTime(gesture.x);
    const end = songTime(event.clientX);
    selecting.value = {
      fromMs: Math.min(start, end),
      toMs: Math.max(start, end),
    };
  }
}

function finish(event, cancelled = false) {
  if (!gesture || (event && event.pointerId !== gesture.id)) return;
  const { element, id, kind } = gesture;
  if (!cancelled && !props.disabled) {
    if (kind === 'offset' && moving.value !== null)
      emit('update:offset', moving.value);
    else if (kind === 'select') {
      const selection = selecting.value;
      if (selection)
        focusRange(
          (selection.fromMs + selection.toMs) / 2,
          selection.toMs - selection.fromMs,
        );
      else focusRange(songTime(event.clientX), defaultSpan);
    }
  }
  gesture = null;
  moving.value = null;
  selecting.value = null;
  if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
}

function seekOverview(event) {
  if (props.disabled) return;
  const step = Math.min(viewSpan.value, defaultSpan);
  const current = (viewport.value.fromMs + viewport.value.toMs) / 2;
  const target = {
    ArrowLeft: current - step,
    ArrowRight: current + step,
    Home: 0,
    End: duration.value,
  }[event.key];
  if (target === undefined) return;
  event.preventDefault();
  finish(null, true);
  focusRange(target, step);
}

function cancelGesture(event) {
  if (!gesture) return;
  event.preventDefault();
  event.stopPropagation();
  finish(null, true);
}

watch(
  () => props.waveforms,
  () => {
    fullSong();
    const range = props.reviewRange;
    if (range)
      focusRange(
        (range.startMs + range.endMs) / 2,
        Math.max(defaultSpan, range.endMs - range.startMs),
      );
  },
  { immediate: true },
);
watch(
  () => props.disabled,
  () => finish(null, true),
);
onBeforeUnmount(() => finish(null, true));
</script>

<template>
  <div class="track-video-waveforms" @keydown.esc="cancelGesture">
    <div class="track-video-waveforms__legend">
      <span class="track-video-waveforms__local">{{
        t('trackVideo.waveform.local')
      }}</span>
      <span class="track-video-waveforms__reference">{{
        t('trackVideo.waveform.reference')
      }}</span>
      <span v-if="review" class="track-video-waveforms__review-label">{{
        t('trackVideo.waveform.review')
      }}</span>
      <span v-if="jumps.length" class="track-video-waveforms__jump-label">{{
        t('trackVideo.waveform.jump')
      }}</span>
    </div>
    <svg
      class="track-video-waveforms__overview"
      viewBox="0 0 640 64"
      preserveAspectRatio="none"
      role="group"
      tabindex="0"
      :aria-label="t('trackVideo.waveform.overview')"
      @keydown="seekOverview"
      @pointerdown="begin($event, 'select')"
      @pointermove="move"
      @pointerup="finish($event)"
      @pointercancel="finish($event, true)"
      @lostpointercapture="finish($event, true)"
    >
      <rect
        :x="box.x"
        y="0"
        :width="box.width"
        height="64"
        class="track-video-waveforms__selection"
      />
      <WaveformSignal :peaks="overview" class="track-video-waveforms__local" />
    </svg>
    <div class="track-video-waveforms__controls">
      <UiButton :disabled="disabled || span === null" @click="fullSong">{{
        t('trackVideo.waveform.whole')
      }}</UiButton>
      <UiIconButton
        :icon="Minus"
        :label="t('lyricsEditor.waveform.zoomOut')"
        :disabled="disabled || viewSpan >= duration"
        @click="zoom(2)"
      />
      <UiIconButton
        :icon="Plus"
        :label="t('lyricsEditor.waveform.zoomIn')"
        :disabled="disabled || viewSpan <= minimumSpan"
        @click="zoom(0.5)"
      />
    </div>
    <svg
      class="track-video-waveforms__detail"
      :class="{ 'is-dragging': moving !== null }"
      viewBox="0 0 640 64"
      preserveAspectRatio="none"
      role="img"
      tabindex="-1"
      :aria-label="t('trackVideo.waveform.detail')"
      @pointerdown="begin($event, 'offset')"
      @pointermove="move"
      @pointerup="finish($event)"
      @pointercancel="finish($event, true)"
      @lostpointercapture="finish($event, true)"
    >
      <rect
        v-if="review"
        :x="review.x"
        y="0"
        :width="review.width"
        height="64"
        class="track-video-waveforms__review"
      />
      <line
        x1="0"
        x2="640"
        y1="32"
        y2="32"
        class="track-video-waveforms__baseline"
      />
      <WaveformSignal
        :peaks="sourcePath"
        :energy="sourceEnergy"
        class="track-video-waveforms__local"
      />
      <WaveformSignal
        :peaks="targetPath"
        :energy="targetEnergy"
        class="track-video-waveforms__reference"
      />
      <line
        v-for="jump in jumps"
        :key="jump.startMs"
        :x1="jump.x"
        :x2="jump.x"
        y1="0"
        y2="64"
        class="track-video-waveforms__jump"
      />
      <line
        v-if="previewPosition !== null"
        :x1="xFor(previewPosition)"
        :x2="xFor(previewPosition)"
        y1="0"
        y2="64"
        class="track-video-waveforms__playhead"
      />
    </svg>
    <div
      class="track-video-waveforms__times"
      :aria-label="
        t('trackVideo.waveform.range', { start: times[0], end: times[2] })
      "
    >
      <span v-for="(time, index) in times" :key="index">{{ time }}</span>
    </div>
    <TrackVideoSegmentPreview
      v-if="videoUrl && audioUrl"
      :audio-url="audioUrl"
      :video-url="videoUrl"
      :offset-ms="draft"
      :segments="segments"
      :from-ms="viewport.fromMs"
      :to-ms="viewport.toMs"
      :disabled="disabled || previewDisabled || span === null"
      @position="previewPosition = $event"
    />
  </div>
</template>

<style scoped>
.track-video-waveforms {
  display: grid;
  gap: var(--ui-space-2);
  min-inline-size: 0;
}
.track-video-waveforms__legend,
.track-video-waveforms__controls,
.track-video-waveforms__times {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
}
.track-video-waveforms__legend,
.track-video-waveforms__times {
  font-size: var(--ui-type-caption-size);
  color: var(--ui-color-text-muted);
}
.track-video-waveforms__legend span::before {
  content: '';
  display: inline-block;
  inline-size: var(--ui-space-2);
  block-size: var(--ui-space-1);
  margin-inline-end: var(--ui-space-1);
  background: var(--waveform-signal-color);
}
.track-video-waveforms__local {
  --waveform-signal-color: var(--ui-color-text);
  --waveform-signal-peak-opacity: 0.86;
}
.track-video-waveforms__detail .track-video-waveforms__local {
  --waveform-signal-stroke-width: 2;
}
.track-video-waveforms__reference {
  --waveform-signal-color: var(--ui-color-accent);
  --waveform-signal-peak-opacity: 0.9;
}
.track-video-waveforms__review-label {
  --waveform-signal-color: var(--ui-color-info);
}
.track-video-waveforms__jump-label {
  --waveform-signal-color: var(--ui-color-text-muted);
}
.track-video-waveforms__times {
  justify-content: space-between;
  font-variant-numeric: tabular-nums;
}
.track-video-waveforms__overview,
.track-video-waveforms__detail {
  display: block;
  inline-size: 100%;
  background: var(--ui-color-surface-raised);
  border-radius: var(--ui-radius-sm);
  touch-action: pan-y;
}
.track-video-waveforms__overview {
  block-size: 2.5rem;
  cursor: crosshair;
}
.track-video-waveforms__overview:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}
.track-video-waveforms__detail {
  block-size: 7rem;
  cursor: grab;
}
.track-video-waveforms__detail.is-dragging {
  cursor: grabbing;
}
.track-video-waveforms__selection {
  fill: var(--ui-color-accent-soft);
}
.track-video-waveforms__review {
  fill: var(--ui-color-info-soft);
}
.track-video-waveforms__baseline,
.track-video-waveforms__jump,
.track-video-waveforms__playhead {
  stroke: var(--ui-color-border);
  vector-effect: non-scaling-stroke;
}
.track-video-waveforms__playhead {
  stroke: var(--ui-color-text);
}
.track-video-waveforms__jump {
  stroke: var(--ui-color-text-muted);
  stroke-dasharray: 3 2;
}
</style>
