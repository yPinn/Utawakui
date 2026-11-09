<script setup>
import { computed, shallowRef, watch } from 'vue';
import { useMicrophoneResearch } from '../../composables/useMicrophoneResearch.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiRange from '../ui/UiRange.vue';
import UiSelect from '../ui/UiSelect.vue';

const emit = defineEmits(['frame']);
const props = defineProps({
  access: { type: Object, default: undefined },
  stopWhenHidden: { type: Boolean, default: false },
  listOnOpen: { type: Boolean, default: false },
  playing: { type: Boolean, default: undefined },
  preferSystemDefault: { type: Boolean, default: false },
});
const { state, refreshDevices, selectDevice, start, stop, configureInput } =
  useMicrophoneResearch({
    access: props.access,
    stopWhenHidden: props.stopWhenHidden,
    preferSystemDefault: props.preferSystemDefault,
  });
const running = computed(() => state.value.status === 'running');
const active = computed(
  () => running.value || state.value.status === 'requesting',
);
const lowCutOptions = [
  { value: 0, label: '關閉' },
  { value: 80, label: '輕' },
  { value: 120, label: '中' },
  { value: 180, label: '強' },
];
const tuningOpen = shallowRef(false);
const noiseHint = computed(() => {
  if (!state.value.processingSupport.noiseSuppression)
    return '此裝置未確認支援降噪。';
  if (!state.value.settings) return '';
  const enabled = state.value.settings.noiseSuppression;
  if (enabled === null) return '裝置未回報降噪狀態。';
  return enabled ? '降噪已開啟。' : '降噪已關閉。';
});
const levelText = (dbfs) =>
  dbfs <= -100 ? '−∞ dBFS' : `${dbfs.toFixed(1)} dBFS`;
const options = computed(() =>
  state.value.devices.map(({ id, label }) => ({ value: id, label })),
);
const showRefresh = computed(
  () =>
    !props.listOnOpen ||
    (!state.value.refreshing &&
      (!options.value.length || Boolean(state.value.error))),
);
const placeholder = computed(() => {
  if (!props.listOnOpen) return '先讀取裝置，再選擇麥克風';
  if (state.value.refreshing) return '正在讀取裝置…';
  return options.value.length ? '選擇麥克風' : '找不到麥克風';
});
const statusHint = computed(() => {
  if (state.value.status === 'requesting') return '正在啟動麥克風…';
  if (!props.listOnOpen) return '播放時繪製實唱線。關閉面板即停止輸入。';
  if (!running.value) return '';
  if (props.playing === undefined) return '麥克風使用中。離開跟唱即停止。';
  if (!props.playing) return '麥克風已啟用，播放後顯示實唱線。';
  const frames = state.value.pitchHistory;
  const latest = frames.at(-1);
  const lastVoiced = frames.findLast(({ hz }) => hz !== null);
  // Brief unvoiced gaps between syllables should not flicker the status.
  return lastVoiced && latest.atMs - lastVoiced.atMs <= 250
    ? '收音中，已偵測到音高。'
    : '收音中，等待歌聲。';
});

watch(
  () => props.listOnOpen,
  (open) => {
    if (open && !active.value) void refreshDevices();
  },
  { immediate: true },
);

watch(
  [running, () => state.value.pitchHistory.at(-1)],
  ([isRunning, frame]) => emit('frame', isRunning, frame),
  { flush: 'sync' },
);
</script>

<template>
  <div class="reference-mic">
    <UiSelect
      id="reference-pitch-mic"
      :label="listOnOpen ? '裝置' : '實唱輸入'"
      :placeholder="placeholder"
      :model-value="state.selectedDeviceId"
      :options="options"
      :disabled="active || state.refreshing || (listOnOpen && !options.length)"
      label-inline
      @update:model-value="selectDevice"
    />
    <div class="reference-mic__actions">
      <UiButton
        v-if="showRefresh"
        variant="secondary"
        :disabled="active || state.refreshing"
        @click="refreshDevices"
      >
        {{
          listOnOpen ? '重新讀取' : state.refreshing ? '讀取中…' : '讀取裝置'
        }}
      </UiButton>
      <UiButton
        :class="{ 'reference-mic__primary': listOnOpen }"
        variant="accent"
        :disabled="!active && (!state.selectedDeviceId || state.refreshing)"
        @click="active ? stop() : start()"
      >
        {{ active ? '停止麥克風' : '啟用麥克風' }}
      </UiButton>
    </div>
    <UiHint v-if="state.error" tone="warning" role="alert">
      {{ state.error }}
    </UiHint>
    <UiHint v-else-if="statusHint" role="status">{{ statusHint }}</UiHint>
    <UiDisclosure v-model:open="tuningOpen" label="收音調整">
      <div class="reference-mic__tuning">
        <UiCheckbox
          id="sing-along-mic-noise"
          label="降噪"
          :model-value="state.inputOptions.noiseSuppression"
          :hint="noiseHint"
          :disabled="active || !state.processingSupport.noiseSuppression"
          @update:model-value="configureInput({ noiseSuppression: $event })"
        />
        <UiSelect
          id="sing-along-mic-low-cut"
          label="低頻過濾"
          :options="lowCutOptions"
          :model-value="state.inputOptions.highPassHz"
          :disabled="active"
          label-inline
          @update:model-value="configureInput({ highPassHz: $event })"
        />
        <UiRange
          id="sing-along-mic-gain"
          label="輸入增益"
          :model-value="state.inputOptions.gainDb"
          :min="-24"
          :max="24"
          :step="1"
          :value-text="`${state.inputOptions.gainDb} dB`"
          value-in-label
          :disabled="state.status === 'requesting'"
          @update:model-value="configureInput({ gainDb: $event })"
        />
        <UiHint v-if="running">
          原始 {{ levelText(state.rawDbfs) }} · 調整後
          {{ levelText(state.dbfs) }}
        </UiHint>
        <UiHint v-if="state.clipped || state.rawClipped" tone="warning">
          音量過大，請降低輸入增益或麥克風音量。
        </UiHint>
        <slot name="tuning" />
      </div>
    </UiDisclosure>
  </div>
</template>

<style scoped>
.reference-mic,
.reference-mic__tuning {
  display: grid;
  gap: var(--ui-space-2);
}

.reference-mic__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.reference-mic__primary {
  flex: 1;
}
</style>
