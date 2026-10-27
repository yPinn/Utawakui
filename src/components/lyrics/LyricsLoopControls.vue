<script setup>
import { computed, ref } from 'vue';
import {
  Play,
  Pause,
  RotateCcw,
  SlidersHorizontal,
} from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiHint from '../ui/UiHint.vue';
import { formatDuration } from '../../utils/format.js';

const props = defineProps({ practice: { type: Object, required: true } });
const emit = defineEmits(['action']);
const detailsOpen = ref(false);
const pointLabel = (point) => (point === 'a' ? '起點' : '終點');
const time = (value) =>
  Number.isFinite(value) ? formatDuration(value).padStart(5, '0') : '未設定';
const gaps = [0, 1, 2, 4].map((value) => ({
  value,
  label: value === 0 ? '不等待' : `${value} 秒`,
}));
const errors = {
  'source-or-range': '音源或區間已變更，請重新選曲或設定起點與終點。',
  seek: '返回位置未確認，請重新設定區間。',
  play: '音訊尚未就緒，請確認後按播放重試。',
  interrupted: '播放觀察已中斷，請按播放繼續。',
  media: '音訊無法播放，請重新選曲。',
  busy: '音訊工具正在使用中，請稍後重試。',
};
const status = computed(() => {
  const p = props.practice;
  if (p.unavailableReason) return p.unavailableReason;
  if (p.error) return errors[p.error] ?? '練習已暫停，請重新設定區間。';
  if (p.loading) return '正在確認音源…';
  if (p.phase === 'source-changing') return '正在更新音訊來源…';
  if (p.phase === 'returning') return '正在返回起點…';
  if (p.phase === 'gap') return `等待 ${p.waitingSeconds} 秒後續唱`;
  const rest = p.gapSeconds ? `每輪休息 ${p.gapSeconds} 秒` : '每輪不等待';
  if (p.running) return `練習中 · ${rest}`;
  if (p.enabled) return `已暫停 · ${rest}`;
  if (p.a === null || p.b === null) return `標記起點與終點 · ${rest}`;
  return p.canEnable ? rest : '起點與終點至少間隔 0.5 秒';
});
</script>

<template>
  <div class="player-practice">
    <div class="player-practice__primary">
      <UiButton
        v-for="point in ['a', 'b']"
        :key="point"
        variant="secondary"
        :disabled="Boolean(practice.unavailableReason) || practice.loading"
        :title="`將目前位置設為${pointLabel(point)}`"
        :aria-label="`將目前位置設為${pointLabel(point)}，${time(practice[point])}`"
        @click="emit('action', { kind: 'capture', point })"
        ><span class="player-practice__mark"
          ><span>標{{ pointLabel(point) }}</span
          ><small>{{ time(practice[point]) }}</small></span
        ></UiButton
      >
      <UiIconButton
        :icon="RotateCcw"
        label="清除練習區間"
        title="清除標記與循環"
        :disabled="
          Boolean(practice.unavailableReason) ||
          (practice.a === null && practice.b === null)
        "
        @click="emit('action', { kind: 'clear' })"
      />
      <UiIconButton
        :icon="practice.running ? Pause : Play"
        :active="practice.running"
        :label="practice.running ? '暫停片段練習' : '開始片段練習'"
        :disabled="
          Boolean(practice.unavailableReason) ||
          (!practice.running && !practice.canEnable)
        "
        :loading="practice.loading"
        loading-label="正在確認音源"
        @click="emit('action', { kind: 'toggle' })"
      />
      <UiIconButton
        :icon="SlidersHorizontal"
        label="進階設定"
        :active="detailsOpen"
        :aria-expanded="detailsOpen"
        aria-controls="practice-details"
        @click="detailsOpen = !detailsOpen"
      />
    </div>
    <UiHint role="status" :tone="practice.error ? 'danger' : 'muted'">{{
      status
    }}</UiHint>
    <div
      v-if="detailsOpen"
      id="practice-details"
      class="player-practice__details"
    >
      <div class="player-practice__points">
        <UiTextField
          v-for="point in ['a', 'b']"
          :id="`practice-${point}`"
          :key="point"
          :label="`${pointLabel(point)}（秒）`"
          type="number"
          :model-value="practice[point] ?? ''"
          min="0"
          step="0.1"
          :disabled="Boolean(practice.unavailableReason) || practice.loading"
          @update:model-value="
            emit('action', { kind: 'point', point, value: $event })
          "
        />
      </div>
      <UiSelect
        id="practice-gap"
        label="每輪休息"
        :model-value="practice.gapSeconds"
        :options="gaps"
        :disabled="Boolean(practice.unavailableReason)"
        @update:model-value="emit('action', { kind: 'gap', value: $event })"
      />
    </div>
  </div>
</template>
<style scoped>
.player-practice,
.player-practice__details {
  display: grid;
  gap: var(--ui-space-3);
}
.player-practice__primary {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}
.player-practice__points {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-2);
}
.player-practice__primary > .ui-btn {
  flex: 1;
  min-width: 0;
}
.player-practice__mark {
  display: grid;
  gap: var(--ui-space-1);
  font-variant-numeric: tabular-nums;
}
.player-practice__mark small {
  font-size: var(--ui-type-caption-size);
  color: var(--ui-color-text-muted);
  font-weight: normal;
}
</style>
