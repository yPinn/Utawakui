<script setup>
import { computed, shallowRef, watch } from 'vue';
import {
  MicVocal,
  Square,
  Volume1,
  Volume2,
  VolumeX,
} from '../../icons/index.js';
import { projectBgmPrimaryAction } from './bgmPresentation.js';
import { formatDuration } from '../../utils/format.js';
import audioControlValues from '../../../shared/audioControlValues.json';
import UiIconButton from '../ui/UiIconButton.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';

const props = defineProps({
  compact: { type: Boolean, default: false },
  variant: {
    type: String,
    default: 'full',
    validator: (value) => ['full', 'session', 'dock'].includes(value),
  },
  phase: { type: String, required: true },
  audibleLane: { type: String, default: null },
  currentTrack: { type: Object, default: null },
  isDimmed: { type: Boolean, default: false },
  isMuted: { type: Boolean, default: false },
  hasGuideVocal: { type: Boolean, default: false },
  guideVocalOn: { type: Boolean, default: false },
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
  'setGuideVocalOn',
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
    ? '壓低 BGM（按下恢復 BGM 音量）'
    : `壓低 BGM（降低 ${dimReductionDb.value} dB）`,
);
const guideActionLabel = computed(() =>
  !props.currentTrack
    ? '請先選擇 BGM'
    : !props.hasGuideVocal
      ? 'BGM 原曲播放，需先準備伴奏才能切換導唱'
      : props.guideVocalOn
        ? '關閉 BGM 導唱'
        : '開啟 BGM 導唱',
);
const primaryAction = computed(() =>
  projectBgmPrimaryAction({
    phase: props.phase,
    hasTrack: Boolean(props.currentTrack),
  }),
);

function activatePrimaryAction() {
  if (!primaryAction.value.disabled) emit(primaryAction.value.intent);
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
  <section
    class="bgm-transport"
    :class="`bgm-transport--${variant}`"
    aria-label="BGM 播放控制"
  >
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
      <span class="bgm-transport__time bgm-transport__time--end">{{
        formatDuration(duration, '0:00')
      }}</span>
    </div>
    <div v-show="!compact" class="bgm-transport__context">
      <slot name="context" />
      <UiIconButton
        class="bgm-transport__cut"
        :icon="Square"
        label="立即停止 BGM（不淡出）"
        intent="danger"
        :disabled="!canCutBgm"
        @click="emit('cut')"
      />
    </div>
    <div v-show="!compact" class="bgm-transport__controls">
      <UiIconButton
        v-if="variant !== 'dock'"
        :icon="primaryAction.icon"
        :label="primaryAction.label"
        variant="accent"
        shape="circle"
        :disabled="primaryAction.disabled"
        @click="activatePrimaryAction"
      />
      <UiIconButton
        class="bgm-transport__guide"
        :icon="MicVocal"
        :label="guideActionLabel"
        :active="guideVocalOn && hasGuideVocal"
        :aria-pressed="guideVocalOn && hasGuideVocal"
        :disabled="!hasGuideVocal"
        @click="emit('setGuideVocalOn', !guideVocalOn)"
      />
      <UiIconButton
        class="bgm-transport__talk"
        :icon="Volume1"
        :label="dimActionLabel"
        :active="isDimmed"
        :aria-label="dimActionLabel"
        :aria-pressed="isDimmed"
        @click="emit('setDimmed', !isDimmed)"
      />

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
    </div>
  </section>
</template>

<style scoped>
.bgm-transport {
  display: grid;
  min-width: 0;
  gap: var(--ui-space-2);
}

.bgm-transport__progress {
  display: grid;
  align-items: center;
  grid-template-columns: 5ch minmax(0, 1fr) 5ch;
  gap: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-variant-numeric: tabular-nums;
  line-height: var(--ui-type-caption-line-height);
}

.bgm-transport__time {
  inline-size: 5ch;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-align: end;
  white-space: nowrap;
}

.bgm-transport__progress-range {
  --ui-range-target-size: var(--ui-space-4);
  min-inline-size: 0;
}

.bgm-transport__controls {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-1);
}

.bgm-transport__audio {
  display: grid;
  min-width: 0;
  grid-template-columns: var(--ui-icon-button-size-md) minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-1);
  min-inline-size: calc(
    var(--ui-icon-button-size-md) + var(--ui-space-1) + var(--ui-space-7)
  );
}
.bgm-transport--dock .bgm-transport__controls {
  grid-template-columns: auto auto minmax(0, 1fr);
}

.bgm-transport__volume {
  inline-size: 100%;
  min-inline-size: var(--ui-space-7);
}
.bgm-transport__time--end {
  text-align: left;
}
.bgm-transport__context {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--ui-space-1);
  min-inline-size: 0;
}
.bgm-transport__cut {
  grid-column: -2 / -1;
  justify-self: end;
}
</style>
