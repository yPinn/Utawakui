<script setup>
import { computed } from 'vue';
import {
  CircleAlert,
  Clock,
  ICON_SIZE,
  MicVocal,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
} from '../../icons/index.js';
import { useMetronome } from '../../composables/useMetronome.js';
import SeparationPresetControl from '../separation/SeparationPresetControl.vue';
import PlayerBarPanel from './PlayerBarPanel.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  activeTab: {
    type: String,
    default: 'adjust',
    validator: (value) => ['live', 'adjust', 'process'].includes(value),
  },
  hasTrack: { type: Boolean, default: false },
  guideVocalVisible: { type: Boolean, default: false },
  guideVocalRows: { type: Array, default: () => [] },
  pitchTempoRows: { type: Array, default: () => [] },
  currentTrack: { type: Object, default: null },
  separationPresetOptions: { type: Array, default: () => [] },
  selectedSeparationPresetId: { type: String, default: '' },
  separationPresetTitle: { type: String, default: '' },
  separationInFlight: { type: Boolean, default: false },
  separationProgressPercent: { type: Number, default: 0 },
  separationError: { type: String, default: '' },
  separationHasResult: { type: Boolean, default: false },
});

const emit = defineEmits([
  'close',
  'generateSeparation',
  'selectSeparationPreset',
  'update:activeTab',
  'update:selectedSeparationPresetId',
]);

const {
  state: metronome,
  currentBeatLabel,
  toggle,
  reset,
  adjustBpm,
  adjustBeatsPerBar,
  tapTempo,
  resetTaps,
} = useMetronome();

const tabItems = [
  { key: 'adjust', label: '調整' },
  { key: 'live', label: '演出' },
  { key: 'process', label: '處理' },
];

const metronomeSummary = computed(
  () => `${metronome.bpm} BPM / ${metronome.beatsPerBar}/4`,
);
const tapStatusLabel = computed(() =>
  metronome.tapCount > 0 ? `已點擊 ${metronome.tapCount} 次` : '依節奏點擊',
);
const panelStatus = computed(() => {
  if (props.activeTab === 'adjust') {
    return 'Transpose / Pitch / Speed / Guide Vocal';
  }
  if (props.activeTab === 'process') return '音訊處理流程';
  return metronomeSummary.value;
});
function setActiveTab(key) {
  emit('update:activeTab', key);
}

function handleSeparationPresetChange(presetId) {
  emit('update:selectedSeparationPresetId', presetId);
  emit('selectSeparationPreset', presetId);
}
</script>

<template>
  <PlayerBarPanel
    :open="open"
    title="演出工具"
    :status="panelStatus"
    aria-label="演出工具"
    close-label="關閉演出工具"
    @close="emit('close')"
  >
    <div class="player-tools__tabs" role="tablist" aria-label="工具分組">
      <button
        v-for="tab in tabItems"
        :key="tab.key"
        type="button"
        class="player-tools__tab"
        :class="{ 'player-tools__tab--active': activeTab === tab.key }"
        role="tab"
        :aria-selected="activeTab === tab.key"
        @click="setActiveTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <section
      v-show="activeTab === 'live'"
      class="player-tools__section"
      aria-label="演出工具"
    >
      <div class="player-tools__meter-card">
        <div class="player-tools__row-header">
          <span class="player-tools__label">
            <Clock :size="ICON_SIZE" aria-hidden="true" />
            節拍器
          </span>
          <UiChip :tone="metronome.isRunning ? 'accent' : 'muted'">
            {{ metronome.isRunning ? 'On' : 'Off' }}
          </UiChip>
          <UiButton
            :icon="RotateCcw"
            aria-label="重設節拍器"
            title="重設節拍器"
            @click="reset"
          />
        </div>

        <button
          :key="metronome.pulseId"
          type="button"
          class="player-tools__metro-toggle"
          :class="{ 'player-tools__metro-toggle--active': metronome.isRunning }"
          :aria-pressed="metronome.isRunning"
          @click="toggle"
        >
          <component
            :is="metronome.isRunning ? Pause : Play"
            :size="ICON_SIZE"
          />
          <span>{{ metronome.bpm }}</span>
          <small>{{ currentBeatLabel }}</small>
        </button>

        <div
          class="player-tools__beat-row"
          :style="{
            gridTemplateColumns: `repeat(${metronome.beatsPerBar}, 1fr)`,
          }"
          aria-label="Current beat"
        >
          <span
            v-for="beat in metronome.beatsPerBar"
            :key="beat"
            class="player-tools__beat"
            :class="{
              'player-tools__beat--active': beat === metronome.currentBeat,
              'player-tools__beat--downbeat':
                beat === 1 && beat === metronome.currentBeat,
            }"
          />
        </div>

        <div class="player-tools__compact-grid">
          <div class="player-tools__stepper">
            <span class="player-tools__stepper-label">BPM</span>
            <div class="player-tools__stepper-controls">
              <UiButton
                :icon="Minus"
                aria-label="降低 BPM"
                title="降低 BPM"
                @click="adjustBpm(-1)"
              />
              <strong>{{ metronome.bpm }}</strong>
              <UiButton
                :icon="Plus"
                aria-label="提高 BPM"
                title="提高 BPM"
                @click="adjustBpm(1)"
              />
            </div>
          </div>
          <div class="player-tools__stepper">
            <span class="player-tools__stepper-label">Beat</span>
            <div class="player-tools__stepper-controls">
              <UiButton
                :icon="Minus"
                aria-label="減少拍數"
                title="減少拍數"
                @click="adjustBeatsPerBar(-1)"
              />
              <strong>{{ metronome.beatsPerBar }}/4</strong>
              <UiButton
                :icon="Plus"
                aria-label="增加拍數"
                title="增加拍數"
                @click="adjustBeatsPerBar(1)"
              />
            </div>
          </div>
        </div>

        <div class="player-tools__tap-row">
          <div class="player-tools__row-header">
            <span class="player-tools__label">Tap Tempo</span>
            <span class="player-tools__value">{{ tapStatusLabel }}</span>
            <UiButton
              :icon="RotateCcw"
              :disabled="metronome.tapCount === 0"
              aria-label="清除點擊記錄"
              title="清除點擊記錄"
              @click="resetTaps"
            />
          </div>
          <UiButton
            variant="accent"
            class="player-tools__tap-button"
            title="跟著節奏點擊"
            @click="tapTempo()"
          >
            Tap
          </UiButton>
          <p class="player-tools__description">跟著節奏連續點擊 2 次以上</p>
        </div>
      </div>
    </section>

    <section
      v-show="activeTab === 'adjust'"
      class="player-tools__section"
      aria-label="播放調整"
    >
      <div
        v-for="row in pitchTempoRows"
        :key="row.key"
        class="player-tools__adjust-row"
      >
        <div class="player-tools__row-header">
          <span class="player-tools__label">{{ row.label }}</span>
          <span class="player-tools__value"
            >{{ row.value
            }}<span
              v-if="row.secondaryValue"
              class="player-tools__value-secondary"
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
        <div class="player-tools__control">
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
            :disabled="!hasTrack"
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

      <template v-if="guideVocalVisible">
        <hr class="player-tools__section-divider" />
        <div
          v-for="row in guideVocalRows"
          :key="row.key"
          class="player-tools__adjust-row"
        >
          <div class="player-tools__row-header">
            <span class="player-tools__label" :title="row.deviceName">
              <component :is="row.icon" :size="ICON_SIZE" aria-hidden="true" />
              {{ row.label }}
            </span>
            <span class="player-tools__value">{{ row.value }}</span>
            <UiButton
              :icon="row.onIcon"
              :active="row.on"
              :aria-label="row.onLabel"
              :aria-pressed="row.on"
              :title="row.onLabel"
              @click="row.onToggle"
            />
          </div>
          <div
            class="player-tools__stop-row"
            role="group"
            :aria-label="row.label"
          >
            <UiButton
              v-for="stop in row.stops"
              :key="stop.value"
              :active="stop.active"
              :disabled="stop.disabled"
              @click="stop.onSelect"
            >
              {{ stop.label }}
            </UiButton>
          </div>
          <div class="player-tools__control">
            <input
              type="range"
              :value="row.sliderValue"
              :min="row.min"
              :max="row.max"
              :step="row.step"
              :disabled="!hasTrack"
              :aria-label="row.sliderLabel"
              :aria-valuetext="row.value"
              @input="row.onSliderInput($event.target.value)"
            />
          </div>
        </div>
      </template>
    </section>

    <section
      v-show="activeTab === 'process'"
      class="player-tools__section"
      aria-label="音訊處理"
    >
      <div class="player-tools__process-card">
        <div class="player-tools__row-header">
          <span class="player-tools__label">
            <MicVocal :size="ICON_SIZE" aria-hidden="true" />
            伴奏分離
          </span>
          <UiChip tone="gated">Gate</UiChip>
        </div>

        <p class="player-tools__description player-tools__process-track">
          {{ currentTrack ? currentTrack.title : '請先載入歌曲' }}
        </p>

        <SeparationPresetControl
          :has-track="Boolean(currentTrack)"
          :preset-options="separationPresetOptions"
          :selected-preset-id="selectedSeparationPresetId"
          :preset-title="separationPresetTitle"
          :in-flight="separationInFlight"
          :progress-percent="separationProgressPercent"
          :has-result="separationHasResult"
          :error="separationError"
          @preset-change="handleSeparationPresetChange"
          @generate="emit('generateSeparation')"
        />
      </div>

      <div
        class="player-tools__process-row player-tools__process-row--disabled"
      >
        <div class="player-tools__process-copy">
          <span class="player-tools__label">
            <CircleAlert :size="ICON_SIZE" aria-hidden="true" />
            Render Cache
          </span>
          <span class="player-tools__description">Pitch / Tempo 預先算製</span>
        </div>
        <UiChip tone="muted">待實作</UiChip>
      </div>
    </section>
  </PlayerBarPanel>
</template>

<style scoped>
.player-tools__tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-1);
  padding: var(--ui-space-1);
  margin-bottom: var(--ui-space-3);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.player-tools__tab {
  min-height: var(--ui-control-height);
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-color-text-muted);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
  cursor: pointer;
}

.player-tools__tab:hover {
  color: var(--ui-color-text);
}

.player-tools__tab--active {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-text);
}

.player-tools__tab:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.player-tools__section {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.player-tools__meter-card {
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.player-tools__row-header,
.player-tools__process-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.player-tools__row-header {
  margin-bottom: var(--ui-space-2);
}

.player-tools__label {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

/* Separates the adjust tab's two distinct row categories (guide-vocal
   blend vs. pitch/tempo) without a fourth tab (a tab just for 1-2 rows
   would cost more clicks than it buys clarity for a performer adjusting
   mid-song) or a text caption (the row content underneath is already
   self-explanatory — a label here would just repeat what the icons and
   row labels already say). Same border-token/spacing-token divider
   pattern as PlaylistSidebar.vue's .playlist-sidebar__divider. */
.player-tools__section-divider {
  margin: var(--ui-space-3) 0;
  border: none;
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.player-tools__metro-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-2);
  min-height: var(--ui-player-tools-meter-control-height);
  margin-bottom: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font: inherit;
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  animation: player-tools-pulse var(--ui-motion-fast) var(--ui-motion-ease);
}

.player-tools__metro-toggle--active {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-accent-soft);
  color: var(--ui-color-accent);
}

.player-tools__metro-toggle:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.player-tools__metro-toggle small {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-caption);
}

.player-tools__beat-row {
  display: grid;
  gap: var(--ui-space-1);
  margin-bottom: var(--ui-space-3);
}

.player-tools__beat {
  height: var(--ui-player-tools-beat-height);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-border);
  opacity: var(--ui-opacity-muted);
}

.player-tools__beat--active {
  background: var(--ui-color-accent);
  opacity: 1;
}

.player-tools__beat--downbeat {
  background: var(--ui-color-current);
}

.player-tools__compact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-2);
}

.player-tools__stepper {
  min-width: 0;
}

.player-tools__stepper-label,
.player-tools__description {
  display: block;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.player-tools__stepper-controls {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  margin-top: var(--ui-space-1);
}

.player-tools__stepper-controls strong {
  flex: 1;
  min-width: 4ch;
  text-align: center;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.player-tools__tap-row {
  margin-top: var(--ui-space-3);
  padding-top: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.player-tools__tap-button {
  width: 100%;
  justify-content: center;
  min-height: var(--ui-player-tools-meter-control-height);
  font-size: var(--ui-font-size-md);
  transition: transform var(--ui-motion-fast) var(--ui-motion-ease);
}

.player-tools__tap-button:active {
  transform: scale(0.98);
}

.player-tools__tap-row .player-tools__description {
  margin: var(--ui-space-2) 0 0;
  text-align: center;
}

.player-tools__adjust-row + .player-tools__adjust-row {
  padding-top: var(--ui-space-1);
}

.player-tools__value {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  font-variant-numeric: tabular-nums;
}

.player-tools__value-secondary {
  margin-left: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: normal;
  font-variant-numeric: tabular-nums;
}

.player-tools__control {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.player-tools__control input {
  flex: 1;
}

/* Five fixed guide-vocal stops (see PlayerBar.vue's GUIDE_VOCAL_STOPS) —
   equal-width buttons, same grid approach as .player-tools__tabs above.
   margin-bottom matches .player-tools__row-header's, so the slider below
   sits the same distance from the stops as the stops do from the header —
   without it, only the header→stops gap exists and the row reads
   unevenly cramped between stops and slider. */
.player-tools__stop-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--ui-space-1);
  margin-bottom: var(--ui-space-2);
}

.player-tools__stop-row :deep(.ui-btn) {
  justify-content: center;
}

.player-tools__process-row,
.player-tools__process-card {
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.player-tools__process-card {
  display: grid;
  gap: var(--ui-space-2);
}

.player-tools__process-card :deep(.separation-preset-control) {
  flex-wrap: wrap;
}

.player-tools__process-card :deep(.separation-preset-control__label) {
  flex: 1 1 calc(100% - var(--ui-icon-button-size-sm) - var(--ui-space-2));
}

.player-tools__process-row {
  justify-content: space-between;
}

.player-tools__process-card .player-tools__row-header {
  margin-bottom: 0;
}

.player-tools__process-copy {
  flex: 1;
  min-width: 0;
}

.player-tools__process-row--disabled {
  opacity: var(--ui-opacity-muted);
  background: transparent;
}

.player-tools__process-track {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes player-tools-pulse {
  from {
    transform: scale(0.99);
  }

  to {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .player-tools__metro-toggle {
    animation: none;
  }
}
</style>
