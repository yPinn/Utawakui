<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { playbackPositionMs } from '../../../shared/presentation/state.mjs';
import { MicVocal, SlidersHorizontal } from '../../icons/index.js';
import PerformerSurface from '../performer/PerformerSurface.vue';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiRange from '../ui/UiRange.vue';
import GuideSegmentReview from './GuideSegmentReview.vue';
import ReferencePitchMicrophone from './ReferencePitchMicrophone.vue';
import {
  microphonePitchPath,
  noteName,
  PITCH_WIDTH,
} from './referencePitchPlot.js';
import {
  applyGuideOctaveMarks,
  createSingAlongClock,
  GUIDE_NOTE_HEIGHT,
  guideNoteGeometry,
  guideNotes,
  guideSilenceRanges,
  guideTechniqueMarkers,
  maskGuideContours,
  SING_ALONG_CURSOR,
  SING_ALONG_SECONDS,
  smoothMicFrames,
  songPitchBounds,
} from './singAlongPitchPlot.js';

const props = defineProps({
  frame: { type: Object, required: true },
  snapshot: { type: Object, default: null },
  readingScale: { type: String, default: 'desk' },
  pending: { type: Boolean, default: false },
});
defineEmits([
  'control',
  'sync-action',
  'update:readingScale',
  'display-boundary',
]);
const correctionMs = defineModel('correctionMs', {
  type: Number,
  required: true,
});
const access = window.UtawakuiPerformer;
const state = computed(() => props.snapshot?.state);
const playback = computed(() => state.value?.playback);
const source = computed(() => props.snapshot?.singAlong);
const duration = computed(() => (playback.value?.durationMs ?? 0) / 1000);
const playing = computed(() => playback.value?.status === 'playing');
const playRequested = computed(() =>
  ['playing', 'buffering', 'seeking'].includes(playback.value?.status),
);
const position = shallowRef(0);
const response = shallowRef(null);
const reviewMarks = shallowRef([]);
const pendingGuide = shallowRef(false);
const toolsOpen = shallowRef(false);
const reviewOpen = shallowRef(false);
const reviewCenterMs = shallowRef(0);
const reviewTrigger = useTemplateRef('reviewTrigger');
const alignmentOpen = shallowRef(false);
const micRunning = shallowRef(false);
const micFrames = shallowRef([]);
const clock = createSingAlongClock();
const continuityKey = computed(() =>
  JSON.stringify([
    playback.value?.track?.id,
    source.value?.playbackRevision,
    source.value?.continuityRevision,
  ]),
);
let requestId = null;
let animation = null;
let continuous = false;

const sourceKey = computed(() =>
  source.value?.guide && props.frame.trackId && duration.value > 0
    ? JSON.stringify([
        props.frame.trackId,
        source.value.playbackRevision,
        source.value.guide.recipeId,
        source.value.guide.completedAtMs,
      ])
    : null,
);
const semitones = computed(() => source.value?.semitones ?? null);
const guide = computed(() =>
  response.value?.status === 'ready'
    ? guideNotes(
        applyGuideOctaveMarks(
          response.value.pitches,
          response.value.stepSeconds,
          reviewMarks.value,
        ),
        response.value.stepSeconds,
      )
    : [],
);
const contours = computed(() =>
  maskGuideContours(guide.value, guideSilenceRanges(reviewMarks.value)),
);
const historySeconds = SING_ALONG_SECONDS * SING_ALONG_CURSOR;
const viewStart = computed(() => position.value - historySeconds);
const viewEnd = computed(() => viewStart.value + SING_ALONG_SECONDS);
const focusPeriod = 4;
const overscan = 0.25;
const focusStart = computed(
  () => Math.floor(position.value / focusPeriod) * focusPeriod - historySeconds,
);
const focusEnd = computed(
  () => focusStart.value + focusPeriod + SING_ALONG_SECONDS,
);
const bounds = computed(() => songPitchBounds(guide.value, semitones.value));
const displayGuide = computed(() => {
  if (semitones.value === null) return [];
  const { low, high } = bounds.value;
  return contours.value.filter(({ points }) => {
    const midi = points[0].midi + semitones.value;
    return midi >= low && midi <= high;
  });
});
const nearbyGuide = computed(() =>
  displayGuide.value.filter(
    ({ start, end }) =>
      end > focusStart.value - overscan && start < focusEnd.value + overscan,
  ),
);
const y = (midi) => {
  const { low, high } = bounds.value;
  return 8 + (104 * (high - midi)) / (high - low);
};
const grid = computed(() => {
  const { low, high } = bounds.value;
  return Array.from({ length: (high - low) / 3 + 1 }, (_, index) => {
    const midi = high - index * 3;
    return {
      midi,
      octave: midi % 12 === 0,
      y: y(midi),
    };
  });
});
const labeledGrid = computed(() => grid.value.filter((line) => line.octave));
const timeToX = (time) => (time * PITCH_WIDTH) / SING_ALONG_SECONDS;
const timelineTransform = computed(
  () => `translate(${-timeToX(viewStart.value)} 0)`,
);
const guideBoxes = computed(() =>
  nearbyGuide.value.map((note) => ({
    start: note.start,
    end: note.end,
    ...guideNoteGeometry(note, timeToX, (midi) => y(midi + semitones.value)),
  })),
);
const annotations = computed(() =>
  guideTechniqueMarkers(
    nearbyGuide.value,
    timeToX,
    focusStart.value - overscan,
    focusEnd.value + overscan,
  ),
);
const techniqueMarks = {
  rise: { path: 'M-2 2L2 -2M0 -2H2V0', label: '上滑音' },
  fall: { path: 'M-2 -2L2 2M0 2H2V0', label: '下滑音' },
  vibrato: { path: 'M-3 0Q-1.5 -3 0 0T3 0', label: '抖音' },
};
const cursor = PITCH_WIDTH * SING_ALONG_CURSOR;
const nearScreen = (time) => time >= focusStart.value && time <= focusEnd.value;
const beats = computed(() =>
  (response.value?.beats ?? []).map(({ timeMs, downbeat }) => ({
    time: timeMs / 1000,
    downbeat,
  })),
);
const visibleBeats = computed(() =>
  beats.value.filter(({ time }) => nearScreen(time)),
);
const lyrics = computed(() => state.value?.lyrics);
const lyricsOffset = computed(() => lyrics.value?.offsetMs ?? 0);
const toMediaTime = (timeMs) => (timeMs - lyricsOffset.value) / 1000;
const lineStarts = computed(() =>
  lyrics.value?.synced === true && lyrics.value.trackId === props.frame.trackId
    ? [
        ...new Set(
          lyrics.value.lines
            .filter((line) => line.text && Number.isFinite(line.startMs))
            .map((line) => toMediaTime(line.startMs))
            .filter((time) => time >= 0),
        ),
      ]
    : [],
);
const visibleLineStarts = computed(() => lineStarts.value.filter(nearScreen));
const wordBand = computed(() => {
  const cue = props.snapshot?.wordCue;
  if (!props.frame.currentWordCue || !cue) return null;
  const start = toMediaTime(cue.startMs);
  const end = toMediaTime(cue.endMs);
  if (position.value < start || position.value >= end) return null;
  return {
    x: timeToX(Math.max(start, viewStart.value) - viewStart.value),
    width: timeToX(
      Math.min(end, viewEnd.value) - Math.max(start, viewStart.value),
    ),
  };
});
const displayMicFrames = computed(() =>
  smoothMicFrames(micFrames.value).map((sample) => ({
    ...sample,
    time: sample.time - correctionMs.value / 1000,
  })),
);
const micPath = computed(() =>
  microphonePitchPath(
    displayMicFrames.value,
    focusStart.value - overscan,
    focusEnd.value - focusStart.value + 2 * overscan,
    y,
    timeToX,
  ),
);
const guideStatus = computed(() => {
  if (!props.frame.trackId) return '請先在主視窗播放曲目。';
  if (!source.value?.guide) return '請在主視窗選用有分離導唱的音源。';
  if (!sourceKey.value) return '等待主播放器載入曲目…';
  if (pendingGuide.value) return '正在準備導唱音高…';
  if (response.value?.status === 'ready')
    return semitones.value === null ? '等待播放器確認調性…' : '';
  return (
    {
      'gate-disabled': '請先在設定啟用音訊處理。',
      'no-decoder': '請先在設定準備 FFmpeg。',
      'no-model': '此開發工作區尚未準備 SwiftF0 模型。',
      'too-long': '導唱音高目前支援最長 12 分鐘的曲目。',
      'no-guide': '找不到目前曲目的分離導唱。',
      busy: '音訊分析忙碌，稍後可重試。',
    }[response.value?.status] ?? '無法準備這首歌的導唱音高。'
  );
});

function clearMic() {
  continuous = false;
  micFrames.value = [];
}

function cancelGuide() {
  const previous = requestId;
  requestId = null;
  pendingGuide.value = false;
  if (previous) void access?.cancelCurrentGuide?.(previous).catch(() => {});
}

async function loadGuide() {
  cancelGuide();
  response.value = null;
  reviewMarks.value = [];
  if (!sourceKey.value || !access?.analyzeCurrentGuide) return;
  const id = crypto.randomUUID();
  const identity = sourceKey.value;
  requestId = id;
  pendingGuide.value = true;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      if (requestId !== id || sourceKey.value !== identity) return;
      const result = await access.analyzeCurrentGuide(id);
      if (requestId !== id || sourceKey.value !== identity) return;
      if (result?.status === 'busy' && attempt < 5) {
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        continue;
      }
      response.value =
        result?.status === 'ready' &&
        Math.abs(result.durationSeconds - duration.value) >= 0.1
          ? { status: 'source-changed' }
          : result;
      reviewMarks.value = response.value?.marks ?? [];
      break;
    }
  } catch {
    if (requestId === id) response.value = { status: 'unavailable' };
  } finally {
    if (requestId === id) {
      requestId = null;
      pendingGuide.value = false;
    }
  }
}

function sampleMic(running, frame) {
  micRunning.value = running;
  if (!frame) {
    clearMic();
    return;
  }
  if (!playing.value || !props.frame.trackId) {
    continuous = false;
    return;
  }
  const time = playbackPositionMs(state.value, Date.now()) / 1000;
  const previous = micFrames.value.at(-1);
  if (previous && time <= previous.time) return;
  micFrames.value = [
    ...micFrames.value.slice(-1199).filter((point) => point.time >= time - 17),
    {
      time,
      atMs: frame.atMs,
      hz: frame.hz,
      continuous: continuous && previous && frame.atMs - previous.atMs <= 150,
    },
  ];
  continuous = true;
}

function tick(frameMs) {
  animation = null;
  position.value = clock.positionAt(frameMs) / 1000;
  if (playing.value) animation = requestAnimationFrame(tick);
}

function openReview() {
  reviewCenterMs.value = Math.round(position.value * 1000);
  reviewOpen.value = true;
}

function returnToTools() {
  reviewOpen.value = false;
  void nextTick(() => reviewTrigger.value?.$el.focus());
}

watch(sourceKey, loadGuide, { immediate: true });
watch(sourceKey, () => {
  if (reviewOpen.value) returnToTools();
});
watch(
  toolsOpen,
  (open) => {
    if (!open) reviewOpen.value = false;
  },
  { flush: 'sync' },
);
watch(
  [
    () => props.frame.trackId,
    () => source.value?.playbackRevision,
    () => source.value?.continuityRevision,
    () => playback.value?.rate,
    semitones,
  ],
  clearMic,
  { flush: 'sync' },
);
watch(
  playing,
  () => {
    continuous = false;
  },
  { flush: 'sync' },
);
watch(
  [state, continuityKey],
  () => {
    const frameMs = performance.now();
    const next = clock.sync(
      state.value,
      continuityKey.value,
      Date.now(),
      frameMs,
    );
    if (!playing.value || animation === null) position.value = next / 1000;
    if (playing.value && animation === null) {
      animation = requestAnimationFrame(tick);
    } else if (!playing.value && animation !== null) {
      cancelAnimationFrame(animation);
      animation = null;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  cancelGuide();
  if (animation !== null) cancelAnimationFrame(animation);
});
</script>

<template>
  <PerformerSurface
    :frame="frame"
    :reading-scale="readingScale"
    :pending="pending"
    @control="$emit('control', $event)"
    @sync-action="$emit('sync-action', $event)"
    @update:reading-scale="$emit('update:readingScale', $event)"
    @display-boundary="$emit('display-boundary', $event)"
  >
    <template #above-cues>
      <figure class="prompter-sing-along__pitch">
        <figcaption v-if="guideStatus" class="prompter-sing-along__status">
          <span role="status">{{ guideStatus }}</span>
          <UiButton
            v-if="sourceKey && !pendingGuide && response?.status !== 'ready'"
            @click="loadGuide"
            >重試</UiButton
          >
        </figcaption>
        <div class="prompter-sing-along__chart">
          <div class="prompter-sing-along__axis" aria-hidden="true">
            <span
              v-for="line in labeledGrid"
              :key="line.midi"
              :style="{ insetBlockStart: `${(line.y / 120) * 100}%` }"
              >{{ noteName(line.midi) }}</span
            >
          </div>
          <svg
            class="prompter-sing-along__plot"
            :viewBox="`0 0 ${PITCH_WIDTH} 120`"
            preserveAspectRatio="none"
            role="img"
            aria-label="目前曲目的導唱空框與麥克風實唱音高"
          >
            <rect
              v-if="wordBand"
              class="prompter-sing-along__word"
              :x="wordBand.x"
              :width="wordBand.width"
              y="0"
              height="120"
            />
            <path
              v-for="line in grid"
              :key="line.midi"
              class="prompter-sing-along__grid"
              :class="{
                'prompter-sing-along__grid--octave': line.octave,
                'prompter-sing-along__grid--minor': !line.octave,
              }"
              :d="`M0 ${line.y}H${PITCH_WIDTH}`"
            />
            <path
              v-if="beats.length"
              class="prompter-sing-along__ruler"
              :d="`M0 116H${PITCH_WIDTH}`"
            />
            <g :transform="timelineTransform">
              <path
                v-for="beat in visibleBeats"
                :key="beat.time"
                :class="
                  beat.downbeat
                    ? 'prompter-sing-along__barline'
                    : 'prompter-sing-along__beat'
                "
                :d="`M${timeToX(beat.time)} ${beat.downbeat ? 4 : 110}V116`"
              />
              <path
                v-for="time in visibleLineStarts"
                :key="time"
                class="prompter-sing-along__phrase"
                :d="`M${timeToX(time)} 0V9`"
              />
              <rect
                v-for="note in guideBoxes"
                :key="note.start"
                class="prompter-sing-along__target"
                :class="{
                  'prompter-sing-along__target--past': position >= note.end,
                  'prompter-sing-along__target--active':
                    position >= note.start && position < note.end,
                }"
                :x="note.x"
                :y="note.y"
                :width="note.width"
                :height="GUIDE_NOTE_HEIGHT"
              />
              <path class="prompter-sing-along__voice" :d="micPath" />
            </g>
            <line
              class="prompter-sing-along__cursor"
              :x1="cursor"
              :x2="cursor"
              y1="0"
              y2="120"
            />
          </svg>
          <svg
            class="prompter-sing-along__annotations"
            :viewBox="`0 0 ${PITCH_WIDTH} 16`"
            preserveAspectRatio="none"
            role="img"
            aria-label="導唱技巧註記"
            :aria-hidden="annotations.length === 0"
          >
            <g :transform="timelineTransform">
              <g
                v-for="mark in annotations"
                :key="mark.start"
                class="prompter-sing-along__annotation"
                :class="{
                  'prompter-sing-along__annotation--active':
                    position >= mark.start && position < mark.end,
                }"
                :transform="`translate(${mark.x} 6)`"
              >
                <title>{{ techniqueMarks[mark.kind].label }}</title>
                <path
                  class="prompter-sing-along__technique"
                  :d="techniqueMarks[mark.kind].path"
                />
                <path class="prompter-sing-along__annotation-stem" d="M0 4V8" />
              </g>
            </g>
          </svg>
        </div>
      </figure>
    </template>
    <template #leading-tools>
      <UiPopover
        v-model:open="toolsOpen"
        keep-mounted
        focus-on-open
        placement="top-end"
        scroll-axis="vertical"
        aria-label="跟唱工具"
        :panel-style="
          reviewOpen
            ? {
                inlineSize: 'min(46rem, calc(100vw - 2rem))',
                '--ui-popover-max-inline-size': '46rem',
              }
            : { inlineSize: 'var(--ui-performer-settings-inline-size)' }
        "
      >
        <template #trigger="{ triggerProps }">
          <UiButton
            v-bind="triggerProps"
            variant="secondary"
            :icon="micRunning ? MicVocal : SlidersHorizontal"
            :active="toolsOpen || micRunning"
            :aria-label="micRunning ? '跟唱工具，麥克風已啟用' : undefined"
            @click="toolsOpen = !toolsOpen"
            >跟唱工具</UiButton
          >
        </template>
        <div v-show="!reviewOpen" class="prompter-sing-along__mic-settings">
          <ReferencePitchMicrophone
            :access="access"
            :list-on-open="toolsOpen && !reviewOpen"
            :playing="playing"
            prefer-system-default
            stop-when-hidden
            @frame="sampleMic"
          />
          <UiDisclosure v-model:open="alignmentOpen" label="時間對齊">
            <UiRange
              id="prompter-mic-correction"
              v-model="correctionMs"
              label="實唱線提前"
              :min="-500"
              :max="500"
              :step="10"
              :value-text="`${correctionMs} ms`"
            />
          </UiDisclosure>
          <UiButton
            v-if="access?.loadGuideReview"
            ref="reviewTrigger"
            variant="secondary"
            :disabled="response?.status !== 'ready'"
            @click="openReview"
            >檢查這段</UiButton
          >
        </div>
        <GuideSegmentReview
          v-if="reviewOpen"
          :access="access"
          :center-ms="reviewCenterMs"
          :duration-ms="Math.round(duration * 1000)"
          :playback-active="playRequested"
          @back="returnToTools"
          @marks="reviewMarks = $event"
          @pause="$emit('control', 'pause')"
        />
      </UiPopover>
    </template>
  </PerformerSurface>
</template>

<style scoped>
.prompter-sing-along__pitch {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
}

.prompter-sing-along__status {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}

.prompter-sing-along__mic-settings {
  display: grid;
  gap: var(--ui-space-2);
}

.prompter-sing-along__status,
.prompter-sing-along__axis {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}

.prompter-sing-along__chart {
  display: grid;
  grid-template-areas:
    '. annotations'
    'axis plot';
  grid-template-columns: 4ch minmax(0, 1fr);
  column-gap: var(--ui-space-2);
}

.prompter-sing-along__axis {
  grid-area: axis;
  position: relative;
}

.prompter-sing-along__axis span {
  position: absolute;
  translate: 0 -50%;
}

.prompter-sing-along__plot {
  grid-area: plot;
  inline-size: 100%;
  block-size: clamp(4rem, 17vh, 6rem);
}

.prompter-sing-along__annotations {
  grid-area: annotations;
  inline-size: 100%;
  block-size: var(--ui-space-4);
}

.prompter-sing-along__plot,
.prompter-sing-along__annotations {
  overflow: hidden;
}

.prompter-sing-along__grid,
.prompter-sing-along__ruler,
.prompter-sing-along__barline,
.prompter-sing-along__beat,
.prompter-sing-along__phrase,
.prompter-sing-along__target,
.prompter-sing-along__technique,
.prompter-sing-along__annotation-stem,
.prompter-sing-along__voice,
.prompter-sing-along__cursor {
  fill: none;
  vector-effect: non-scaling-stroke;
}

.prompter-sing-along__grid {
  stroke: var(--ui-color-border);
}

.prompter-sing-along__grid--minor {
  opacity: 0.55;
}

.prompter-sing-along__grid--octave {
  stroke: var(--ui-color-border-strong);
  opacity: 0.45;
}

.prompter-sing-along__word {
  fill: var(--ui-color-accent-soft);
  opacity: 0.55;
}

.prompter-sing-along__ruler {
  stroke: var(--ui-color-border);
}

.prompter-sing-along__barline,
.prompter-sing-along__beat {
  stroke: var(--ui-color-border-strong);
}

.prompter-sing-along__barline {
  opacity: 0.65;
}

.prompter-sing-along__phrase {
  stroke: var(--ui-color-accent);
  stroke-width: 2;
}

.prompter-sing-along__cursor {
  stroke: var(--ui-color-text-muted);
  stroke-width: 2;
}

.prompter-sing-along__annotation {
  color: var(--ui-color-text-muted);
}
.prompter-sing-along__technique,
.prompter-sing-along__annotation-stem {
  stroke: currentColor;
}
.prompter-sing-along__technique {
  stroke-width: 1.5;
}
.prompter-sing-along__annotation-stem {
  opacity: 0.65;
}
.prompter-sing-along__annotation--active {
  color: var(--ui-color-accent);
}
.prompter-sing-along__target {
  stroke: var(--ui-color-text-muted);
}
.prompter-sing-along__target--past {
  stroke-opacity: 0.62;
}
.prompter-sing-along__target--active {
  stroke: var(--ui-color-accent);
  stroke-width: 2;
}

.prompter-sing-along__voice {
  stroke: var(--ui-color-text);
  stroke-width: 2;
  stroke-linecap: round;
}
</style>
