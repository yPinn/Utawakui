<script setup>
import { computed, watch } from 'vue';
import { useMicrophoneResearch } from '../../composables/useMicrophoneResearch.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiSelect from '../ui/UiSelect.vue';

const emit = defineEmits(['frame']);
const props = defineProps({
  access: { type: Object, default: undefined },
  stopWhenHidden: { type: Boolean, default: false },
  listOnOpen: { type: Boolean, default: false },
  playing: { type: Boolean, default: undefined },
  preferSystemDefault: { type: Boolean, default: false },
});
const { state, refreshDevices, selectDevice, start, stop } =
  useMicrophoneResearch({
    access: props.access,
    stopWhenHidden: props.stopWhenHidden,
    preferSystemDefault: props.preferSystemDefault,
  });
const running = computed(() => state.value.status === 'running');
const active = computed(
  () => running.value || state.value.status === 'requesting',
);
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
      :label="listOnOpen ? '麥克風' : '實唱輸入'"
      :placeholder="placeholder"
      :model-value="state.selectedDeviceId"
      :options="options"
      :disabled="active || state.refreshing || (listOnOpen && !options.length)"
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
  </div>
</template>

<style scoped>
.reference-mic {
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
