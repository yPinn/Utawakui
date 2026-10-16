<script setup>
import { computed, shallowRef, watch } from 'vue';
import {
  MicVocal,
  Pause,
  Play,
  Square,
  Volume2,
  VolumeX,
} from '../../icons/index.js';
import { formatDuration } from '../../utils/format.js';
import audioControlValues from '../../../shared/audioControlValues.json';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';

const props = defineProps({
  phase: { type: String, required: true },
  audibleLane: { type: String, default: null },
  currentTrack: { type: Object, default: null },
  isDimmed: { type: Boolean, default: false },
  isMuted: { type: Boolean, default: false },
  dimDb: { type: Number, default: audioControlValues.bgmDimDb.defaultValue },
  volume: { type: Number, default: audioControlValues.bgmVolume.defaultValue },
  currentTime: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
});

const emit = defineEmits([
  'play',
  'pause',
  'cut',
  'setDimmed',
  'setMuted',
  'previewVolume',
  'commitVolume',
  'seek',
  'commitPosition',
]);

const volumeDraft = shallowRef(props.volume);
watch(
  () => props.volume,
  (volume) => {
    volumeDraft.value = volume;
  },
);

const isBgmPlaying = computed(() => props.phase === 'bgm-playing');
const transportLocked = computed(() =>
  [
    'stopping-bgm',
    'track-preroll',
    'track-active',
    'postroll-silence',
  ].includes(props.phase),
);
const canCutBgm = computed(
  () =>
    props.audibleLane === 'bgm' ||
    ['bgm-playing', 'stopping-bgm'].includes(props.phase),
);
const dimReductionDb = computed(() =>
  Math.round(Math.abs(Number.isFinite(props.dimDb) ? props.dimDb : -12)),
);
const dimActionLabel = computed(() =>
  props.isDimmed
    ? '關閉 Talk（恢復原音量）'
    : `開啟 Talk（BGM 降低 ${dimReductionDb.value} dB）`,
);
const primaryAction = computed(() => ({
  icon: isBgmPlaying.value ? Pause : Play,
  label: isBgmPlaying.value ? '暫停 BGM' : '播放 BGM',
  disabled:
    !isBgmPlaying.value && (!props.currentTrack || transportLocked.value),
}));

function activatePrimaryAction() {
  emit(isBgmPlaying.value ? 'pause' : 'play');
}

function updateVolume(value) {
  volumeDraft.value = value;
  emit('previewVolume', value);
}

function updatePosition(value) {
  emit('seek', Number(value));
}
</script>

<template>
  <section class="bgm-transport" aria-label="BGM 播放控制">
    <div class="bgm-transport__progress">
      <span class="bgm-transport__time">{{
        formatDuration(currentTime, '0:00')
      }}</span>
      <UiRangeControl
        class="bgm-transport__progress-range"
        :model-value="currentTime"
        :min="0"
        :max="duration"
        :step="0.1"
        :disabled="!currentTrack || duration <= 0"
        :value-text="formatDuration(currentTime, '0:00')"
        :format-value="(value) => formatDuration(value, '0:00')"
        aria-label="BGM 進度"
        @update:model-value="updatePosition"
        @change="emit('commitPosition')"
      />
    </div>

    <div class="bgm-transport__controls">
      <UiIconButton
        :icon="primaryAction.icon"
        :label="primaryAction.label"
        variant="accent"
        shape="circle"
        :disabled="primaryAction.disabled"
        @click="activatePrimaryAction"
      />
      <UiButton
        class="bgm-transport__talk"
        :icon="MicVocal"
        :title="dimActionLabel"
        :active="isDimmed"
        :aria-label="dimActionLabel"
        :aria-pressed="isDimmed"
        @click="emit('setDimmed', !isDimmed)"
      >
        Talk
      </UiButton>
      <div class="bgm-transport__audio" role="group" aria-label="BGM 音量">
        <UiIconButton
          :icon="isMuted ? VolumeX : Volume2"
          :label="isMuted ? '取消 BGM 靜音' : 'BGM 靜音'"
          :active="isMuted"
          :aria-pressed="isMuted"
          @click="emit('setMuted', !isMuted)"
        />
        <UiRangeControl
          class="bgm-transport__volume"
          :model-value="volumeDraft"
          :min="audioControlValues.bgmVolume.min"
          :max="audioControlValues.bgmVolume.max"
          :step="audioControlValues.bgmVolume.step"
          :value-text="`${Math.round(volumeDraft * 100)}%`"
          :format-value="(value) => `${Math.round(value * 100)}%`"
          aria-label="BGM 音量"
          @update:model-value="updateVolume"
          @change="emit('commitVolume', volumeDraft)"
        />
      </div>
      <UiIconButton
        class="bgm-transport__cut"
        :icon="Square"
        label="立即停止 BGM（不淡出）"
        intent="danger"
        :disabled="!canCutBgm"
        @click="emit('cut')"
      />
    </div>
  </section>
</template>

<style scoped>
.bgm-transport {
  display: grid;
  min-width: 0;
  gap: var(--ui-space-2);
}

.bgm-transport__controls,
.bgm-transport__progress {
  align-items: center;
}

.bgm-transport__progress,
.bgm-transport__controls {
  -webkit-user-select: none;
  user-select: none;
}

.bgm-transport__progress {
  display: grid;
  grid-template-columns: var(--ui-bgm-player-time-inline-size) minmax(0, 1fr);
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-variant-numeric: tabular-nums;
  line-height: var(--ui-type-caption-line-height);
}

.bgm-transport__time {
  inline-size: var(--ui-bgm-player-time-inline-size);
  overflow: hidden;
  text-align: end;
  white-space: nowrap;
}

.bgm-transport__progress-range {
  min-width: 0;
}

.bgm-transport__controls {
  display: grid;
  grid-template-columns: var(--ui-icon-button-size-md) auto minmax(0, 1fr) var(
      --ui-icon-button-size-md
    );
  gap: var(--ui-space-1);
}

.bgm-transport__talk {
  align-self: center;
}

.bgm-transport__audio {
  display: grid;
  min-width: 0;
  grid-template-columns: var(--ui-icon-button-size-md) minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-1);
}

.bgm-transport__volume {
  inline-size: 100%;
  min-inline-size: var(--ui-bgm-player-volume-inline-size);
}
</style>
