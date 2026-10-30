<script setup>
import { computed } from 'vue';
import { recommendMicrophoneActivityThresholds } from '../../microphone/calibration.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';

const props = defineProps({
  results: { type: Object, required: true },
  options: { type: Object, required: true },
  calibrated: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  running: { type: Boolean, default: false },
});
const emit = defineEmits(['apply']);
const candidate = computed(() =>
  recommendMicrophoneActivityThresholds(props.results),
);
const messages = {
  incomplete: '先完成安靜與連續輕聲量測。',
  invalid: '資料不足，請重測安靜與輕聲。',
  conditions: '輸入條件不同，請重新量測。',
  'auto-gain': '請關閉自動增益後重測。',
  clipped: '接近削波，降低前級或分析增益後重測。',
  floor: '接近數位靜音，請檢查輸入與降噪後重測。',
  overlap: '輕聲與背景差距不足；請靠近麥克風或減少噪音後重測。',
  bounds: '門檻超出範圍，調整輸入增益後重測。',
};
function apply() {
  if (props.busy || !props.running || candidate.value.status !== 'ready')
    return;
  emit('apply');
}
</script>

<template>
  <section class="mic-calibration" aria-labelledby="mic-calibration-title">
    <div class="mic-calibration__heading">
      <h3 id="mic-calibration-title">門檻校準</h3>
      <span v-if="calibrated || options.mode === 'manual'"
        >目前 {{ options.openThreshold }}／{{
          options.closeThreshold
        }}
        dBFS</span
      >
      <span v-else>尚未校準</span>
    </div>
    <div role="status">
      <template v-if="candidate.status === 'ready'">
        <p class="mic-calibration__candidate">
          建議開啟 <output>{{ candidate.openThreshold }}</output
          >／關閉 <output>{{ candidate.closeThreshold }} dBFS</output>
        </p>
        <p class="mic-calibration__references">
          背景上緣 {{ candidate.quietDbfs.toFixed(1) }} · 輕聲下緣
          {{ candidate.voiceDbfs.toFixed(1) }} dBFS
        </p>
      </template>
      <UiHint v-else>{{ messages[candidate.status] }}</UiHint>
    </div>
    <UiButton
      class="mic-calibration__apply"
      :disabled="
        busy ||
        !running ||
        candidate.status !== 'ready' ||
        (calibrated &&
          options.mode === 'calibration' &&
          candidate.openThreshold === options.openThreshold &&
          candidate.closeThreshold === options.closeThreshold)
      "
      @click="apply"
      >套用建議門檻</UiButton
    >
    <UiHint>只調整活動顯示，不做降噪或人聲辨識；套用後清除比較。</UiHint>
  </section>
</template>

<style scoped>
.mic-calibration {
  display: grid;
  min-inline-size: 0;
  gap: var(--ui-space-2);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  padding-block-start: var(--ui-space-3);
}
.mic-calibration__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.mic-calibration h3,
.mic-calibration p {
  margin: 0;
}
.mic-calibration h3 {
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-font-weight-semibold);
}
.mic-calibration__heading span,
.mic-calibration__references {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}
.mic-calibration output {
  font-weight: var(--ui-font-weight-semibold);
  font-variant-numeric: tabular-nums;
}
.mic-calibration__apply {
  justify-self: start;
}
</style>
