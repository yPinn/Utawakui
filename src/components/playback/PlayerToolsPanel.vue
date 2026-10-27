<script setup>
import { computed } from 'vue';
import {
  ICON_SIZE,
  Metronome,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from '../../icons/index.js';
import {
  METRONOME_BPM_RANGE,
  METRONOME_BEATS_RANGE,
  useMetronome,
} from '../../composables/useMetronome.js';
import { useAppRightDockWidth } from '../../composables/useAppRightDockWidth.js';
import UiPopover from '../ui/UiPopover.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiButton from '../ui/UiButton.vue';
import UiButtonGroup from '../ui/UiButtonGroup.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiTabs from '../ui/UiTabs.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiHint from '../ui/UiHint.vue';
import PlayerPerformanceSettingsControls from './PlayerPerformanceSettingsControls.vue';

defineProps({
  open: { type: Boolean, default: false },
  activeTab: {
    type: String,
    default: 'adjust',
    validator: (value) => ['adjust', 'guide', 'live'].includes(value),
  },
  hasTrack: { type: Boolean, default: false },
  guideVocalVisible: { type: Boolean, default: false },
  guideVocalRows: { type: Array, default: () => [] },
  pitchTempoRows: { type: Array, default: () => [] },
  performanceSettings: { type: Object, default: null },
});

const emit = defineEmits(['update:open', 'update:activeTab', 'settingsAction']);
const { width: dockWidth } = useAppRightDockWidth();
const panelStyle = computed(() => ({
  inlineSize: `${dockWidth.value}px`,
  userSelect: 'none',
}));

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
  setVolume,
} = useMetronome();

function formatMetronomeVolume(value) {
  return `${Math.round(value * 100)}%`;
}

const tabItems = [
  { id: 'adjust', label: '調整' },
  { id: 'guide', label: '導唱' },
  { id: 'live', label: '節拍器' },
];

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
</script>

<template>
  <UiPopover
    :open="open"
    :close-on-scroll="false"
    :panel-style="panelStyle"
    aria-label="演出工具"
    placement="top-end"
    scroll-axis="vertical"
    scroll-aria-label="演出工具內容"
    focus-on-open
    @update:open="emit('update:open', $event)"
  >
    <template #trigger="{ triggerProps }">
      <slot name="trigger" :trigger-props="triggerProps" />
    </template>
    <template #header>
      <div class="player-tools__heading">
        <h2>演出工具</h2>
        <UiIconButton
          :icon="X"
          label="關閉演出工具"
          @click="emit('update:open', false)"
        />
      </div>
    </template>
    <UiTabs
      class="player-tools__tabs"
      :items="tabItems"
      :active-id="activeTab"
      aria-label="工具分組"
      tab-id-prefix="player-tools"
      panel-id-prefix="player-tools"
      variant="bar"
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
      <div class="player-tools__metronome">
        <div class="player-tools__metro-main">
          <UiButtonGroup label="節拍器速度">
            <UiIconButton
              :icon="Minus"
              label="降低 BPM"
              :disabled="metronome.bpm <= METRONOME_BPM_RANGE.min"
              @click="adjustBpm(-1)"
            />
            <span class="player-tools__stepper-value player-tools__bpm-value">
              <strong>{{ metronome.bpm }}</strong>
              <small>BPM</small>
            </span>
            <UiIconButton
              :icon="Plus"
              label="提高 BPM"
              :disabled="metronome.bpm >= METRONOME_BPM_RANGE.max"
              @click="adjustBpm(1)"
            />
          </UiButtonGroup>
          <div class="player-tools__metro-actions">
            <UiIconButton :icon="RotateCcw" label="重設節拍器" @click="reset" />

            <UiIconButton
              :icon="metronome.isRunning ? Pause : Play"
              :active="metronome.isRunning"
              :label="metronome.isRunning ? '停止節拍器' : '啟動節拍器'"
              :aria-pressed="metronome.isRunning"
              @click="toggle"
            />
          </div>
          <UiButtonGroup label="每小節拍數">
            <UiIconButton
              :icon="Minus"
              label="減少拍數"
              :disabled="metronome.beatsPerBar <= METRONOME_BEATS_RANGE.min"
              @click="adjustBeatsPerBar(-1)"
            />
            <span class="player-tools__stepper-value">
              <strong>{{ metronome.beatsPerBar }}</strong>
              <small>BEATS</small>
            </span>
            <UiIconButton
              :icon="Plus"
              label="增加拍數"
              :disabled="metronome.beatsPerBar >= METRONOME_BEATS_RANGE.max"
              @click="adjustBeatsPerBar(1)"
            />
          </UiButtonGroup>
          <div
            class="player-tools__metro-beats"
            role="img"
            :aria-label="`拍點 ${currentBeatLabel}`"
          >
            <span class="player-tools__description">{{
              currentBeatLabel
            }}</span>
            <div
              class="player-tools__beat-row"
              :style="{
                gridTemplateColumns:
                  'repeat(' + metronome.beatsPerBar + ', 1fr)',
              }"
              aria-hidden="true"
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
          </div>
        </div>

        <div
          class="player-tools__metro-volume"
          role="group"
          aria-label="節拍音量"
        >
          <UiIconButton
            :icon="metronome.soundEnabled ? Volume2 : VolumeX"
            :active="metronome.soundEnabled"
            :label="
              metronome.soundEnabled ? '關閉節拍器音效' : '開啟節拍器音效'
            "
            :aria-pressed="metronome.soundEnabled"
            @click="toggleSound"
          />
          <UiRangeControl
            :model-value="metronome.volume"
            :default-value="1"
            :min="0"
            :max="1"
            :step="0.05"
            :value-text="formatMetronomeVolume(metronome.volume)"
            :format-value="formatMetronomeVolume"
            aria-label="節拍音量"
            @update:model-value="setVolume"
          />
        </div>

        <UiNotice
          v-if="metronome.soundError"
          title="節拍音效已停止"
          :message="metronome.soundError"
          compact
        />

        <div class="player-tools__tap-row">
          <span
            class="player-tools__description player-tools__tap-hint"
            role="status"
            >{{ metronome.tapCount === 1 ? '再點一下' : '' }}</span
          >
          <UiIconButton
            :icon="RotateCcw"
            :disabled="metronome.tapCount === 0"
            label="清除點擊記錄"
            @click="resetTaps"
          />
          <UiButton
            :icon="Metronome"
            variant="secondary"
            title="連續點擊 2 次以上估算 BPM"
            @click="tapTempo()"
            >點擊測速</UiButton
          >
        </div>
        <p
          v-if="trackTempoHint"
          class="player-tools__description player-tools__tempo-hint"
        >
          {{ trackTempoHint }}
        </p>
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
      <div class="player-tools__group">
        <template v-for="(row, index) in pitchTempoRows" :key="row.key">
          <UiSeparator v-if="index > 0" />
          <div class="player-tools__adjust-row">
            <div class="player-tools__row-header">
              <span class="player-tools__label">{{ row.label }}</span>
              <span class="player-tools__value">
                <span
                  v-if="row.secondaryValue"
                  class="player-tools__value-secondary"
                  >{{ row.secondaryValue }} ·</span
                >
                <span>{{ row.value }}</span>
              </span>
            </div>
            <div class="player-tools__control">
              <UiIconButton
                :icon="Minus"
                :disabled="row.minusDisabled"
                :label="row.minusLabel"
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
              <UiIconButton
                :icon="Plus"
                :disabled="row.plusDisabled"
                :label="row.plusLabel"
                :title="row.plusTitle"
                @click="row.onPlus"
              />
            </div>
          </div>
        </template>
      </div>
    </section>

    <section
      v-show="activeTab === 'guide'"
      id="player-tools-guide-panel"
      class="player-tools__section"
      role="tabpanel"
      aria-labelledby="player-tools-guide-tab"
      tabindex="0"
    >
      <UiHint v-if="!guideVocalVisible">使用伴奏音訊後可調整導唱比例。</UiHint>
      <div v-else class="player-tools__group">
        <template v-for="(row, index) in guideVocalRows" :key="row.key">
          <UiSeparator v-if="index > 0" />
          <div class="player-tools__adjust-row">
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
              <UiIconButton
                :icon="row.onIcon"
                :active="row.on"
                :label="row.onLabel"
                :aria-pressed="row.on"
                :title="row.onLabel"
                @click="row.onToggle"
              />
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
                :marks="row.marks"
                :value-text="row.value"
                :format-value="row.formatSliderValue"
                :aria-label="row.sliderLabel"
                @update:model-value="row.onSliderInput"
              />
            </div>
          </div>
        </template>
      </div>
    </section>
    <template v-if="performanceSettings && activeTab !== 'live'" #footer>
      <PlayerPerformanceSettingsControls
        :state="performanceSettings"
        @action="emit('settingsAction', $event)"
      />
    </template>
  </UiPopover>
</template>

<style scoped>
.player-tools__tabs {
  width: 100%;
  margin-bottom: var(--ui-space-3);
}

.player-tools__section {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.player-tools__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.player-tools__heading h2 {
  margin: 0;
  font: inherit;
}

.player-tools__group {
  display: grid;
  gap: var(--ui-space-1);
}

.player-tools__row-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-1);
  margin-bottom: 0;
}

.player-tools__label {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.player-tools__metronome {
  display: grid;
  gap: var(--ui-space-2);
}

.player-tools__metro-main {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  column-gap: var(--ui-space-2);
  row-gap: var(--ui-space-2);
}

.player-tools__metro-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-1);
}

.player-tools__metro-volume {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-2);
}

.player-tools__metro-beats {
  padding-inline: var(--ui-space-1);
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.player-tools__beat-row {
  display: grid;
  gap: var(--ui-space-1);
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

.player-tools__stepper-value {
  flex: 1;
  min-width: 4ch;
  padding-inline: var(--ui-space-1);
  display: grid;
  place-content: center;
  justify-items: center;
  color: var(--ui-color-text);
  font-variant-numeric: tabular-nums;
}

.player-tools__stepper-value strong {
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.player-tools__stepper-value small,
.player-tools__description {
  display: block;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.player-tools__stepper-value small {
  font-size: calc(var(--ui-type-caption-size) - 0.125rem);
  line-height: var(--ui-line-height-label);
}

.player-tools__tap-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}

.player-tools__tap-hint {
  min-width: 0;
  margin-inline-end: auto;
}

.player-tools__tempo-hint {
  margin: 0;
}

.player-tools__adjust-row {
  display: grid;
  gap: var(--ui-space-1);
}

.player-tools__value {
  display: inline-flex;
  align-items: baseline;
  gap: var(--ui-space-1);
  text-align: end;
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
  font-variant-numeric: tabular-nums;
}

.player-tools__value-secondary {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: normal;
  font-variant-numeric: tabular-nums;
}

.player-tools__control {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.player-tools__range {
  --ui-range-target-size: var(--ui-control-height);

  flex: 1;
}
</style>
