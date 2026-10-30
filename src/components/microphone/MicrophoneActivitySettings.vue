<script setup>
import { computed } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiRange from '../ui/UiRange.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

const props = defineProps({
  options: { type: Object, required: true },
  activity: { type: Object, required: true },
  calibrated: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  requesting: { type: Boolean, default: false },
});
const emit = defineEmits(['configure']);
const locked = computed(() => props.busy || props.requesting);
const labels = {
  idle: '輸入未啟動',
  uncalibrated: '尚未校準',
  paused: '暫停判斷',
  armed: '等待活動',
  confirming: '確認中',
  active: '輸入活動',
  holding: '保持中',
  releasing: '退場中',
};
const modes = [
  { id: 'calibration', label: '校準建議' },
  { id: 'manual', label: '手動' },
];
const timings = [
  { key: 'attackMs', label: '啟動確認', max: 500 },
  { key: 'holdMs', label: '保持時間', max: 2000 },
  { key: 'releaseMs', label: '退場時間', max: 2000 },
];
</script>

<template>
  <section class="mic-activity-settings" aria-labelledby="mic-activity-title">
    <div class="mic-activity-settings__heading">
      <h2 id="mic-activity-title">輸入活動</h2>
      <UiChip :tone="activity.active ? 'success' : 'muted'">{{
        labels[activity.phase]
      }}</UiChip>
    </div>
    <UiSegmentedControl
      :items="modes"
      :model-value="options.mode"
      :disabled="locked"
      aria-label="輸入活動設定模式"
      @update:model-value="emit('configure', { mode: $event })"
    />
    <label class="mic-activity-settings__reading" for="mic-activity-envelope"
      >活動反應
      <output>{{ Math.round(activity.intensity * 100) }}%</output></label
    >
    <meter
      id="mic-activity-envelope"
      min="0"
      max="1"
      :value="activity.intensity"
      :aria-valuetext="`${Math.round(activity.intensity * 100)}%`"
    />
    <UiHint v-if="options.mode === 'calibration' && !calibrated"
      >請在下方量測並套用校準。</UiHint
    >
    <UiHint v-else
      >開啟 {{ options.openThreshold }}／關閉 {{ options.closeThreshold }} dBFS
      · {{ options.mode === 'manual' ? '手動，未校準' : '已校準' }}</UiHint
    >
    <UiDisclosure label="門檻與時間" :open="options.mode === 'manual'">
      <div class="mic-activity-settings__controls">
        <UiRange
          id="mic-activity-open"
          label="開啟門檻"
          :model-value="options.openThreshold"
          :min="options.closeThreshold + 1"
          :max="-10"
          :step="1"
          :disabled="locked || options.mode !== 'manual'"
          :value-text="`${options.openThreshold} dBFS`"
          @update:model-value="emit('configure', { openThreshold: $event })"
        />
        <UiRange
          id="mic-activity-close"
          label="關閉門檻"
          :model-value="options.closeThreshold"
          :min="-90"
          :max="options.openThreshold - 1"
          :step="1"
          :disabled="locked || options.mode !== 'manual'"
          :value-text="`${options.closeThreshold} dBFS`"
          @update:model-value="emit('configure', { closeThreshold: $event })"
        />
        <UiRange
          v-for="item in timings"
          :id="`mic-activity-${item.key}`"
          :key="item.key"
          :label="item.label"
          :model-value="options[item.key]"
          :min="0"
          :max="item.max"
          :step="1"
          :disabled="locked"
          :value-text="`${options[item.key]} ms`"
          @update:model-value="emit('configure', { [item.key]: $event })"
        />
        <UiButton
          :disabled="locked"
          @click="
            emit('configure', { attackMs: 25, holdMs: 200, releaseMs: 150 })
          "
          >還原時間設定</UiButton
        >
        <UiHint>只影響活動顯示，時間受取樣間隔影響。</UiHint>
      </div>
    </UiDisclosure>
  </section>
</template>

<style scoped>
.mic-activity-settings {
  display: grid;
  min-inline-size: 0;
  gap: var(--ui-space-2);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  padding-block-start: var(--ui-space-3);
}
.mic-activity-settings__heading,
.mic-activity-settings__reading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.mic-activity-settings h2 {
  margin: 0;
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-font-weight-semibold);
}
.mic-activity-settings output {
  font-variant-numeric: tabular-nums;
}
.mic-activity-settings__controls {
  display: grid;
  gap: var(--ui-space-3);
}
.mic-activity-settings meter {
  inline-size: 100%;
  block-size: var(--ui-space-3);
}
.mic-activity-settings meter::-webkit-meter-bar {
  background: var(--ui-color-canvas);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-xs);
}
.mic-activity-settings meter::-webkit-meter-optimum-value {
  background: var(--ui-color-accent);
}
</style>
