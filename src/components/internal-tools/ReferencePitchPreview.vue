<script setup>
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import { useLyricsWaveformClock } from '../../composables/lyrics/useLyricsWaveformClock.js';
import { combinedSemitones } from '../../composables/player/usePlayerAudioGraph.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { Search, ZoomIn, ZoomOut } from '../../icons/index.js';
import { formatDuration } from '../../utils/format.js';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import {
  noteName,
  pitchAt,
  pitchCursor,
  pitchPage,
  pitchPlot,
  pitchSpan,
  pitchTimeTicks,
  PITCH_HEIGHT,
} from './referencePitchPlot.js';

const { state, samplePlaybackClock } = usePlayer();
const response = shallowRef(null);
const pending = shallowRef(null);
const windowSeconds = shallowRef(8);
const nextWindowBySeconds = { 4: 8, 8: 16, 16: 4 };
const zoomIconBySeconds = { 4: ZoomIn, 8: Search, 16: ZoomOut };
const nextWindow = computed(() => nextWindowBySeconds[windowSeconds.value]);
const zoomLabel = computed(
  () => `目前顯示 ${windowSeconds.value} 秒，切換為 ${nextWindow.value} 秒`,
);
const pitchOffset = computed(() => {
  const application = state.audioControlApplication;
  const controls =
    application?.applied ??
    (application?.lanes?.monitor === 'applied'
      ? application.requested
      : null) ??
    (state.isPlaying ? null : state);
  return controls
    ? combinedSemitones(
        controls.transposeSemitones ?? 0,
        controls.pitchCents ?? 0,
      )
    : null;
});
const hasGuide = computed(() => Boolean(state.track?.usesSeparatedAudio));
const recipe = computed(() => state.track?.separation?.selectedRecipeId);
const completedAtMs = computed(
  () =>
    Date.parse(state.track?.separation?.results?.[recipe.value]?.completedAt) ||
    0,
);
const sourceIdentity = computed(() => {
  const track = state.track;
  return JSON.stringify([
    track?.id,
    track?.url,
    hasGuide.value,
    recipe.value,
    completedAtMs.value,
    state.playbackRevision,
  ]);
});

function reset() {
  const request = pending.value;
  pending.value = null;
  response.value = null;
  if (request)
    void window.Utawakui?.cancelReferencePitch?.(request).catch(() => {});
}
onBeforeUnmount(reset);

async function prepare(cachedOnly = false) {
  if (!hasGuide.value || pending.value) return;
  const identity = sourceIdentity.value;
  const request = crypto.randomUUID();
  pending.value = request;
  response.value = null;
  try {
    const trackId = state.track.id;
    let result;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (pending.value !== request || sourceIdentity.value !== identity)
        return;
      result = await window.Utawakui?.analyzeReferencePitch?.(
        trackId,
        request,
        cachedOnly,
      );
      if (!cachedOnly || result?.status !== 'busy' || attempt === 5) break;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    if (pending.value === request && sourceIdentity.value === identity) {
      if (cachedOnly && result?.status !== 'ready') return;
      response.value =
        result?.status === 'ready' &&
        (result.recipeId !== recipe.value ||
          result.completedAtMs !== completedAtMs.value)
          ? { status: 'source-changed' }
          : (result ?? { status: 'unavailable' });
    }
  } catch {
    if (!cachedOnly && pending.value === request)
      response.value = { status: 'unavailable' };
  } finally {
    if (pending.value === request) pending.value = null;
  }
}
watch(
  sourceIdentity,
  () => {
    reset();
    void prepare(true);
  },
  { immediate: true },
);

const messages = {
  busy: '音訊分析仍在忙碌，稍後可再試一次。',
  'no-guide': '找不到目前選用的分離導唱。',
  'no-decoder': '請先在設定準備 FFmpeg。',
  'no-model': '這個開發工作區尚未準備 SwiftF0 模型。',
  'gate-disabled': '請先在設定啟用音訊處理。',
  'too-long': '這個原型支援最長 12 分鐘的曲目。',
  'source-changed': '分離結果已更新，請重新產生音高預覽。',
  unavailable: '音高預覽無法產生，可以再試一次。',
};
const result = computed(() => {
  const value = response.value;
  return value?.status === 'ready' &&
    state.duration > 0 &&
    Math.abs(state.duration - value.durationSeconds) < 0.1
    ? value
    : null;
});
const status = computed(() => {
  if (!hasGuide.value) return '請先準備這首歌的分離導唱。';
  if (pending.value) return '正在準備音高預覽…';
  if (result.value) return '';
  if (response.value?.status === 'ready') {
    return state.duration > 0
      ? '導唱與播放器長度不同，請重新載入曲目。'
      : '正在等待播放器載入曲目…';
  }
  return messages[response.value?.status] ?? '';
});
const { position: sampledPositionMs } = useLyricsWaveformClock({
  open: () => Boolean(result.value) && pitchOffset.value !== null,
  trackId: () => state.track?.id,
  positionMs: () => state.currentTime * 1000,
  isPlaying: () => state.playbackPhase === 'playing',
  sample: samplePlaybackClock,
  minFrameIntervalMs: 0,
});
const cursorTime = computed(() =>
  sampledPositionMs.value === null
    ? state.currentTime
    : sampledPositionMs.value / 1000,
);
const page = computed(() =>
  pitchPage(cursorTime.value, state.duration, windowSeconds.value),
);
const span = computed(() =>
  pitchSpan(page.value, state.duration, windowSeconds.value),
);
const ticks = computed(() =>
  pitchTimeTicks(page.value, span.value, windowSeconds.value),
);
const plot = computed(
  () =>
    result.value &&
    pitchOffset.value !== null &&
    pitchPlot(
      result.value.pitches,
      result.value.stepSeconds,
      page.value,
      span.value,
      pitchOffset.value,
    ),
);
const cursor = computed(() =>
  pitchCursor(cursorTime.value, page.value, span.value),
);
const currentNote = computed(() => {
  if (!result.value || pitchOffset.value === null) return '';
  const pitch = pitchAt(
    result.value.pitches,
    result.value.stepSeconds,
    state.currentTime,
    pitchOffset.value,
  );
  if (pitch === null) return '—';
  const note = noteName(pitch);
  const cents = Math.round((pitch - Math.round(pitch)) * 100);
  return cents
    ? `${note} ${cents > 0 ? '+' : '−'}${Math.abs(cents)} 音分`
    : note;
});
</script>

<template>
  <section class="reference-pitch" aria-labelledby="reference-pitch-title">
    <header class="reference-pitch__header">
      <h3 id="reference-pitch-title">音高預覽</h3>
      <div v-if="result" class="reference-pitch__readout">
        <span v-if="currentNote" class="reference-pitch__note">{{
          currentNote
        }}</span>
        <UiIconButton
          :icon="zoomIconBySeconds[windowSeconds]"
          :label="zoomLabel"
          @click="windowSeconds = nextWindow"
        />
      </div>
    </header>
    <template v-if="result">
      <p v-if="!plot" class="reference-pitch__hint" role="status">
        播放音高尚未確認。
      </p>
      <svg
        v-else
        class="reference-pitch__chart"
        viewBox="0 0 352 218"
        role="img"
        :aria-label="
          plot.markers.length
            ? '目前播放調性的音高，菱形標記疑似尖峰'
            : '目前播放調性的音高'
        "
      >
        <g v-for="tick in ticks" :key="tick.time">
          <line
            class="reference-pitch__time-grid"
            :x1="tick.x + 32"
            :x2="tick.x + 32"
            y1="4"
            :y2="PITCH_HEIGHT + 8"
          />
          <text
            class="reference-pitch__axis"
            :x="tick.x + 32"
            y="211"
            :text-anchor="tick.anchor"
          >
            {{ formatDuration(tick.time) }}
          </text>
        </g>
        <g v-for="line in plot.grid" :key="line.label">
          <text class="reference-pitch__axis" x="0" :y="line.y + 10">
            {{ line.label }}
          </text>
          <line
            class="reference-pitch__grid"
            x1="32"
            x2="352"
            :y1="line.y + 5"
            :y2="line.y + 5"
          />
        </g>
        <path
          class="reference-pitch__trace"
          :d="plot.path"
          transform="translate(32 5)"
        />
        <path
          v-for="marker in plot.markers"
          :key="marker.time"
          class="reference-pitch__spike"
          d="M0,-3 L3,0 L0,3 L-3,0 Z"
          :transform="`translate(${marker.x + 32} ${marker.y + 5})`"
        >
          <title>
            {{ marker.time.toFixed(3) }} 秒 · 疑似尖峰 ·
            {{ noteName(marker.midi) }}
          </title>
        </path>
        <line
          class="reference-pitch__cursor"
          :x1="cursor + 32"
          :x2="cursor + 32"
          y1="4"
          :y2="PITCH_HEIGHT + 8"
        />
      </svg>
    </template>
    <template v-else>
      <p v-if="status" class="reference-pitch__hint" role="status">
        {{ status }}
      </p>
      <UiButton
        v-if="hasGuide"
        variant="secondary"
        :loading="Boolean(pending)"
        loading-label="正在準備音高預覽"
        @click="prepare()"
        >開啟音高預覽</UiButton
      >
    </template>
  </section>
</template>

<style scoped>
.reference-pitch {
  display: grid;
  gap: var(--ui-space-2);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
  padding-top: var(--ui-space-3);
}

.reference-pitch__header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-1) var(--ui-space-3);
}

.reference-pitch__readout {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.reference-pitch__header h3,
.reference-pitch__hint {
  margin: 0;
}

.reference-pitch__hint,
.reference-pitch__note {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.reference-pitch__chart {
  width: 100%;
  overflow: visible;
}

.reference-pitch__axis {
  fill: var(--ui-color-text-muted);
  font-size: 14px;
}

.reference-pitch__grid {
  stroke: var(--ui-color-border);
}

.reference-pitch__time-grid {
  stroke: var(--ui-color-border);
  stroke-dasharray: 2 4;
}

.reference-pitch__trace {
  fill: none;
  stroke: var(--ui-color-accent);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.reference-pitch__spike {
  fill: var(--ui-color-warning);
}

.reference-pitch__cursor {
  stroke: var(--ui-color-text);
  stroke-width: 1;
}
</style>
