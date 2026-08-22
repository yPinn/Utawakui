<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  Cable,
  Captions,
  Headphones,
  ListMusic,
  MicVocal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from '../../icons/index.js';
import { useAppView } from '../../composables/useAppView.js';
import { usePlaybackQueue } from '../../composables/usePlaybackQueue.js';
import { useMetronome } from '../../composables/useMetronome.js';
import { useAlbumNavigation } from '../../composables/useAlbumNavigation.js';
import { useAudioOutput } from '../../composables/useAudioOutput.js';
import { useSeparation } from '../../composables/useSeparation.js';
import { PLAYER_BAR_ARTWORK_SIZE } from '../../constants/ui.js';
import {
  SEPARATION_PRESET_SELECT_TITLE,
  separationPresetOptionsFor,
} from '../../constants/separationPresets.js';
import {
  PITCH_CENTS_RANGE,
  PLAYBACK_MODES,
  TEMPO_RATE_RANGE,
  TRANSPOSE_SEMITONES_RANGE,
  usePlayer,
} from '../../composables/usePlayer.js';
import { formatDuration } from '../../utils/format.js';
import { shortenDeviceLabel } from '../../utils/audioDeviceLabel.js';
import { toPlayableTrack } from '../../utils/playableTrack.js';
import PlayerToolsPanel from './PlayerToolsPanel.vue';
import QueuePanel from '../queue/QueuePanel.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiNotice from '../ui/UiNotice.vue';
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
  toggleCaptureGuideVocal,
  setGuideVocalValue,
  setCaptureGuideVocalValue,
  setGuideVocalOn,
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
const { state: metronomeState } = useMetronome();
const { setActiveView } = useAppView();
const { albumForTrack, jumpToAlbum } = useAlbumNavigation();
const { devices: audioOutputDevices, monitorDeviceLabel } = useAudioOutput();
const {
  state: separationState,
  isSeparating,
  presetIdFor,
  progressPercent: separationProgressPercentFor,
  separate,
  selectPreset,
} = useSeparation();

const isQueueOpen = ref(false);
const isPlayerToolsOpen = ref(false);
const activeToolTab = ref('adjust');

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
const currentTrackAlbum = computed(() => albumForTrack(state.track));
const currentTrackAlbumCtaLabel = computed(() => {
  if (!currentTrackAlbum.value) return '';
  return `${state.track?.title || '目前歌曲'}，前往專輯：${
    currentTrackAlbum.value.name || '未命名專輯'
  }`;
});

const showGuideVocal = computed(() => Boolean(state.track?.usesSeparatedAudio));
// Kept mounted (visibility:hidden, not v-if) — .player-bar__extras is a
// fixed-width column now, so this appearing/disappearing would shift the
// centered transport column. See its CSS.
const canQuickToggleCaptureGuideVocal = computed(
  () => showGuideVocal.value && Boolean(state.captureDeviceId),
);

// Real device name for the capture guide-vocal row below, not a fixed
// "擷取" label — the capture chain follows whatever the user picked in
// CaptureDeviceModal.vue. monitorDeviceLabel (the other row's device name)
// now lives in useAudioOutput.js, shared with CaptureDeviceModal.vue's
// "off" option copy.
const captureDeviceLabel = computed(() => {
  if (!state.captureDeviceId) return '';
  const device = audioOutputDevices.value.find(
    (d) => d.deviceId === state.captureDeviceId,
  );
  return shortenDeviceLabel(device?.label) || '擷取裝置';
});

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
const currentSeparationTrack = computed(() => state.track || null);
const selectedSeparationPresetId = computed(() =>
  presetIdFor(currentSeparationTrack.value),
);
const currentSeparationResults = computed(
  () => currentSeparationTrack.value?.separation?.results || {},
);
const currentSeparationPresetOptions = computed(() =>
  separationPresetOptionsFor(currentSeparationTrack.value),
);
const isCurrentTrackSeparating = computed(() =>
  currentSeparationTrack.value
    ? isSeparating(currentSeparationTrack.value.id)
    : false,
);
const currentSeparationProgressPercent = computed(() =>
  currentSeparationTrack.value
    ? separationProgressPercentFor(currentSeparationTrack.value.id)
    : 0,
);
const currentSeparationError = computed(() =>
  currentSeparationTrack.value
    ? (separationState.errors.get(currentSeparationTrack.value.id) ?? '')
    : '',
);
const selectedSeparationHasResult = computed(() =>
  Boolean(currentSeparationResults.value[selectedSeparationPresetId.value]),
);
const playerToolsActive = computed(
  () =>
    isPlayerToolsOpen.value ||
    state.transposeSemitones !== 0 ||
    state.pitchCents !== 0 ||
    state.tempoRate !== 1 ||
    // guideVocalOn defaults to true (see usePlayer.js) so a performer hears
    // it by default once it applies — gated on showGuideVocal so this
    // doesn't light up for every track/on every launch, only when the
    // current track actually has separated audio to mix.
    (showGuideVocal.value &&
      (state.guideVocalOn || state.captureGuideVocalOn)) ||
    isCurrentTrackSeparating.value ||
    metronomeState.isRunning,
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

// Five quick-jump stops plus a fine-grained slider below them — the stops
// alone can't cover it: the "right" level is a mix/hardware-dependent
// judgment call (too loud/too quiet at an exact stop is a real, expected
// case), so fine adjustment still needs to exist. The stops stay coarser
// (25%) than the slider's own step (5%) — they're for fast
// jump-to-known-position, not for replacing the drag. Plain percentages,
// no named-scenario copy (抓Key/對唱/背景音樂 etc.) — the number is
// self-explanatory for a mix control and doesn't need a tooltip to justify
// it.
const GUIDE_VOCAL_STOPS = [
  { value: 0, label: '0%' },
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
];
const GUIDE_VOCAL_STEP = 0.05;

// All five stops (0% included) are plain value picks — on/off is its own
// dedicated control (the row's speaker icon, see guideVocalRows below),
// not something a value of 0 secretly triggers. A single click is never
// fast enough to restart the ramp before it settles, so there's no
// zipper-noise risk to guard against here regardless of value.
function selectMonitorGuideVocalStop(value) {
  setGuideVocalValue(value);
}

function selectCaptureGuideVocalStop(value) {
  setCaptureGuideVocalValue(value);
}

// A slider drag fires far more 'input' events than the audio thread can
// usefully act on — each one restarts vocalGain's exponential ramp (see
// usePlayer.js's rampGain), and restarting it faster than the previous
// ramp can settle produces an audible crackle ("zipper noise"), not a
// smooth glide. Coalescing to one call per animation frame keeps the drag
// feeling responsive while never issuing automation faster than the audio
// thread can render between calls.
function throttleToAnimationFrame(fn) {
  let frameId = null;
  let latestArgs = null;
  return (...args) => {
    latestArgs = args;
    if (frameId !== null) return;
    frameId = requestAnimationFrame(() => {
      frameId = null;
      fn(...latestArgs);
    });
  };
}

const throttledSetGuideVocalLevel = throttleToAnimationFrame((value) =>
  setGuideVocalValue(Number(value)),
);
const throttledSetCaptureGuideVocalLevel = throttleToAnimationFrame((value) =>
  setCaptureGuideVocalValue(Number(value)),
);

// Independent rows for the two output chains (see usePlayer.js's capture
// chain comment) — the capture row only appears once a capture device is
// selected, since there's nothing to preview otherwise (see
// useAudioOutput.js).
const guideVocalRows = computed(() => {
  const rows = [
    {
      key: 'guide-vocal-monitor',
      // Short and fixed — the section label above already says "導唱混音",
      // so the row only needs to say *which* output. The icon carries that
      // distinction; the real device name lives in deviceName (row title
      // tooltip) instead of being crammed into the visible label.
      icon: Headphones,
      label: '監聽',
      deviceName: monitorDeviceLabel.value,
      // Always the calibrated value, regardless of on/off — on/off has its
      // own dedicated speaker icon (onIcon/onToggle below) now, so the
      // number doesn't also need to encode it by dropping to 0 while off.
      value: `${Math.round(state.guideVocalValue * 100)}%`,
      on: state.guideVocalOn,
      onIcon: state.guideVocalOn ? Volume2 : VolumeX,
      onLabel: state.guideVocalOn ? '關閉導唱(監聽)' : '開啟導唱(監聽)',
      onToggle: () => setGuideVocalOn(!state.guideVocalOn),
      stops: GUIDE_VOCAL_STOPS.map((stop) => ({
        ...stop,
        active: state.guideVocalValue === stop.value,
        disabled: !state.track,
        onSelect: () => selectMonitorGuideVocalStop(stop.value),
      })),
      sliderValue: state.guideVocalValue,
      min: 0,
      max: 1,
      step: GUIDE_VOCAL_STEP,
      sliderLabel: '導唱比例(監聽)',
      onSliderInput: throttledSetGuideVocalLevel,
    },
  ];
  if (state.captureDeviceId) {
    rows.push({
      key: 'guide-vocal-capture',
      icon: Cable,
      label: '擷取',
      deviceName: captureDeviceLabel.value,
      value: `${Math.round(state.captureGuideVocalValue * 100)}%`,
      on: state.captureGuideVocalOn,
      onIcon: state.captureGuideVocalOn ? Volume2 : VolumeX,
      onLabel: state.captureGuideVocalOn ? '關閉導唱(擷取)' : '開啟導唱(擷取)',
      onToggle: toggleCaptureGuideVocal,
      stops: GUIDE_VOCAL_STOPS.map((stop) => ({
        ...stop,
        active: state.captureGuideVocalValue === stop.value,
        disabled: !state.track,
        onSelect: () => selectCaptureGuideVocalStop(stop.value),
      })),
      sliderValue: state.captureGuideVocalValue,
      min: 0,
      max: 1,
      step: GUIDE_VOCAL_STEP,
      sliderLabel: '導唱比例(擷取)',
      onSliderInput: throttledSetCaptureGuideVocalLevel,
    });
  }
  return rows;
});

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

function jumpToCurrentTrackAlbum() {
  if (!currentTrackAlbum.value) return;
  jumpToAlbum(state.track);
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

// useLyrics.js already syncs to whatever's playing, so switching tabs is
// enough — no track needs to be passed through.
function showCurrentTrackLyrics() {
  setActiveView('lyrics');
}

function playNextAfterEnded() {
  const next =
    nextTrack() ||
    (state.playbackMode === PLAYBACK_MODES.repeatList
      ? restartSourceQueue()
      : null);
  playQueuedTrack(next);
}

function selectSeparationPreset(presetId) {
  const track = currentSeparationTrack.value;
  if (!track) return;
  selectPreset(track, presetId);
}

function generateSeparation() {
  const track = currentSeparationTrack.value;
  if (!track) return;
  separate(track, selectedSeparationPresetId.value);
}

// Both panels float in the same spot (position: fixed below), so only one
// can be open at a time.
function toggleQueuePanel() {
  isQueueOpen.value = !isQueueOpen.value;
  if (isQueueOpen.value) isPlayerToolsOpen.value = false;
}

function togglePlayerToolsPanel() {
  isPlayerToolsOpen.value = !isPlayerToolsOpen.value;
  if (isPlayerToolsOpen.value) isQueueOpen.value = false;
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
    <UiNotice
      v-if="state.error"
      class="player-bar__notice"
      tone="danger"
      title="播放未完成"
      :message="state.error"
      action-label="重試"
      compact
      @action="toggle"
    />
    <div class="player-bar__track">
      <UiTrackThumb
        v-if="state.track"
        class="player-bar__artwork"
        :track="state.track"
        :size="PLAYER_BAR_ARTWORK_SIZE"
        font-size="var(--ui-font-size-lg)"
      />
      <div class="player-bar__track-copy">
        <template v-if="state.track">
          <button
            v-if="currentTrackAlbum"
            type="button"
            class="player-bar__track-title player-bar__track-title-button"
            :aria-label="currentTrackAlbumCtaLabel"
            :title="currentTrackAlbumCtaLabel"
            @click="jumpToCurrentTrackAlbum"
          >
            <UiMarqueeText
              class="player-bar__track-title-marquee"
              :text="state.track.title"
            />
          </button>
          <UiMarqueeText
            v-else
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
        :icon="MicVocal"
        :active="state.captureGuideVocalOn"
        :disabled="!canQuickToggleCaptureGuideVocal"
        :class="{
          'player-bar__extras-slot--hidden': !canQuickToggleCaptureGuideVocal,
        }"
        :aria-hidden="!canQuickToggleCaptureGuideVocal"
        :aria-label="
          state.captureGuideVocalOn ? '關閉導唱(擷取)' : '開啟導唱(擷取)'
        "
        :aria-pressed="state.captureGuideVocalOn"
        title="快速開關導唱(擷取) (G)"
        @click="toggleCaptureGuideVocal"
      />

      <UiButton
        :icon="SlidersHorizontal"
        :active="playerToolsActive"
        :aria-label="isPlayerToolsOpen ? '關閉演出工具' : '開啟演出工具'"
        :aria-pressed="isPlayerToolsOpen"
        title="演出工具"
        @click="togglePlayerToolsPanel"
      />

      <UiButton
        :icon="Captions"
        :disabled="!state.track"
        aria-label="查看目前曲目歌詞"
        title="歌詞"
        @click="showCurrentTrackLyrics"
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

    <PlayerToolsPanel
      v-model:active-tab="activeToolTab"
      :selected-separation-preset-id="selectedSeparationPresetId"
      :open="isPlayerToolsOpen"
      :has-track="Boolean(state.track)"
      :guide-vocal-visible="showGuideVocal"
      :guide-vocal-rows="guideVocalRows"
      :pitch-tempo-rows="pitchTempoRows"
      :current-track="currentSeparationTrack"
      :separation-preset-options="currentSeparationPresetOptions"
      :separation-preset-title="SEPARATION_PRESET_SELECT_TITLE"
      :separation-in-flight="isCurrentTrackSeparating"
      :separation-progress-percent="currentSeparationProgressPercent"
      :separation-error="currentSeparationError"
      :separation-has-result="selectedSeparationHasResult"
      @close="isPlayerToolsOpen = false"
      @generate-separation="generateSeparation"
      @select-separation-preset="selectSeparationPreset"
    />
  </div>
</template>

<style scoped>
.player-bar {
  position: relative;
  display: flex;
  align-items: center;
  /* Track/extras are fixed-width; on wide windows they can sum to less
     than the bar's full width. space-between keeps them flush against the
     edges instead of stranding leftover space after the last column. */
  justify-content: space-between;
  gap: var(--ui-space-4);
  height: var(--ui-player-bar-height);
  padding: var(--ui-player-bar-padding-block)
    var(--ui-player-bar-padding-inline);
  background: var(--ui-color-surface);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
  /* Otherwise dragging a slider triggers native text selection, which can
     swallow a click on a nearby button instead of registering it. */
  user-select: none;
}

.player-bar__notice {
  position: absolute;
  right: var(--ui-space-3);
  bottom: calc(100% + var(--ui-space-2));
  z-index: var(--ui-z-dropdown);
  max-width: min(28rem, calc(100vw - 2 * var(--ui-space-3)));
}

.player-bar__track {
  /* Width matches a sidebar row's actual box — column width minus
     --ui-playlist-sidebar-padding-inline x2, since rows are inset by that
     padding, not by this file's own --ui-player-bar-padding-inline (that
     one's calibrated for the artwork/compact-rail alignment below).
     Fixed, not flexible: .player-bar__center absorbs resize pressure
     instead; min-width:0 still lets the title truncate via UiMarqueeText
     when this is narrower than the content wants. */
  flex: 0 0
    calc(
      clamp(
          var(--ui-playlist-sidebar-width-min),
          var(--ui-playlist-sidebar-width),
          var(--ui-playlist-sidebar-width-max)
        ) -
        (var(--ui-playlist-sidebar-padding-inline) * 2)
    );
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
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
  text-decoration: none;
}

.player-bar__track-title-button {
  display: block;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-color-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
}

.player-bar__track-title-button:hover {
  color: var(--ui-color-text);
}

.player-bar__track-title-button :deep(.ui-marquee__text) {
  text-decoration-line: none;
  text-decoration-color: currentColor;
}

.player-bar__track-title-button:hover :deep(.ui-marquee__text),
.player-bar__track-title-button:focus-visible :deep(.ui-marquee__text) {
  text-decoration-line: underline;
  text-decoration-thickness: var(--ui-border-width);
  text-underline-offset: 0.12em;
}

.player-bar__track-title-button:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
  border-radius: var(--ui-radius-xs);
}

.player-bar__track-title-marquee {
  color: inherit;
  font-size: var(--ui-font-size-sm);
  font-weight: inherit;
  line-height: inherit;
}

.player-bar__track-artist {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

/* The only column that flexes — both side columns are fixed-width now,
   so all resize pressure lands here, capped by max-width on wide windows. */
.player-bar__center {
  flex: 1 1 auto;
  min-width: 0;
  max-width: var(--ui-player-bar-center-max-width);
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
  gap: var(--ui-space-1);
}

.player-bar__progress input {
  flex: 1;
}

/* Fixed width prevents 9:59 -> 10:00 from shifting the slider. Right-align
   (not the default left) so slack space lands away from the slider, not
   stacked on top of the row gap next to it. */
.player-bar__time {
  flex-shrink: 0;
  width: 5ch;
  text-align: right;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  font-variant-numeric: tabular-nums;
}

/* Mirrors the base rule: slack goes to the outer edge instead of pooling
   next to the slider on this side too. */
.player-bar__time--end {
  text-align: left;
}

.player-bar__extras {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  /* Fixed to its own content width, like .player-bar__track — icon
     buttons and a volume slider have nothing to truncate, so this side
     must never be squeezed narrower than it needs. */
  flex: 0 0 auto;
  justify-content: flex-end;
}

/* visibility:hidden, not display:none — keeps the slot's layout box so
   .player-bar__extras's width (and the centered column beside it) never
   changes when canQuickToggleCaptureGuideVocal flips. */
.player-bar__extras-slot--hidden {
  visibility: hidden;
}

.player-bar__volume {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.player-bar__volume input {
  width: var(--ui-player-bar-volume-slider-width);
}

.player-bar__volume-value {
  flex-shrink: 0;
  width: 4ch;
  text-align: right;
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}
</style>
