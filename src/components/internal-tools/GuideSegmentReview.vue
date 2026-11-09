<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue';
import { PeakAccumulator } from '../../../shared/waveform/peaks.mjs';
import { waveformPath } from '../../utils/waveformPresentation.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiRange from '../ui/UiRange.vue';
import {
  applyGuideOctaveMarks,
  clipGuideContour,
  guideContourPath,
  guideContours,
  guideNotes,
  guideSilenceRanges,
  maskGuideContours,
} from './singAlongPitchPlot.js';

const props = defineProps({
  access: { type: Object, required: true },
  centerMs: { type: Number, required: true },
  durationMs: { type: Number, required: true },
  playbackActive: { type: Boolean, default: false },
});
const emit = defineEmits(['back', 'pause', 'marks']);
const backButton = useTemplateRef('backButton');
const tracks = [
  { id: 'original', name: '原曲' },
  { id: 'guide', name: '導唱' },
  { id: 'backing', name: '伴奏' },
];
const labels = {
  voice: '有人聲',
  'no-voice': '無人聲',
  unsure: '不確定',
  'octave-up': '升八度',
  'octave-down': '降八度',
};
const uid = useId();
const clip = shallowRef(null);
const marks = shallowRef([]);
const from = shallowRef(0);
const to = shallowRef(0);
const pending = shallowRef(false);
const saving = shallowRef(false);
const status = shallowRef('');
const audition = shallowRef('');
const lastTrack = shallowRef('guide');
const playhead = shallowRef(null);
let center = props.centerMs;
let requestId = null;
let context = null;
let player = null;
let playVersion = 0;
let animation = 0;
let pointer = null;

const span = computed(() =>
  clip.value ? clip.value.toMs - clip.value.fromMs : 0,
);
const validSelection = computed(() => to.value - from.value >= 16);
const x = (time) => ((time - clip.value.fromMs) / span.value) * 640;
const selected = computed(() =>
  clip.value ? { x: x(from.value), width: x(to.value) - x(from.value) } : null,
);
const visibleMarks = computed(() =>
  marks.value.filter(
    (mark) =>
      clip.value &&
      mark.fromMs >= clip.value.fromMs &&
      mark.toMs <= clip.value.toMs,
  ),
);

function timeLabel(ms) {
  const seconds = Math.max(0, ms) / 1000;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;
}

const waveforms = computed(() => {
  const data = clip.value;
  if (!data) return [];
  return tracks.map(({ id, name }) => {
    const samples = data.tracks[id];
    const durationSec = samples.length / data.sampleRate;
    const collector = new PeakAccumulator(
      {
        durationSec,
        sampleRate: data.sampleRate,
        channels: 1,
        inputBytes: samples.byteLength,
      },
      { detailStartSec: 0 },
    );
    for (const integer of samples) {
      const sample = integer / 32768;
      collector.record(sample, sample, sample ** 2);
    }
    const { detail, frames, sampleRate } = collector.finish();
    return {
      id,
      name,
      path: waveformPath(
        { peaks: detail, frames, sampleRate },
        {
          fromMs: 0,
          toMs: durationSec * 1000,
        },
      ),
    };
  });
});

const confirmedSilence = computed(() => guideSilenceRanges(marks.value));
const visibleSilence = computed(() => {
  const data = clip.value;
  if (!data) return [];
  return confirmedSilence.value
    .map(([from, to]) => ({
      fromMs: Math.max(data.fromMs, Math.round(from * 1000)),
      toMs: Math.min(data.toMs, Math.round(to * 1000)),
    }))
    .filter(({ fromMs, toMs }) => toMs > fromMs);
});

const contours = computed(() => {
  const data = clip.value;
  if (!data) return [];
  const shift = data.pitchFromMs / 1000;
  const lanes = [
    guideContours(data.baseline, data.stepSeconds),
    maskGuideContours(
      guideNotes(
        applyGuideOctaveMarks(
          data.shown,
          data.stepSeconds,
          marks.value,
          data.pitchFromMs,
        ),
        data.stepSeconds,
      ),
      confirmedSilence.value.map(([from, to]) => [from - shift, to - shift]),
    ),
  ].map((bands) =>
    bands
      .filter(
        (band) =>
          (band.end + shift) * 1000 > data.fromMs &&
          (band.start + shift) * 1000 < data.toMs,
      )
      .map((band) =>
        clipGuideContour(
          band,
          data.fromMs / 1000 - shift,
          data.toMs / 1000 - shift,
        ),
      ),
  );
  const midis = lanes.flatMap((lane) =>
    lane.flatMap((band) => band.points.map((point) => point.midi)),
  );
  const low = Math.min(48, ...midis) - 2;
  const high = Math.max(72, ...midis) + 2;
  return lanes.map((lane) =>
    lane
      .map(({ points }) =>
        guideContourPath(
          points,
          (seconds) => x((seconds + shift) * 1000),
          (midi) => 8 + (48 * (high - midi)) / (high - low),
        ),
      )
      .join(''),
  );
});

const removals = computed(() => {
  const data = clip.value;
  if (!data?.maskApplied) return [];
  const result = [];
  const stepMs = data.stepSeconds * 1000;
  let start = null;
  for (let i = 0; i <= data.baseline.length; i++) {
    const time = Math.round(data.pitchFromMs + i * stepMs);
    if (data.baseline[i] > 0 && data.shown[i] === 0) {
      start ??= Math.max(data.fromMs, time);
    } else if (start !== null) {
      const end = Math.min(data.toMs, time);
      if (end - start >= 16) result.push({ fromMs: start, toMs: end });
      start = null;
    }
  }
  return result;
});

function stopAudition() {
  playVersion++;
  cancelAnimationFrame(animation);
  audition.value = '';
  playhead.value = null;
  if (!player) return;
  player.onended = null;
  player.stop();
  player.disconnect();
  player = null;
}

async function play(track, withContext = false) {
  stopAudition();
  const data = clip.value;
  if (!data || props.playbackActive || !validSelection.value) return;
  const start = Math.max(data.fromMs, from.value - (withContext ? 600 : 0));
  const end = Math.min(data.toMs, to.value + (withContext ? 600 : 0));
  const version = playVersion;
  try {
    context ??= new AudioContext({ latencyHint: 'interactive' });
    await context.resume();
    if (version !== playVersion || props.playbackActive) return;
    const samples = data.tracks[track];
    const buffer = context.createBuffer(1, samples.length, data.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    node.start(0, (start - data.fromMs) / 1000, (end - start) / 1000);
    player = node;
    player.onended = stopAudition;
    lastTrack.value = track;
    audition.value = track;
    const at = context.currentTime;
    function tick() {
      playhead.value = Math.min(end, start + (context.currentTime - at) * 1000);
      animation = requestAnimationFrame(tick);
    }
    tick();
  } catch {
    if (version === playVersion) {
      stopAudition();
      status.value = '無法試聽這個聲道。';
    }
  }
}

function select(start, end) {
  stopAudition();
  from.value = start;
  to.value = end;
}

function stopReview() {
  stopAudition();
  if (requestId) void props.access.cancelGuideReview(requestId).catch(() => {});
  requestId = null;
}

async function load(position) {
  stopReview();
  center = position;
  clip.value = null;
  pending.value = true;
  status.value = '正在讀取三軌片段…';
  const id = crypto.randomUUID();
  requestId = id;
  try {
    const result = await props.access.loadGuideReview(id, position);
    if (id !== requestId) return;
    if (result?.status !== 'ready') {
      status.value =
        result?.status === 'source-unavailable'
          ? '找不到同版原曲與分離音源。'
          : '無法讀取片段，請重試。';
      return;
    }
    clip.value = result;
    marks.value = result.marks;
    select(
      Math.max(result.fromMs, Math.min(result.toMs - 16, position - 400)),
      Math.min(result.toMs, Math.max(result.fromMs + 16, position + 400)),
    );
    status.value = result.canSave ? '' : '這個音源的標記檔目前無法儲存。';
  } catch {
    if (id === requestId) status.value = '無法讀取片段，請重試。';
  } finally {
    if (id === requestId) pending.value = false;
  }
}

async function save(label) {
  const id = requestId;
  if (!id || saving.value || !validSelection.value) return;
  saving.value = true;
  try {
    const result = await props.access.markGuideReview(
      id,
      from.value,
      to.value,
      label,
    );
    if (id !== requestId) return;
    if (result?.status !== 'saved') {
      status.value =
        result?.status === 'limit'
          ? '這首曲目的標記已達上限。'
          : '無法儲存標記。';
      return;
    }
    const mark = result.mark;
    marks.value = [
      ...marks.value.filter(
        (old) => old.fromMs !== mark.fromMs || old.toMs !== mark.toMs,
      ),
      mark,
    ];
    emit('marks', marks.value);
    status.value = `已儲存「${labels[label]}」。`;
  } catch {
    if (id === requestId) status.value = '無法儲存標記。';
  } finally {
    saving.value = false;
  }
}

function pointerTime(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = Math.max(
    0,
    Math.min(1, (event.clientX - rect.left) / rect.width),
  );
  return clip.value.fromMs + Math.round(span.value * ratio);
}

function beginDrag(event) {
  if (event.button !== 0 || !clip.value) return;
  event.currentTarget.setPointerCapture(event.pointerId);
  pointer = { id: event.pointerId, start: pointerTime(event) };
  moveDrag(event);
}

function moveDrag(event) {
  if (pointer?.id !== event.pointerId) return;
  const end = pointerTime(event);
  select(Math.min(pointer.start, end), Math.max(pointer.start, end));
}

function endDrag(event) {
  if (pointer?.id === event.pointerId) pointer = null;
}

watch(
  () => props.playbackActive,
  (active) => {
    if (active) stopAudition();
  },
);
function stopWhenHidden() {
  if (document.hidden) stopAudition();
}
document.addEventListener('visibilitychange', stopWhenHidden);
onMounted(() => backButton.value?.$el.focus());
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', stopWhenHidden);
  stopReview();
  void context?.close().catch(() => {});
});
void load(center);
</script>

<template>
  <section class="guide-review">
    <header class="guide-review__row">
      <strong>檢查這段</strong>
      <UiButton ref="backButton" variant="secondary" @click="emit('back')"
        >返回</UiButton
      >
    </header>
    <template v-if="clip">
      <div class="guide-review__row">
        <UiButton
          variant="secondary"
          :disabled="clip.fromMs === 0"
          @click="load(Math.max(0, clip.fromMs - 4000))"
          >前一段</UiButton
        >
        <span>{{ timeLabel(clip.fromMs) }} – {{ timeLabel(clip.toMs) }}</span>
        <UiButton
          variant="secondary"
          :disabled="clip.toMs >= durationMs - 100"
          @click="load(Math.min(durationMs, clip.toMs + 4000))"
          >下一段</UiButton
        >
      </div>
      <div class="guide-review__graph">
        <div class="guide-review__labels" aria-hidden="true">
          <span v-for="track in tracks" :key="track.id">{{ track.name }}</span>
          <span>原始音高</span><span>跟唱顯示</span>
        </div>
        <svg
          viewBox="0 0 640 320"
          preserveAspectRatio="none"
          role="img"
          aria-label="三軌波形與遮罩前後音高，拖曳可選擇區間"
          @pointerdown="beginDrag"
          @pointermove="moveDrag"
          @pointerup="endDrag"
          @pointercancel="endDrag"
          @lostpointercapture="endDrag"
        >
          <rect
            v-for="range in removals"
            :key="range.fromMs"
            class="guide-review__removed"
            :x="x(range.fromMs)"
            :width="x(range.toMs) - x(range.fromMs)"
            y="0"
            height="320"
          />
          <rect
            v-for="range in visibleSilence"
            :key="range.fromMs"
            class="guide-review__removed"
            :x="x(range.fromMs)"
            :width="x(range.toMs) - x(range.fromMs)"
            y="256"
            height="64"
          />
          <rect
            class="guide-review__selection"
            :x="selected.x"
            :width="selected.width"
            y="0"
            height="320"
          />
          <path
            v-for="(_, i) in waveforms"
            :key="i"
            class="guide-review__rule"
            :d="`M0 ${32 + 64 * i}H640`"
          />
          <path
            v-for="(track, i) in waveforms"
            :key="track.id"
            class="guide-review__wave"
            :transform="`translate(0 ${64 * i})`"
            :d="track.path"
          />
          <path
            v-for="(path, i) in contours"
            :key="i"
            class="guide-review__pitch"
            :transform="`translate(0 ${64 * (i + 3)})`"
            :d="path"
          />
          <path
            v-if="playhead !== null"
            class="guide-review__cursor"
            :d="`M${x(playhead)} 0V320`"
          />
        </svg>
      </div>
      <UiHint>{{
        clip.maskApplied || visibleSilence.length
          ? '淡橘色標出自動遮罩與確認無人聲的區段。拖曳圖表選段，試聽以原調與原速播放。'
          : '這份音源顯示原始音高。拖曳圖表選段，試聽以原調與原速播放。'
      }}</UiHint>
      <div v-if="removals.length" class="guide-review__actions">
        <UiButton
          v-for="range in removals.slice(0, 8)"
          :key="range.fromMs"
          variant="secondary"
          @click="select(range.fromMs, range.toMs)"
          >{{ timeLabel(range.fromMs) }}–{{ timeLabel(range.toMs) }}</UiButton
        >
      </div>
      <div class="guide-review__ranges">
        <UiRange
          :id="`${uid}-from`"
          label="選段開始"
          :model-value="from"
          :min="clip.fromMs"
          :max="clip.toMs"
          :step="1"
          :value-text="timeLabel(from)"
          @update:model-value="select($event, Math.max(to, $event))"
        />
        <UiRange
          :id="`${uid}-to`"
          label="選段結束"
          :model-value="to"
          :min="clip.fromMs"
          :max="clip.toMs"
          :step="1"
          :value-text="timeLabel(to)"
          @update:model-value="select(Math.min(from, $event), $event)"
        />
      </div>
      <div v-if="playbackActive" class="guide-review__actions">
        <UiHint>試聽會使用獨立聲道。</UiHint>
        <UiButton variant="secondary" @click="emit('pause')"
          >暫停主播放</UiButton
        >
      </div>
      <div class="guide-review__actions">
        <UiButton
          v-for="track in tracks"
          :key="track.id"
          variant="secondary"
          :disabled="!validSelection || playbackActive"
          @click="play(track.id)"
          >聽{{ track.name }}</UiButton
        >
        <UiButton
          variant="secondary"
          :disabled="!validSelection || playbackActive"
          @click="play(lastTrack, true)"
          >聽前後文</UiButton
        >
        <UiButton
          variant="secondary"
          :disabled="!audition"
          @click="stopAudition"
          >停止試聽</UiButton
        >
      </div>
      <div class="guide-review__actions">
        <UiButton
          v-for="(label, key) in labels"
          :key="key"
          variant="secondary"
          :disabled="!validSelection || !clip.canSave || saving"
          @click="save(key)"
          >{{ key.startsWith('octave-') ? label : `標記${label}` }}</UiButton
        >
      </div>
      <div
        v-if="visibleMarks.length"
        class="guide-review__actions"
        aria-label="已儲存的片段標記"
      >
        <UiButton
          v-for="mark in visibleMarks"
          :key="`${mark.fromMs}-${mark.toMs}`"
          variant="secondary"
          @click="select(mark.fromMs, mark.toMs)"
          >{{ timeLabel(mark.fromMs) }}–{{ timeLabel(mark.toMs) }}
          {{ labels[mark.label] }}</UiButton
        >
      </div>
    </template>
    <UiHint v-if="status" role="status">{{ status }}</UiHint>
    <UiButton v-if="!clip && !pending" variant="secondary" @click="load(center)"
      >重試</UiButton
    >
  </section>
</template>

<style scoped>
.guide-review {
  display: grid;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  min-inline-size: 0;
}
.guide-review__row,
.guide-review__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.guide-review__row {
  justify-content: space-between;
}
.guide-review__ranges {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  gap: var(--ui-space-2);
}
.guide-review__graph {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--ui-space-2);
}
.guide-review__labels {
  display: grid;
  grid-template-rows: repeat(5, 1fr);
  align-items: center;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}
.guide-review__graph svg {
  inline-size: 100%;
  block-size: clamp(8rem, 30vh, 12rem);
  touch-action: none;
  cursor: crosshair;
  background: var(--ui-color-canvas);
}
.guide-review__wave,
.guide-review__rule,
.guide-review__pitch,
.guide-review__cursor {
  fill: none;
  vector-effect: non-scaling-stroke;
}
.guide-review__rule {
  stroke: var(--ui-color-border);
}
.guide-review__wave {
  stroke: var(--ui-color-accent);
}
.guide-review__pitch {
  stroke: var(--ui-color-text);
}
.guide-review__selection {
  fill: var(--ui-color-accent);
  opacity: 0.2;
}
.guide-review__removed {
  fill: var(--ui-color-warning);
  opacity: 0.25;
}
.guide-review__cursor {
  stroke: var(--ui-color-warning);
}
</style>
