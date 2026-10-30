<script setup>
import { computed, shallowRef } from 'vue';
import { MICROPHONE_MEASUREMENT_STEPS } from '../../microphone/measurement.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiProgress from '../ui/UiProgress.vue';
import MicrophoneThresholdCalibration from './MicrophoneThresholdCalibration.vue';

const props = defineProps({
  state: { type: Object, required: true },
  running: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  activityOptions: { type: Object, required: true },
  calibrated: { type: Boolean, default: false },
});
const emit = defineEmits(['begin', 'cancel', 'clear', 'apply-calibration']);
const selected = shallowRef('quiet');
const step = computed(() =>
  MICROPHONE_MEASUREMENT_STEPS.find((s) => s.id === selected.value),
);
const rows = computed(() =>
  MICROPHONE_MEASUREMENT_STEPS.map((s) => ({
    ...s,
    result: props.state.results[s.id],
  })),
);
const remaining = computed(() => Math.ceil(props.state.remainingMs / 1000));
const displayedPhase = computed(() =>
  props.busy
    ? props.state.phase
    : props.state.results[selected.value]
      ? 'complete'
      : 'idle',
);
const phaseText = computed(() =>
  displayedPhase.value === 'countdown'
    ? `${remaining.value} 秒後開始`
    : displayedPhase.value === 'measuring'
      ? `量測中，剩餘 ${remaining.value} 秒`
      : displayedPhase.value === 'complete'
        ? '本步已完成'
        : '準備就緒後開始量測',
);
const progress = computed(() =>
  displayedPhase.value === 'countdown'
    ? 0
    : displayedPhase.value === 'measuring'
      ? 10000 - props.state.remainingMs
      : displayedPhase.value === 'complete'
        ? 10000
        : 0,
);
const format = (value) => `${value.toFixed(1)} dBFS`;
</script>

<template>
  <section class="mic-measurement" aria-labelledby="mic-measurement-title">
    <h2 id="mic-measurement-title">依序量測</h2>
    <div class="mic-measurement__steps" role="group" aria-label="量測情境">
      <UiButton
        v-for="(item, index) in MICROPHONE_MEASUREMENT_STEPS"
        :key="item.id"
        :active="selected === item.id"
        :aria-pressed="selected === item.id"
        :disabled="busy"
        @click="selected = item.id"
        >{{ index + 1 }}. {{ item.label }}</UiButton
      >
    </div>
    <p class="mic-measurement__instruction">{{ step.instruction }}</p>
    <p class="mic-measurement__phase" role="status">{{ phaseText }}</p>
    <UiProgress
      label="本步量測進度"
      label-hidden
      :value="progress"
      :max="10000"
    />
    <div class="mic-measurement__actions">
      <UiButton
        :disabled="busy || !Object.keys(state.results).length"
        @click="emit('clear')"
        >清除結果</UiButton
      >
      <UiButton
        variant="accent"
        :disabled="!busy && !running"
        @click="busy ? emit('cancel') : emit('begin', selected)"
        >{{
          busy
            ? '取消本步'
            : `${state.results[selected] ? '重測' : '開始'}${step.label}量測`
        }}</UiButton
      >
    </div>
    <UiHint v-if="!running">先選擇裝置並開始輸入。</UiHint>
    <UiHint v-if="state.notice" role="status">{{ state.notice }}</UiHint>
    <div class="mic-measurement__results">
      <div v-for="row in rows" :key="row.id" class="mic-measurement__row">
        <strong>{{ row.label }}</strong>
        <template v-if="row.result"
          ><span
            >中位 {{ format(row.result.medianDbfs) }} · 最高
            {{ format(row.result.maxDbfs) }}</span
          ><span>{{ row.result.count }} 筆</span></template
        >
        <span v-else>尚未量測</span>
      </div>
    </div>
    <MicrophoneThresholdCalibration
      :results="state.results"
      :options="activityOptions"
      :calibrated="calibrated"
      :busy="busy"
      :running="running"
      @apply="emit('apply-calibration', state.results)"
    />
    <UiHint
      >每步準備 3 秒、量測 10
      秒；維持距離與音量。結果僅留本次操作，不代表音準。</UiHint
    >
  </section>
</template>

<style scoped>
.mic-measurement {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  padding-block-start: var(--ui-space-4);
}
.mic-measurement h2 {
  margin: 0;
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-font-weight-semibold);
}
.mic-measurement__steps,
.mic-measurement__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.mic-measurement__actions {
  justify-content: flex-end;
}
.mic-measurement__instruction,
.mic-measurement__phase {
  margin: 0;
}
.mic-measurement__phase {
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-font-weight-semibold);
  font-variant-numeric: tabular-nums;
}
.mic-measurement__results {
  display: grid;
}
.mic-measurement__row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ui-space-2) var(--ui-space-4);
  padding-block: var(--ui-space-2);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  font-size: var(--ui-type-caption-size);
}
.mic-measurement__row strong {
  min-inline-size: 4ch;
}
.mic-measurement__row span:last-child {
  margin-inline-start: auto;
}
</style>
