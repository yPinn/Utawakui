<script setup>
import { computed } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiRange from '../ui/UiRange.vue';
import UiSelect from '../ui/UiSelect.vue';
import { normalizeMicrophoneInputOptions } from '../../microphone/inputProcessing.js';

const props = defineProps({
  options: { type: Object, required: true },
  support: { type: Object, required: true },
  settings: { type: Object, default: null },
  active: { type: Boolean, default: false },
  requesting: { type: Boolean, default: false },
  measuring: { type: Boolean, default: false },
  rawDbfs: { type: Number, default: -100 },
});
const emit = defineEmits(['configure']);
const choices = Object.freeze([
  {
    key: 'noiseSuppression',
    label: '降噪',
    hint: '抑制背景噪音。',
  },
  {
    key: 'echoCancellation',
    label: '回音消除',
    hint: '使用耳機時可關閉。',
  },
  {
    key: 'autoGainControl',
    label: '自動增益',
    hint: '固定電平量測時請關閉。',
  },
]);
const lowCutOptions = [
  { value: 0, label: '關閉' },
  ...[80, 120, 180].map((value) => ({ value, label: `${value} Hz` })),
];
const rawText = computed(() =>
  props.rawDbfs <= -100 ? '−∞ dBFS' : `${props.rawDbfs.toFixed(1)} dBFS`,
);
function processingStatus(key) {
  if (!props.support[key]) return '目前環境未確認支援';
  if (!props.settings) return '開始輸入後確認實際回報';
  const actual = props.settings[key];
  if (typeof actual !== 'boolean') return '輸入未回報，尚未確認是否生效';
  if (actual !== props.options[key])
    return `未按要求套用：實際${actual ? '開啟' : '關閉'}`;
  return `實際${actual ? '開啟' : '關閉'}`;
}
</script>

<template>
  <section
    class="mic-input-settings"
    aria-labelledby="mic-input-settings-title"
  >
    <div class="mic-input-settings__heading">
      <h2 id="mic-input-settings-title">麥克風基本設定</h2>
      <UiButton
        :disabled="active || measuring"
        @click="emit('configure', normalizeMicrophoneInputOptions())"
        >還原輸入設定</UiButton
      >
    </div>
    <label for="mic-research-device-dbfs" class="mic-input-settings__reading"
      >裝置回傳電平 <output>{{ rawText }}</output></label
    >
    <meter
      id="mic-research-device-dbfs"
      min="-100"
      max="0"
      :value="rawDbfs"
      :aria-valuetext="rawText"
    />
    <UiRange
      id="mic-input-gain"
      label="分析輸入增益"
      :model-value="options.gainDb"
      :min="-24"
      :max="24"
      :step="1"
      :default-value="0"
      :value-text="`${options.gainDb > 0 ? '+' : ''}${options.gainDb} dB`"
      :disabled="requesting || measuring"
      hint="只影響分析；增益也會放大底噪。"
      @update:model-value="emit('configure', { gainDb: $event })"
    />
    <UiSelect
      id="mic-input-highpass"
      label="低切濾波"
      :options="lowCutOptions"
      :model-value="options.highPassHz"
      :disabled="active || measuring"
      hint="減少低頻噪聲，停止後調整。"
      @update:model-value="emit('configure', { highPassHz: $event })"
    />
    <UiDisclosure label="降噪與自動處理">
      <div class="mic-input-settings__processing">
        <div v-for="choice in choices" :key="choice.key">
          <UiCheckbox
            :id="`mic-input-${choice.key}`"
            :label="choice.label"
            :model-value="options[choice.key]"
            :hint="choice.hint"
            :disabled="active || measuring || !support[choice.key]"
            @update:model-value="emit('configure', { [choice.key]: $event })"
          />
          <p class="mic-input-settings__status">
            {{ processingStatus(choice.key) }}
          </p>
        </div>
      </div>
      <UiHint>停止後調整；重啟確認回報，可能影響歌聲。</UiHint>
    </UiDisclosure>
    <UiDisclosure label="電平與處理順序">
      <UiHint
        >裝置回傳（可能含原生處理）→ 低切 → 增益 →
        分析電平。調整後需重測。</UiHint
      >
    </UiDisclosure>
  </section>
</template>

<style scoped>
.mic-input-settings {
  display: grid;
  gap: var(--ui-space-3);
  min-inline-size: 0;
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  padding-block-start: var(--ui-space-3);
}
.mic-input-settings__heading,
.mic-input-settings__reading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--ui-space-2);
}
.mic-input-settings h2 {
  margin: 0;
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-font-weight-semibold);
}
.mic-input-settings__reading output {
  font-variant-numeric: tabular-nums;
}
.mic-input-settings meter {
  inline-size: 100%;
  block-size: var(--ui-space-3);
}
.mic-input-settings meter::-webkit-meter-bar {
  background: var(--ui-color-canvas);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-xs);
}
.mic-input-settings meter::-webkit-meter-optimum-value {
  background: var(--ui-color-accent);
}
.mic-input-settings__processing {
  display: grid;
  gap: var(--ui-space-3);
}
.mic-input-settings__status {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}
</style>
