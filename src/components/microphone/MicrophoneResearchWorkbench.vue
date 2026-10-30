<script setup>
import { computed } from 'vue';
import { useMicrophoneResearch } from '../../composables/useMicrophoneResearch.js';
import UiButton from '../ui/UiButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiRange from '../ui/UiRange.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import { useMicrophoneMeasurement } from '../../composables/useMicrophoneMeasurement.js';
import MicrophoneLevelHistory from './MicrophoneLevelHistory.vue';
import MicrophoneMeasurementPanel from './MicrophoneMeasurementPanel.vue';
import MicrophoneInputSettings from './MicrophoneInputSettings.vue';
import MicrophoneActivitySettings from './MicrophoneActivitySettings.vue';

const {
  state,
  refreshDevices,
  selectDevice,
  start,
  stop,
  configure,
  configureInput,
  configureActivity,
  applyActivityCalibration,
} = useMicrophoneResearch();
const {
  state: measurement,
  busy: measuring,
  begin: beginMeasurement,
  cancel: cancelMeasurement,
  clear: clearMeasurements,
  applyCalibration: applyMeasuredCalibration,
} = useMicrophoneMeasurement(state);
const active = computed(() =>
  ['requesting', 'running'].includes(state.value.status),
);
const options = computed(() =>
  state.value.devices.map((device) => ({
    value: device.id,
    label: device.label,
  })),
);
const statusText = computed(
  () =>
    ({
      idle: '尚未開始',
      requesting: '正在啟動輸入',
      running: '正在分析輸入',
      lost: '輸入已中斷',
      error: '操作未完成',
    })[state.value.status],
);
const dbfsText = computed(() =>
  state.value.dbfs <= -100 ? '−∞ dBFS' : `${state.value.dbfs.toFixed(1)} dBFS`,
);
const intensityText = computed(
  () => `${Math.round(state.value.intensity * 100)}%`,
);
const inputSettingsText = computed(() => {
  const settings = state.value.settings;
  if (!settings) return '';
  return `${settings.sampleRate} Hz · ${settings.channelCount ?? '未知'} 聲道 · 分析增益 ${settings.gainDb} dB · 低切 ${settings.highPassHz ? `${settings.highPassHz} Hz` : '關閉'}`;
});
</script>

<template>
  <UiScrollLayout
    class="microphone-research"
    content-class="microphone-research__content"
  >
    <div class="microphone-research__setup">
      <UiPageHeader title="Mic 輸入" />
      <div class="microphone-research__input">
        <UiSelect
          id="mic-research-device"
          label="音訊輸入"
          :model-value="state.selectedDeviceId"
          :options="options"
          placeholder="先讀取裝置，再選擇輸入"
          :disabled="active || state.refreshing"
          @update:model-value="selectDevice"
        />
        <div class="microphone-research__actions">
          <UiButton
            :disabled="active || state.refreshing"
            @click="refreshDevices"
            >{{ state.refreshing ? '讀取中…' : '讀取裝置' }}</UiButton
          >
          <UiButton v-if="active" variant="accent" @click="stop"
            >停止輸入</UiButton
          >
          <UiButton
            v-else
            variant="accent"
            :disabled="!state.selectedDeviceId || state.refreshing"
            @click="start"
            >開始測試</UiButton
          >
        </div>
      </div>
      <div class="microphone-research__status" role="status">
        <UiChip :tone="state.status === 'running' ? 'success' : 'muted'">{{
          statusText
        }}</UiChip>
        <UiChip v-if="state.rawClipped" tone="warning"
          >裝置回傳接近削波，請降低麥克風或 VM 增益</UiChip
        >
        <UiChip v-else-if="state.clipped" tone="warning"
          >分析電平接近削波，請降低分析增益</UiChip
        >
      </div>
      <UiHint v-if="state.error" tone="warning" role="alert">{{
        state.error
      }}</UiHint>
      <MicrophoneInputSettings
        :options="state.inputOptions"
        :support="state.processingSupport"
        :settings="state.settings"
        :raw-dbfs="state.rawDbfs"
        :active="active"
        :requesting="state.status === 'requesting'"
        :measuring="measuring"
        @configure="configureInput"
      />
      <UiHint>不錄音、不監聽；離開即停止。</UiHint>
    </div>
    <div class="microphone-research__results">
      <MicrophoneActivitySettings
        :options="state.activityOptions"
        :activity="state.activity"
        :calibrated="state.activityCalibrated"
        :busy="measuring"
        :requesting="state.status === 'requesting'"
        @configure="configureActivity"
      />

      <div class="microphone-research__measurement">
        <label for="mic-research-dbfs"
          >分析後電平 <output>{{ dbfsText }}</output></label
        >
        <meter
          id="mic-research-dbfs"
          min="-100"
          max="0"
          :value="state.dbfs"
          :aria-valuetext="dbfsText"
        />
        <label for="mic-research-intensity"
          >相對電平 <output>{{ intensityText }}</output></label
        >
        <meter
          id="mic-research-intensity"
          min="0"
          max="1"
          :value="state.intensity"
          :aria-valuetext="intensityText"
        />
        <p v-if="inputSettingsText" class="microphone-research__scope">
          {{ inputSettingsText }}
        </p>
      </div>
      <MicrophoneLevelHistory
        :history="measurement.history"
        :activity-options="state.activityOptions"
        :activity-enabled="
          state.activityOptions.mode === 'manual' || state.activityCalibrated
        "
      />
      <MicrophoneMeasurementPanel
        :state="measurement"
        :busy="measuring"
        :running="state.status === 'running'"
        :activity-options="state.activityOptions"
        :calibrated="state.activityCalibrated"
        @begin="beginMeasurement"
        @cancel="cancelMeasurement"
        @clear="clearMeasurements"
        @apply-calibration="applyMeasuredCalibration(applyActivityCalibration)"
      />
    </div>
    <UiDisclosure
      class="microphone-research__display-options"
      label="相對電平投影設定"
    >
      <div class="microphone-research__controls">
        <UiRange
          id="mic-research-floor"
          :disabled="measuring"
          label="相對電平門檻"
          :min="-90"
          :max="-10"
          :step="1"
          :model-value="state.controls.noiseFloor"
          :value-text="`${state.controls.noiseFloor} dBFS`"
          hint="只調整相對電平比例，與活動雙門檻分開。"
          @update:model-value="configure({ noiseFloor: $event })"
        />
        <UiRange
          id="mic-research-sensitivity"
          :disabled="measuring"
          label="反應靈敏度"
          :min="0.25"
          :max="4"
          :step="0.25"
          :model-value="state.controls.sensitivity"
          :value-text="`${state.controls.sensitivity}×`"
          @update:model-value="configure({ sensitivity: $event })"
        />
        <UiRange
          id="mic-research-smoothing"
          :disabled="measuring"
          label="反應平滑"
          :min="0"
          :max="1000"
          :step="10"
          :model-value="state.controls.smoothingMs"
          :value-text="`${state.controls.smoothingMs} ms`"
          hint="數值越大，反應越緩。"
          @update:model-value="configure({ smoothingMs: $event })"
        />
      </div>
    </UiDisclosure>
  </UiScrollLayout>
</template>

<style scoped>
.microphone-research {
  block-size: 100%;
  color: var(--ui-color-text);
}
.microphone-research :deep(.microphone-research__content) {
  display: grid;
  gap: var(--ui-space-4);
  align-content: start;
  grid-template-columns: minmax(16rem, 0.85fr) minmax(0, 1.5fr);
  align-items: start;
  padding-inline-end: var(--ui-space-2);
}
.microphone-research__setup,
.microphone-research__results {
  display: grid;
  min-inline-size: 0;
  gap: var(--ui-space-3);
}
.microphone-research__results {
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
  padding-inline-start: var(--ui-space-4);
}
.microphone-research__display-options {
  grid-column: 1 / -1;
}
.microphone-research__scope {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}
.microphone-research__input {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
}
.microphone-research__input > :first-child {
  flex: 1 1 20rem;
  min-inline-size: 0;
}
.microphone-research__actions,
.microphone-research__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
}
.microphone-research__status {
  min-block-size: var(--ui-control-height);
}
.microphone-research__measurement,
.microphone-research__controls {
  display: grid;
  gap: var(--ui-space-3);
}
.microphone-research__measurement {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding-block-end: var(--ui-space-3);
}
.microphone-research__measurement > :nth-child(1) {
  grid-column: 1;
  grid-row: 1;
}
.microphone-research__measurement > :nth-child(2) {
  grid-column: 1;
  grid-row: 2;
}
.microphone-research__measurement > :nth-child(3) {
  grid-column: 2;
  grid-row: 1;
}
.microphone-research__measurement > :nth-child(4) {
  grid-column: 2;
  grid-row: 2;
}
.microphone-research__measurement > p {
  grid-column: 1 / -1;
}
.microphone-research__measurement label {
  display: flex;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.microphone-research__measurement output {
  font-variant-numeric: tabular-nums;
}
.microphone-research meter {
  inline-size: 100%;
  block-size: var(--ui-space-3);
}
.microphone-research meter::-webkit-meter-bar {
  background: var(--ui-color-surface);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-xs);
}
.microphone-research meter::-webkit-meter-optimum-value {
  background: var(--ui-color-accent);
}
@container app-folder-layout (max-width: 52rem) {
  .microphone-research :deep(.microphone-research__content) {
    grid-template-columns: minmax(0, 1fr);
  }
  .microphone-research__results {
    border-inline-start: 0;
    padding-inline-start: 0;
  }
}
</style>
