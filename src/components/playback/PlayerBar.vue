<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  ListMusic,
  MicVocal,
  Minus,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
} from '../../icons/index.js';
import { usePlaybackQueue } from '../../composables/usePlaybackQueue.js';
import {
  PITCH_CENTS_RANGE,
  PLAYBACK_MODES,
  TEMPO_RATE_RANGE,
  TRANSPOSE_SEMITONES_RANGE,
  usePlayer,
} from '../../composables/usePlayer.js';
import { formatDuration } from '../../utils/format.js';
import { toPlayableTrack } from '../../utils/playableTrack.js';
import QueuePanel from '../queue/QueuePanel.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const {
  state,
  playTrack,
  toggle,
  seek,
  restartTrack,
  setVolume,
  toggleMute,
  cyclePlaybackMode,
  toggleGuideVocal,
  setTransposeSemitones,
  setPitchCents,
  setTempoRate,
  onEnded,
} = usePlayer();
const {
  state: queueState,
  canGoNext,
  previousTrack,
  nextTrack,
  restartSourceQueue,
  toggleShuffle,
} = usePlaybackQueue();

const isQueueOpen = ref(false);
const isPitchTempoOpen = ref(false);

const progress = computed({
  get: () => state.currentTime,
  set: (value) => seek(Number(value)),
});

const volume = computed({
  get: () => state.volume,
  set: (value) => setVolume(Number(value)),
});

const volumePercent = computed(() => Math.round(state.volume * 100));
const canShuffle = computed(() => queueState.tracks.length > 1);
const playbackModeIcon = computed(() =>
  state.playbackMode === PLAYBACK_MODES.repeatOne ? Repeat1 : Repeat,
);
const playbackModeActionLabel = computed(() => {
  if (state.playbackMode === PLAYBACK_MODES.repeatList) {
    return '啟用單曲循環';
  }
  if (state.playbackMode === PLAYBACK_MODES.repeatOne) {
    return '停用重複播放';
  }
  return '啟用重複播放';
});
const playbackModeActive = computed(
  () => state.playbackMode !== PLAYBACK_MODES.sequence,
);

const showGuideVocal = computed(() => Boolean(state.track?.usesSeparatedAudio));

const transposeLabel = computed(() =>
  state.transposeSemitones > 0
    ? `+${state.transposeSemitones}`
    : `${state.transposeSemitones}`,
);
// Spelled out, not "¢" — reads unambiguously as a pitch unit, not
// currency, and stays visually distinct from transposeLabel's integer.
const pitchCentsLabel = computed(
  () => `${state.pitchCents > 0 ? '+' : ''}${state.pitchCents} cents`,
);
// A4 (440Hz) shifted by the cents offset — the reference tuning musicians
// actually tune to. Reflects pitchCents only; Transpose has its own row.
const A4_REFERENCE_HZ = 440;
const pitchReferenceHz = computed(() =>
  (A4_REFERENCE_HZ * 2 ** (state.pitchCents / 1200)).toFixed(1),
);
const tempoLabel = computed(() => `${state.tempoRate.toFixed(2)}x`);
const pitchTempoActive = computed(
  () =>
    isPitchTempoOpen.value ||
    state.transposeSemitones !== 0 ||
    state.pitchCents !== 0 ||
    state.tempoRate !== 1,
);

function adjustTranspose(delta) {
  setTransposeSemitones(state.transposeSemitones + delta);
}

function adjustPitchCents(delta) {
  setPitchCents(state.pitchCents + delta);
}

function adjustTempo(delta) {
  // Snap to the nearest 0.05 — repeated +/-0.05 float adds would otherwise
  // drift, same reasoning as adjustVolume's 1% snap in
  // useKeyboardShortcuts.js.
  setTempoRate(Math.round((state.tempoRate + delta) * 20) / 20);
}

// Drives the three pitch-tempo rows (Transpose/Pitch/Speed) via v-for —
// they used to be ~135 lines of copy-pasted template for three
// parameterizations of the same "label + value + reset / minus + range +
// plus" row. A computed (not a plain array) so it re-evaluates whenever
// `state` changes. Each row carries the current value plus a setter
// callback rather than a `computed({ get, set })` ref (what a v-model
// slider would normally use) — a ref nested inside a plain array element
// doesn't auto-unwrap in the template the way a top-level one does, so
// this sidesteps that instead of relying on every caller remembering to
// write `row.slider.value`.
const pitchTempoRows = computed(() => [
  {
    key: 'transpose',
    label: 'Transpose',
    value: transposeLabel.value,
    secondaryValue: null,
    resetDisabled: !state.track || state.transposeSemitones === 0,
    resetTitle: '重設變調',
    onReset: () => setTransposeSemitones(0),
    minusDisabled:
      !state.track || state.transposeSemitones <= TRANSPOSE_SEMITONES_RANGE.min,
    minusLabel: '降半音',
    minusTitle: '降半音 (Ctrl+↓)',
    onMinus: () => adjustTranspose(-1),
    sliderValue: state.transposeSemitones,
    min: TRANSPOSE_SEMITONES_RANGE.min,
    max: TRANSPOSE_SEMITONES_RANGE.max,
    step: 1,
    sliderLabel: '變調(半音)',
    onSliderInput: (value) => setTransposeSemitones(Number(value)),
    plusDisabled:
      !state.track || state.transposeSemitones >= TRANSPOSE_SEMITONES_RANGE.max,
    plusLabel: '升半音',
    plusTitle: '升半音 (Ctrl+↑)',
    onPlus: () => adjustTranspose(1),
  },
  {
    key: 'pitch',
    label: 'Pitch',
    value: pitchCentsLabel.value,
    secondaryValue: `· ${pitchReferenceHz.value} Hz`,
    resetDisabled: !state.track || state.pitchCents === 0,
    resetTitle: '重設音高微調',
    onReset: () => setPitchCents(0),
    minusDisabled: !state.track || state.pitchCents <= PITCH_CENTS_RANGE.min,
    minusLabel: '音高微調降低',
    minusTitle: '音高微調降低',
    onMinus: () => adjustPitchCents(-1),
    sliderValue: state.pitchCents,
    min: PITCH_CENTS_RANGE.min,
    max: PITCH_CENTS_RANGE.max,
    step: 1,
    sliderLabel: '音高(音分微調)',
    onSliderInput: (value) => setPitchCents(Number(value)),
    plusDisabled: !state.track || state.pitchCents >= PITCH_CENTS_RANGE.max,
    plusLabel: '音高微調提高',
    plusTitle: '音高微調提高',
    onPlus: () => adjustPitchCents(1),
  },
  {
    key: 'tempo',
    label: 'Speed',
    value: tempoLabel.value,
    secondaryValue: null,
    resetDisabled: !state.track || state.tempoRate === 1,
    resetTitle: '重設變速',
    onReset: () => setTempoRate(1),
    minusDisabled: !state.track || state.tempoRate <= TEMPO_RATE_RANGE.min,
    minusLabel: '放慢',
    minusTitle: '放慢 (Ctrl+Shift+↓)',
    onMinus: () => adjustTempo(-0.05),
    sliderValue: state.tempoRate,
    min: TEMPO_RATE_RANGE.min,
    max: TEMPO_RATE_RANGE.max,
    step: 0.05,
    sliderLabel: '變速',
    onSliderInput: (value) => setTempoRate(Number(value)),
    plusDisabled: !state.track || state.tempoRate >= TEMPO_RATE_RANGE.max,
    plusLabel: '加快',
    plusTitle: '加快 (Ctrl+Shift+↑)',
    onPlus: () => adjustTempo(0.05),
  },
]);

function playQueuedTrack(track) {
  if (!track) return;
  playTrack(toPlayableTrack(track));
}

function playPrevious() {
  const previous = previousTrack();
  if (previous) {
    playQueuedTrack(previous);
    return;
  }

  restartTrack();
}

function playNext() {
  playQueuedTrack(nextTrack());
}

function playNextAfterEnded() {
  const next =
    nextTrack() ||
    (state.playbackMode === PLAYBACK_MODES.repeatList
      ? restartSourceQueue()
      : null);
  playQueuedTrack(next);
}

// Both panels float in the same spot (position: fixed below), so only one
// can be open at a time.
function toggleQueuePanel() {
  isQueueOpen.value = !isQueueOpen.value;
  if (isQueueOpen.value) isPitchTempoOpen.value = false;
}

function togglePitchTempoPanel() {
  isPitchTempoOpen.value = !isPitchTempoOpen.value;
  if (isPitchTempoOpen.value) isQueueOpen.value = false;
}

let unsubscribeEnded;

onMounted(() => {
  unsubscribeEnded = onEnded(playNextAfterEnded);
});

onUnmounted(() => {
  unsubscribeEnded?.();
});
</script>

<template>
  <div class="player-bar" role="region" aria-label="播放控制列">
    <div class="player-bar__track">
      <UiTrackThumb
        v-if="state.track"
        class="player-bar__artwork"
        :track="state.track"
        :size="52"
        font-size="var(--ui-font-size-lg)"
      />
      <div class="player-bar__track-copy">
        <template v-if="state.track">
          <UiMarqueeText
            class="player-bar__track-title"
            :text="state.track.title"
          />
          <span v-if="state.track.artist" class="player-bar__track-artist">
            {{ state.track.artist }}
          </span>
        </template>
      </div>
    </div>

    <div class="player-bar__center">
      <div class="player-bar__transport">
        <UiButton
          :icon="Shuffle"
          :active="queueState.isShuffle"
          :disabled="!canShuffle"
          :aria-label="queueState.isShuffle ? '關閉隨機播放' : '開啟隨機播放'"
          :aria-pressed="queueState.isShuffle"
          title="隨機播放"
          @click="toggleShuffle"
        />
        <UiButton
          :icon="SkipBack"
          :disabled="!state.track"
          aria-label="上一首"
          title="上一首"
          @click="playPrevious"
        />
        <UiIconButton
          :icon="state.isPlaying ? Pause : Play"
          :disabled="!state.track"
          :label="state.isPlaying ? '暫停' : '播放'"
          class="player-bar__play"
          shape="circle"
          size="lg"
          variant="accent"
          @click="toggle"
        />
        <UiButton
          :icon="SkipForward"
          :disabled="!canGoNext"
          aria-label="下一首"
          title="下一首"
          @click="playNext"
        />
        <UiButton
          :icon="playbackModeIcon"
          :active="playbackModeActive"
          :aria-label="playbackModeActionLabel"
          :aria-pressed="playbackModeActive"
          :title="playbackModeActionLabel"
          @click="cyclePlaybackMode"
        />
      </div>

      <div class="player-bar__progress">
        <span class="player-bar__time">{{
          formatDuration(state.currentTime)
        }}</span>
        <input
          v-model="progress"
          type="range"
          min="0"
          :max="state.duration || 0"
          step="0.1"
          :disabled="!state.track"
          aria-label="播放進度"
          :aria-valuetext="`${formatDuration(state.currentTime)} / ${formatDuration(state.duration)}`"
        />
        <span class="player-bar__time player-bar__time--end">{{
          formatDuration(state.duration)
        }}</span>
      </div>
    </div>

    <div class="player-bar__extras">
      <UiButton
        v-if="showGuideVocal"
        :icon="MicVocal"
        :active="state.guideVocalLevel > 0"
        :aria-label="state.guideVocalLevel > 0 ? '關閉導唱' : '開啟導唱'"
        :aria-pressed="state.guideVocalLevel > 0"
        title="開關導唱(分離後) (G)"
        @click="toggleGuideVocal"
      />

      <UiButton
        :icon="SlidersHorizontal"
        :active="pitchTempoActive"
        :aria-label="isPitchTempoOpen ? '關閉變調變速' : '開啟變調變速'"
        :aria-pressed="isPitchTempoOpen"
        title="Pitch & Tempo"
        @click="togglePitchTempoPanel"
      />

      <UiButton
        :icon="ListMusic"
        :active="isQueueOpen"
        :aria-label="isQueueOpen ? '關閉播放佇列' : '開啟播放佇列'"
        :aria-pressed="isQueueOpen"
        title="播放佇列"
        @click="toggleQueuePanel"
      />

      <div class="player-bar__volume">
        <UiButton
          :icon="state.isMuted || state.volume === 0 ? VolumeX : Volume2"
          :aria-label="state.isMuted ? '取消靜音' : '靜音'"
          :aria-pressed="state.isMuted"
          title="靜音 / 取消靜音 (M)"
          @click="toggleMute"
        />
        <input
          v-model="volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          aria-label="音量"
          :aria-valuetext="`${volumePercent}%`"
        />
        <span class="player-bar__volume-value">{{ volumePercent }}%</span>
      </div>
    </div>

    <QueuePanel :open="isQueueOpen" @close="isQueueOpen = false" />

    <div
      v-show="isPitchTempoOpen"
      class="pitch-tempo-panel"
      aria-label="變調、音高與變速"
    >
      <header class="pitch-tempo-panel__header">
        <h2 class="pitch-tempo-panel__title">Pitch & Tempo</h2>
        <UiButton
          :icon="X"
          aria-label="關閉變調變速面板"
          title="關閉"
          @click="isPitchTempoOpen = false"
        />
      </header>

      <div
        v-for="row in pitchTempoRows"
        :key="row.key"
        class="pitch-tempo-panel__row"
      >
        <div class="pitch-tempo-panel__row-header">
          <span class="pitch-tempo-panel__label">{{ row.label }}</span>
          <span class="pitch-tempo-panel__value"
            >{{ row.value
            }}<span
              v-if="row.secondaryValue"
              class="pitch-tempo-panel__value-secondary"
              >{{ row.secondaryValue }}</span
            ></span
          >
          <UiButton
            :icon="RotateCcw"
            :disabled="row.resetDisabled"
            :aria-label="row.resetTitle"
            :title="row.resetTitle"
            @click="row.onReset"
          />
        </div>
        <div class="pitch-tempo-panel__control">
          <UiButton
            :icon="Minus"
            :disabled="row.minusDisabled"
            :aria-label="row.minusLabel"
            :title="row.minusTitle"
            @click="row.onMinus"
          />
          <input
            type="range"
            :value="row.sliderValue"
            :min="row.min"
            :max="row.max"
            :step="row.step"
            :disabled="!state.track"
            :aria-label="row.sliderLabel"
            :aria-valuetext="row.value"
            @input="row.onSliderInput($event.target.value)"
          />
          <UiButton
            :icon="Plus"
            :disabled="row.plusDisabled"
            :aria-label="row.plusLabel"
            :title="row.plusTitle"
            @click="row.onPlus"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-bar {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  height: var(--ui-player-bar-height);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: var(--ui-color-surface);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
  /* Otherwise dragging a slider triggers native text selection, which can
     swallow a click on a nearby button instead of registering it. */
  user-select: none;
}

.player-bar__track {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.player-bar__track-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.player-bar__track-empty {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

.player-bar__track-title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
}

.player-bar__track-artist {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

/* Cap progress width on wide windows. */
.player-bar__center {
  flex: 2;
  max-width: 24rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-space-1);
}

.player-bar__transport {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.player-bar__progress {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.player-bar__progress input {
  flex: 1;
}

/* Fixed width prevents 9:59 -> 10:00 from shifting the slider. */
.player-bar__time {
  flex-shrink: 0;
  width: 5ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  font-variant-numeric: tabular-nums;
}

.player-bar__time--end {
  text-align: right;
}

/* Mirror left flex sizing while allowing content to shrink. */
.player-bar__extras {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex: 1;
  min-width: 0;
  justify-content: flex-end;
}

.player-bar__volume {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.player-bar__volume input {
  width: 5rem; /* rem, not px: see .player-bar__center's max-width above */
}

.player-bar__volume-value {
  flex-shrink: 0;
  width: 4ch;
  text-align: right;
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

/* Same fixed bottom-right float as QueuePanel's .queue-panel
   (mutually exclusive, see togglePitchTempoPanel) — no shared component
   since this has no drag/drop or list to justify one. */
.pitch-tempo-panel {
  position: fixed;
  right: var(--ui-space-3);
  bottom: calc(var(--ui-player-bar-height) + var(--ui-space-3));
  z-index: var(--ui-z-dropdown);
  width: min(280px, calc(100vw - var(--ui-space-5)));
  padding: var(--ui-space-4);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
  box-shadow: var(--ui-shadow-overlay);
}

.pitch-tempo-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-4);
}

.pitch-tempo-panel__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
}

/* Rows are two lines each (header, control) — tighter than the old
   three/four-line stack, so the gap between rows can be tighter too. */
.pitch-tempo-panel__row + .pitch-tempo-panel__row {
  margin-top: var(--ui-space-3);
}

.pitch-tempo-panel__row-header {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-1);
}

.pitch-tempo-panel__label {
  flex: 1;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

/* Inline with the label instead of a separate centered line. The reset
   button stays always-rendered (disabled at default, not v-if'd) so it
   doesn't pop in/out and shift the row. */
.pitch-tempo-panel__value {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  font-variant-numeric: tabular-nums;
}

/* Folded into Pitch's value line (see pitchReferenceHz) instead of its
   own row — supplementary info gets muted/lighter weight, not a new row. */
.pitch-tempo-panel__value-secondary {
  margin-left: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: normal;
  font-variant-numeric: tabular-nums;
}

.pitch-tempo-panel__control {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.pitch-tempo-panel__control input {
  flex: 1;
}
</style>
