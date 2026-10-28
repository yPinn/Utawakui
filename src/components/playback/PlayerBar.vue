<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  Cable,
  Headphones,
  ListMusic,
  MicVocal,
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
import { usePlaybackTransport } from '../../composables/usePlaybackTransport.js';
import { useMetronome } from '../../composables/useMetronome.js';
import { useMetronomeTrackTempo } from '../../composables/useMetronomeTrackTempo.js';
import { useAudioOutput } from '../../composables/useAudioOutput.js';
import {
  GUIDE_VOCAL_LEVEL_RANGE,
  PITCH_CENTS_RANGE,
  PLAYER_AUDIO_DEFAULTS,
  PLAYER_VOLUME_RANGE,
  PLAYBACK_MODES,
  TEMPO_RATE_RANGE,
  TRANSPOSE_SEMITONES_RANGE,
  usePlayer,
} from '../../composables/usePlayer.js';
import { formatDuration } from '../../utils/format.js';
import { shortenDeviceLabel } from '../../utils/audioDeviceLabel.js';
import PlayerToolsPanel from './PlayerToolsPanel.vue';
import PlayerBarArtwork from './PlayerBarArtwork.vue';
import PlaybackTrackIdentity from '../track/PlaybackTrackIdentity.vue';
import PlaybackPrimaryButton from './PlaybackPrimaryButton.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';

defineProps({
  artworkExpandable: { type: Boolean, default: false },
  artworkExpanded: { type: Boolean, default: false },
  artworkControls: { type: String, default: undefined },
  queueExpanded: { type: Boolean, default: false },
  queueControls: { type: String, default: undefined },
});

const emit = defineEmits(['artworkActivate', 'queueActivate']);

const {
  state,
  toggle,
  seek,
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
  performanceSettings,
  cancelPendingStart,
} = usePlayer();
const performanceSettingsView = computed(() =>
  performanceSettings
    ? {
        ...performanceSettings.state,
        hasTrack: Boolean(state.track),
        pendingStart: Boolean(state.pendingStartTrackId),
        playing: state.isPlaying,
        canSave: performanceSettings.canSave.value,
        busy: performanceSettings.busy.value,
        dirty: performanceSettings.dirty.value,
        hasSaved: performanceSettings.hasSaved.value,
        defaultSlot: performanceSettings.state.snapshot?.defaultSlot ?? 1,
        savedSlots: performanceSettings.state.snapshot?.slots?.map(Boolean) ?? [
          false,
          false,
          false,
        ],
      }
    : null,
);
function handleSettingsAction(action) {
  if (action?.kind === 'selectSlot')
    return performanceSettings?.selectSlot(action.slot);
  if (action?.kind === 'copyToSlot')
    return performanceSettings?.copyToSlot(action.slot);
  if (action?.kind === 'resetSlot')
    return performanceSettings?.resetSlot(action.slot);
  if (action === 'cancelStart') return cancelPendingStart();
  if (
    [
      'save',
      'reset',
      'remove',
      'reload',
      'retry',
      'useDefaultsOnce',
      'setDefault',
    ].includes(action)
  )
    void performanceSettings?.[action]();
}
const { state: queueState, toggleShuffle } = usePlaybackQueue();
const {
  playPrevious,
  playNext,
  playAfterEnded,
  canPlayNext,
  arrangementActive,
} = usePlaybackTransport();
const { state: metronomeState } = useMetronome();
// PlayerBar is mounted exactly once for the app's lifetime, making this the
// natural single place to wire the metronome to whatever track is loaded.
useMetronomeTrackTempo();
const { activeView, performanceTool, openLiveLyrics } = useAppView();
const { devices: audioOutputDevices, monitorDeviceLabel } = useAudioOutput();
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
function formatVolumePercent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}
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
// Kept mounted (visibility:hidden, not v-if) so the trailing controls and
// their balanced grid reserve stay stable when this capability changes.
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

const transposeLabel = computed(
  () =>
    `${state.transposeSemitones > 0 ? '+' : ''}${state.transposeSemitones} 半音`,
);
// Spelled out as 音分, not "¢" — reads unambiguously as a pitch unit.
const pitchCentsLabel = computed(
  () => `${state.pitchCents > 0 ? '+' : ''}${state.pitchCents} 音分`,
);
// A4 (440Hz) shifted by the cents offset — the reference tuning musicians
// actually tune to. Reflects pitchCents only; Transpose has its own row.
const A4_REFERENCE_HZ = 440;
const pitchReferenceHz = computed(() =>
  (A4_REFERENCE_HZ * 2 ** (state.pitchCents / 1200)).toFixed(1),
);
const tempoLabel = computed(() => `${state.tempoRate.toFixed(2)}x`);
const playerToolsEngaged = computed(
  () =>
    state.transposeSemitones !== 0 ||
    state.pitchCents !== 0 ||
    state.tempoRate !== 1 ||
    // guideVocalOn defaults to true (see usePlayer.js) so a performer hears
    // it by default once it applies — gated on showGuideVocal so this
    // doesn't light up for every track/on every launch, only when the
    // current track actually has separated audio to mix.
    (showGuideVocal.value &&
      (state.guideVocalOn || state.captureGuideVocalOn)) ||
    metronomeState.isRunning,
);
const playerToolsLabel = computed(() => {
  if (isPlayerToolsOpen.value) return '關閉演出工具';
  return playerToolsEngaged.value
    ? '開啟演出工具（功能啟用中）'
    : '開啟演出工具';
});
const playerToolsTitle = computed(() =>
  playerToolsEngaged.value && !isPlayerToolsOpen.value
    ? '演出工具 · 啟用中'
    : '演出工具',
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

// Keep quarter-scale marks for orientation; fine adjustment and right-click
// reset belong to the shared range control, with no duplicate preset buttons.
const GUIDE_VOCAL_MARKS = [0, 0.25, 0.5, 0.75, 1];
const GUIDE_VOCAL_STEP = GUIDE_VOCAL_LEVEL_RANGE.step;

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
      // Short and fixed — the dedicated tab already says "導唱",
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
      marks: GUIDE_VOCAL_MARKS,
      sliderValue: state.guideVocalValue,
      defaultValue: PLAYER_AUDIO_DEFAULTS.monitorGuideVocalLevel,
      min: 0,
      max: 1,
      step: GUIDE_VOCAL_STEP,
      sliderLabel: '導唱比例(監聽)',
      formatSliderValue: formatVolumePercent,
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
      marks: GUIDE_VOCAL_MARKS,
      sliderValue: state.captureGuideVocalValue,
      defaultValue: PLAYER_AUDIO_DEFAULTS.captureGuideVocalLevel,
      min: 0,
      max: 1,
      step: GUIDE_VOCAL_STEP,
      sliderLabel: '導唱比例(擷取)',
      formatSliderValue: formatVolumePercent,
      onSliderInput: throttledSetCaptureGuideVocalLevel,
    });
  }
  return rows;
});

const pitchTempoRows = computed(() => [
  {
    key: 'transpose',
    label: '變調',
    value: transposeLabel.value,
    secondaryValue: null,
    minusDisabled:
      !state.track || state.transposeSemitones <= TRANSPOSE_SEMITONES_RANGE.min,
    minusLabel: '降半音',
    minusTitle: '降半音 (Ctrl+↓)',
    onMinus: () => adjustTranspose(-1),
    sliderValue: state.transposeSemitones,
    defaultValue: PLAYER_AUDIO_DEFAULTS.transposeSemitones,
    min: TRANSPOSE_SEMITONES_RANGE.min,
    max: TRANSPOSE_SEMITONES_RANGE.max,
    step: 1,
    sliderLabel: '變調(半音)',
    formatSliderValue: (value) =>
      `${Number(value) > 0 ? '+' : ''}${Number(value)} 半音`,
    onSliderInput: (value) => setTransposeSemitones(Number(value)),
    plusDisabled:
      !state.track || state.transposeSemitones >= TRANSPOSE_SEMITONES_RANGE.max,
    plusLabel: '升半音',
    plusTitle: '升半音 (Ctrl+↑)',
    onPlus: () => adjustTranspose(1),
  },
  {
    key: 'pitch',
    label: '音高微調',
    value: pitchCentsLabel.value,
    secondaryValue: `${pitchReferenceHz.value} Hz`,
    minusDisabled: !state.track || state.pitchCents <= PITCH_CENTS_RANGE.min,
    minusLabel: '音高微調降低',
    minusTitle: '音高微調降低',
    onMinus: () => adjustPitchCents(-1),
    sliderValue: state.pitchCents,
    defaultValue: PLAYER_AUDIO_DEFAULTS.pitchCents,
    min: PITCH_CENTS_RANGE.min,
    max: PITCH_CENTS_RANGE.max,
    step: 1,
    sliderLabel: '音高(音分微調)',
    formatSliderValue: (value) =>
      `${Number(value) > 0 ? '+' : ''}${Number(value)} 音分`,
    onSliderInput: (value) => setPitchCents(Number(value)),
    plusDisabled: !state.track || state.pitchCents >= PITCH_CENTS_RANGE.max,
    plusLabel: '音高微調提高',
    plusTitle: '音高微調提高',
    onPlus: () => adjustPitchCents(1),
  },
  {
    key: 'tempo',
    label: '變速',
    value: tempoLabel.value,
    secondaryValue: null,
    minusDisabled: !state.track || state.tempoRate <= TEMPO_RATE_RANGE.min,
    minusLabel: '放慢',
    minusTitle: '放慢 (Ctrl+Shift+↓)',
    onMinus: () => adjustTempo(-0.05),
    sliderValue: state.tempoRate,
    defaultValue: PLAYER_AUDIO_DEFAULTS.tempoRate,
    min: TEMPO_RATE_RANGE.min,
    max: TEMPO_RATE_RANGE.max,
    step: 0.05,
    sliderLabel: '變速',
    formatSliderValue: (value) => `${Number(value).toFixed(2)}x`,
    onSliderInput: (value) => setTempoRate(Number(value)),
    plusDisabled: !state.track || state.tempoRate >= TEMPO_RATE_RANGE.max,
    plusLabel: '加快',
    plusTitle: '加快 (Ctrl+Shift+↑)',
    onPlus: () => adjustTempo(0.05),
  },
]);

// useLyrics.js already syncs to whatever's playing, so switching tabs is
// enough — no track needs to be passed through.
function showCurrentTrackLyrics() {
  openLiveLyrics();
}

function toggleQueuePanel() {
  emit('queueActivate');
  isPlayerToolsOpen.value = false;
}

function togglePlayerToolsPanel() {
  isPlayerToolsOpen.value = !isPlayerToolsOpen.value;
}

let unsubscribeEnded;

onMounted(() => {
  unsubscribeEnded = onEnded(playAfterEnded);
});

onUnmounted(() => {
  unsubscribeEnded?.();
});
</script>

<template>
  <div
    class="player-bar"
    data-ui-region="chrome"
    role="region"
    aria-label="播放控制列"
  >
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
    <PlaybackTrackIdentity class="player-bar__track" :track="state.track">
      <template #artwork>
        <PlayerBarArtwork
          v-if="state.track"
          class="player-bar__artwork"
          :track="state.track"
          :expandable="artworkExpandable"
          :expanded="artworkExpanded"
          :controls="artworkControls"
          @activate="emit('artworkActivate')"
        />
      </template>
    </PlaybackTrackIdentity>

    <div class="player-bar__center">
      <div class="player-bar__transport">
        <UiButton
          :icon="Shuffle"
          :active="queueState.isShuffle"
          :disabled="!canShuffle || arrangementActive"
          aria-label="隨機播放"
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
        <PlaybackPrimaryButton
          :playing="state.isPlaying"
          :disabled="!state.track"
          @click="toggle"
        />
        <UiButton
          :icon="SkipForward"
          :disabled="!canPlayNext"
          aria-label="下一首"
          title="下一首"
          @click="playNext"
        />
        <UiButton
          :icon="playbackModeIcon"
          :active="playbackModeActive"
          :aria-label="playbackModeActionLabel"
          :disabled="arrangementActive"
          :aria-pressed="playbackModeActive"
          :title="playbackModeActionLabel"
          @click="cyclePlaybackMode"
        />
      </div>

      <div class="player-bar__progress">
        <span class="player-bar__time">{{
          formatDuration(state.currentTime)
        }}</span>
        <UiRangeControl
          v-model="progress"
          class="player-bar__progress-range"
          :min="0"
          :max="state.duration || 0"
          :step="0.1"
          :disabled="!state.track"
          :format-value="formatDuration"
          :value-text="`${formatDuration(state.currentTime)} / ${formatDuration(state.duration)}`"
          aria-label="播放進度"
        />
        <span class="player-bar__time player-bar__time--end">{{
          formatDuration(state.duration)
        }}</span>
      </div>
    </div>

    <div class="player-bar__extras">
      <UiIconButton
        :icon="Cable"
        :active="state.captureGuideVocalOn"
        :disabled="!canQuickToggleCaptureGuideVocal"
        :class="{
          'player-bar__extras-slot--hidden': !canQuickToggleCaptureGuideVocal,
        }"
        :aria-hidden="!canQuickToggleCaptureGuideVocal"
        :label="state.captureGuideVocalOn ? '關閉導唱輸出' : '開啟導唱輸出'"
        :aria-pressed="state.captureGuideVocalOn"
        title="導唱輸出"
        tooltip-suffix=" (G)"
        @click="toggleCaptureGuideVocal"
      />

      <div
        class="player-bar__context-actions"
        role="group"
        aria-label="播放資訊"
      >
        <UiIconButton
          :icon="MicVocal"
          :disabled="!state.track"
          label="查看目前歌曲歌詞"
          title="歌詞"
          :active="
            activeView === 'performance' && performanceTool === 'live-lyrics'
          "
          :aria-current="
            activeView === 'performance' && performanceTool === 'live-lyrics'
              ? 'page'
              : undefined
          "
          @click="showCurrentTrackLyrics"
        />

        <UiIconButton
          :icon="ListMusic"
          :active="queueExpanded"
          :label="queueExpanded ? '關閉播放佇列' : '開啟播放佇列'"
          :aria-expanded="queueExpanded"
          :aria-controls="queueControls"
          title="播放佇列"
          @click="toggleQueuePanel"
        />
      </div>

      <div class="player-bar__performance-actions">
        <PlayerToolsPanel
          v-model:open="isPlayerToolsOpen"
          v-model:active-tab="activeToolTab"
          :has-track="Boolean(state.track)"
          :guide-vocal-visible="showGuideVocal"
          :guide-vocal-rows="guideVocalRows"
          :pitch-tempo-rows="pitchTempoRows"
          :performance-settings="performanceSettingsView"
          @settings-action="handleSettingsAction"
        >
          <template #trigger="{ triggerProps }">
            <UiIconButton
              v-bind="triggerProps"
              :icon="SlidersHorizontal"
              :active="isPlayerToolsOpen"
              :label="playerToolsLabel"
              :title="playerToolsTitle"
              @click="togglePlayerToolsPanel"
            />
          </template>
        </PlayerToolsPanel>
        <span
          v-if="playerToolsEngaged && !isPlayerToolsOpen"
          class="player-bar__tools-marker"
          aria-hidden="true"
        />
      </div>

      <div class="player-bar__volume">
        <UiIconButton
          :icon="state.isMuted || state.volume === 0 ? VolumeX : Volume2"
          :label="state.isMuted ? '取消靜音' : '靜音'"
          :aria-pressed="state.isMuted"
          :title="state.isMuted ? '取消靜音' : '靜音'"
          tooltip-suffix=" (M)"
          @click="toggleMute"
        />
        <UiRangeControl
          v-model="volume"
          class="player-bar__volume-range"
          :min="PLAYER_VOLUME_RANGE.min"
          :max="PLAYER_VOLUME_RANGE.max"
          :step="PLAYER_VOLUME_RANGE.step"
          :format-value="formatVolumePercent"
          :value-text="`${volumePercent}%`"
          aria-label="音量"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-bar {
  position: relative;
  display: grid;
  grid-template-columns:
    minmax(var(--ui-player-side-reserve-inline-size), 1fr)
    minmax(0, var(--ui-player-center-max-inline-size))
    minmax(var(--ui-player-side-reserve-inline-size), 1fr);
  align-items: center;
  /* The transparent bar reads as one plane with the Shell inset above it.
     Reserving the matching inset below balances that combined plane while
     keeping all three grid columns on the same vertical axis. */
  align-content: center;
  column-gap: var(--ui-space-4);
  height: var(--ui-player-bar-height);
  padding-block: 0 var(--ui-player-padding-block-end);
  /* Symmetric root gutters keep the center track on the viewport midpoint.
     The leading track adds only the optical delta to the artwork axis. */
  padding-inline: var(--ui-player-padding-inline);
  background: transparent;
  /* Otherwise dragging a slider triggers native text selection, which can
     swallow a click on a nearby button instead of registering it. */
  user-select: none;
}

.player-bar__notice {
  position: absolute;
  right: var(--ui-space-3);
  bottom: calc(100% + var(--ui-space-2));
  z-index: var(--ui-z-popover);
  /* UiNotice is an inline-size container, so it needs a definite width. */
  inline-size: min(28rem, calc(100vw - 2 * var(--ui-space-3)));
}

.player-bar__track {
  grid-column: 1;
  justify-self: start;
  width: var(--ui-player-track-inline-size);
  min-width: var(--ui-player-track-min-inline-size);
  margin-inline-start: calc(
    var(--ui-player-leading-padding-inline) - var(--ui-player-padding-inline)
  );
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.player-bar__center {
  grid-column: 2;
  width: 100%;
  min-width: 0;
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

.player-bar__progress-range {
  --ui-range-target-size: var(--ui-space-4);

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
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  font-variant-numeric: tabular-nums;
}

/* Mirrors the base rule: slack goes to the outer edge instead of pooling
   next to the slider on this side too. */
.player-bar__time--end {
  text-align: left;
}

.player-bar__extras {
  --ui-icon-button-size-override: var(--ui-player-action-size);

  grid-column: 3;
  justify-self: end;
  width: var(--ui-player-extras-inline-size);
  display: flex;
  align-items: center;
  gap: var(--ui-player-group-gap);
  justify-content: flex-end;
}

.player-bar__context-actions,
.player-bar__performance-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-player-action-gap);
}

.player-bar__performance-actions {
  position: relative;
}

.player-bar__tools-marker {
  position: absolute;
  top: 0;
  right: 0;
  box-sizing: border-box;
  width: var(--ui-space-2);
  height: var(--ui-space-2);
  pointer-events: none;
  border: var(--ui-border-width) solid var(--ui-color-canvas);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-accent);
}

/* visibility:hidden, not display:none — keeps the trailing reserve stable
   when canQuickToggleCaptureGuideVocal flips. */
.player-bar__extras-slot--hidden {
  visibility: hidden;
}

.player-bar__volume {
  display: flex;
  align-items: center;
  gap: var(--ui-player-action-gap);
}

.player-bar__volume-range {
  --ui-range-target-size: var(--ui-space-4);

  width: var(--ui-player-volume-inline-size);
}

@media (forced-colors: active) {
  .player-bar__tools-marker {
    border-color: Canvas;
    background: Highlight;
  }
}
</style>
