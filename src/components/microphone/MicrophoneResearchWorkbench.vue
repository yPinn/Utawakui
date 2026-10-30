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

const { state, refreshDevices, selectDevice, start, stop, configure } =
  useMicrophoneResearch();
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
  if (!settings) return '開始後顯示裝置實際回報的輸入格式。';
  const value = (enabled) =>
    enabled == null ? '未回報' : enabled ? '開' : '關';
  return `${settings.sampleRate} Hz · ${settings.channelCount ?? '未知'} 聲道 · 自動增益 ${value(settings.autoGainControl)} · 降噪 ${value(settings.noiseSuppression)} · 回音消除 ${value(settings.echoCancellation)}`;
});
</script>

<template>
  <UiScrollLayout
    class="microphone-research"
    content-class="microphone-research__content"
  >
    <UiPageHeader title="Mic 電平研究">
      <template #description
        >選擇輸入並開始測試，觀察聲音強度與畫面反應。離開此工具即停止。</template
      >
    </UiPageHeader>
    <p class="microphone-research__scope">
      本機分析原型；不回放、不錄音、不傳送至 Output。電平不代表音準或演唱品質。
    </p>
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
      <UiChip v-if="state.clipped" tone="warning"
        >接近削波，請降低輸入增益</UiChip
      >
    </div>
    <UiHint v-if="state.error" tone="warning" role="alert">{{
      state.error
    }}</UiHint>
    <div class="microphone-research__measurement">
      <label for="mic-research-dbfs"
        >輸入電平 <output>{{ dbfsText }}</output></label
      >
      <meter
        id="mic-research-dbfs"
        min="-100"
        max="0"
        :value="state.dbfs"
        :aria-valuetext="dbfsText"
      />
      <label for="mic-research-intensity"
        >畫面反應強度 <output>{{ intensityText }}</output></label
      >
      <meter
        id="mic-research-intensity"
        min="0"
        max="1"
        :value="state.intensity"
        :aria-valuetext="intensityText"
      />
      <p class="microphone-research__scope">{{ inputSettingsText }}</p>
    </div>
    <div class="microphone-research__controls">
      <UiRange
        id="mic-research-floor"
        label="噪聲門檻"
        :min="-90"
        :max="-10"
        :step="1"
        :model-value="state.controls.noiseFloor"
        :value-text="`${state.controls.noiseFloor} dBFS`"
        hint="低於門檻時，畫面反應回到零；不修改輸入音訊。"
        @update:model-value="configure({ noiseFloor: $event })"
      />
      <UiRange
        id="mic-research-sensitivity"
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
        label="反應平滑"
        :min="0"
        :max="1000"
        :step="10"
        :model-value="state.controls.smoothingMs"
        :value-text="`${state.controls.smoothingMs} ms`"
        hint="較大的值反應較緩。這些研究設定只保留到離開工具。"
        @update:model-value="configure({ smoothingMs: $event })"
      />
    </div>
  </UiScrollLayout>
</template>

<style scoped>
.microphone-research {
  block-size: 100%;
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
}
.microphone-research :deep(.microphone-research__content) {
  display: grid;
  gap: var(--ui-space-4);
  align-content: start;
  max-inline-size: 52rem;
  padding: var(--ui-space-2);
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
  border-block: var(--ui-border-width) solid var(--ui-color-border);
  padding-block: var(--ui-space-4);
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
</style>
