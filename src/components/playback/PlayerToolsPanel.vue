<script setup>
import { computed } from 'vue';
import {
  Clock,
  ICON_SIZE,
  MicVocal,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Volume2,
  VolumeX,
} from '../../icons/index.js';
import { useMetronome } from '../../composables/useMetronome.js';
import SeparationPresetControl from '../separation/SeparationPresetControl.vue';
import PlayerBarPanel from './PlayerBarPanel.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';
import UiTabs from '../ui/UiTabs.vue';
import UiTooltip from '../ui/UiTooltip.vue';

defineProps({
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
  toggleSound,
} = useMetronome();

const tabItems = [
  { id: 'adjust', label: '調整' },
  { id: 'live', label: '節拍器' },
  { id: 'process', label: '伴奏' },
];

const tapStatusLabel = computed(() =>
  metronome.tapCount > 0 ? `已點擊 ${metronome.tapCount} 次` : '',
);
function formatConfidence(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
}
const trackTempoHint = computed(() =>
  metronome.bpmSource === 'track-estimate'
    ? `已套用曲目估算 BPM · 節拍信心 ${formatConfidence(metronome.bpmSourceConfidence)}`
    : '',
);
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
    aria-label="演出工具"
    close-label="關閉演出工具"
    @close="emit('close')"
  >
    <UiTabs
      class="player-tools__tabs"
      :items="tabItems"
      :active-id="activeTab"
      aria-label="工具分組"
      tab-id-prefix="player-tools"
      panel-id-prefix="player-tools"
      distribution="equal"
      @update:active-id="setActiveTab"
    />

    <section
      v-show="activeTab === 'live'"
      id="player-tools-live-panel"
      class="player-tools__section"
      role="tabpanel"
      aria-labelledby="player-tools-live-tab"
      tabindex="0"
    >
      <div class="player-tools__card">
        <div class="player-tools__row-header">
          <span class="player-tools__label">
            <Clock :size="ICON_SIZE" aria-hidden="true" />
            節拍器
          </span>
          <UiButton
            :icon="metronome.soundEnabled ? Volume2 : VolumeX"
            :active="metronome.soundEnabled"
            :aria-label="
              metronome.soundEnabled ? '關閉節拍器音效' : '開啟節拍器音效'
            "
            :aria-pressed="metronome.soundEnabled"
            :title="
              metronome.soundEnabled ? '關閉節拍器音效' : '開啟節拍器音效'
            "
            @click="toggleSound"
          />
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
            <span class="player-tools__stepper-label">拍數</span>
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

        <p v-if="trackTempoHint" class="player-tools__description">
          {{ trackTempoHint }}
        </p>

        <div class="player-tools__tap-row">
          <div class="player-tools__row-header">
            <span class="player-tools__label">點擊測速</span>
            <span v-if="tapStatusLabel" class="player-tools__value">{{
              tapStatusLabel
            }}</span>
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
            @click="tapTempo()"
          >
            點擊
          </UiButton>
          <p class="player-tools__description">跟著節奏連續點擊 2 次以上</p>
        </div>
      </div>
    </section>

    <section
      v-show="activeTab === 'adjust'"
      id="player-tools-adjust-panel"
      class="player-tools__section"
      role="tabpanel"
      aria-labelledby="player-tools-adjust-tab"
      tabindex="0"
    >
      <div class="player-tools__card">
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
            <UiRangeControl
              class="player-tools__range"
              :model-value="row.sliderValue"
              :default-value="row.defaultValue"
              :min="row.min"
              :max="row.max"
              :step="row.step"
              :disabled="!hasTrack"
              :value-text="row.value"
              :format-value="row.formatSliderValue"
              :aria-label="row.sliderLabel"
              @update:model-value="row.onSliderInput"
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

      <div v-if="guideVocalVisible" class="player-tools__card">
        <div
          v-for="row in guideVocalRows"
          :key="row.key"
          class="player-tools__adjust-row"
        >
          <div class="player-tools__row-header">
            <UiTooltip :text="row.deviceName">
              <template #trigger="{ triggerProps }">
                <span
                  v-bind="triggerProps"
                  class="player-tools__label"
                  tabindex="0"
                  :aria-label="`${row.label}：${row.deviceName}`"
                >
                  <component
                    :is="row.icon"
                    :size="ICON_SIZE"
                    aria-hidden="true"
                  />
                  {{ row.label }}
                </span>
              </template>
            </UiTooltip>
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
            <UiRangeControl
              class="player-tools__range"
              :model-value="row.sliderValue"
              :default-value="row.defaultValue"
              :min="row.min"
              :max="row.max"
              :step="row.step"
              :disabled="!hasTrack"
              :marks="row.stops.map((stop) => stop.value)"
              :value-text="row.value"
              :format-value="row.formatSliderValue"
              :aria-label="row.sliderLabel"
              @update:model-value="row.onSliderInput"
            />
          </div>
        </div>
      </div>
    </section>

    <section
      v-show="activeTab === 'process'"
      id="player-tools-process-panel"
      class="player-tools__section"
      role="tabpanel"
      aria-labelledby="player-tools-process-tab"
      tabindex="0"
    >
      <div class="player-tools__card player-tools__process-card">
        <div class="player-tools__row-header">
          <span class="player-tools__label">
            <MicVocal :size="ICON_SIZE" aria-hidden="true" />
            伴奏分離
          </span>
          <UiChip tone="gated">進階功能</UiChip>
        </div>

        <p class="player-tools__description player-tools__process-track">
          {{ currentTrack ? currentTrack.title : '請先載入歌曲' }}
        </p>

        <SeparationPresetControl
          class="player-tools__separation-control"
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
    </section>
  </PlayerBarPanel>
</template>

<style scoped>
.player-tools__tabs {
  width: 100%;
  margin-bottom: var(--ui-space-3);
}

.player-tools__tabs.ui-tabs--panel {
  border-color: transparent;
  background: var(--ui-color-surface-raised);
}

.player-tools__section {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

/* Same raised-section grammar as the right dock metadata sections. */
.player-tools__card {
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface-raised);
}

.player-tools__row-header {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
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
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.player-tools__metro-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-2);
  min-height: var(--ui-player-tools-meter-control-block-size);
  margin-bottom: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font: inherit;
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  animation: player-tools-pulse var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
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
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-caption);
}

.player-tools__beat-row {
  display: grid;
  gap: var(--ui-space-1);
  margin-bottom: var(--ui-space-3);
}

.player-tools__beat {
  height: var(--ui-player-tools-beat-block-size);
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
  min-height: var(--ui-player-tools-meter-control-block-size);
  font-size: var(--ui-font-size-md);
  transition: transform var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
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
  font-weight: var(--ui-font-weight-semibold);
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

.player-tools__range {
  --ui-range-target-size: var(--ui-control-height);

  flex: 1;
}

/* Five fixed guide-vocal stops (see PlayerBar.vue's GUIDE_VOCAL_STOPS) —
   equal-width buttons keep the fixed stops evenly distributed.
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

.player-tools__process-card {
  display: grid;
  gap: var(--ui-space-1);
}

.player-tools__separation-control {
  margin-top: var(--ui-space-2);
}

.player-tools__process-card .player-tools__row-header {
  margin-bottom: 0;
}

.player-tools__process-track {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
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
