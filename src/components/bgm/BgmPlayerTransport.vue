<script setup>
import { computed, shallowRef, watch } from 'vue';
import {
  CircleAlert,
  CircleDashed,
  Clock,
  Loader2,
  MicVocal,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
} from '../../icons/index.js';
import { formatDuration } from '../../utils/format.js';
import BgmCurrentSource from './BgmCurrentSource.vue';
import UiChip from '../ui/UiChip.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';

const props = defineProps({
  phase: { type: String, required: true },
  audibleLane: { type: String, default: null },
  restorePending: { type: Boolean, default: false },
  currentTrack: { type: Object, default: null },
  isDimmed: { type: Boolean, default: false },
  isMuted: { type: Boolean, default: false },
  dimDb: { type: Number, default: -12 },
  volume: { type: Number, default: 0.25 },
  currentTime: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
  error: { type: String, default: '' },
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

const PHASE_STATUS = Object.freeze({
  idle: {
    label: '待命',
    accessibleLabel: 'BGM 待命',
    icon: CircleDashed,
    tone: 'muted',
  },
  'bgm-playing': {
    label: '播放',
    accessibleLabel: 'BGM 播放中',
    icon: Volume2,
    tone: 'current',
  },
  'stopping-bgm': {
    label: '淡出',
    accessibleLabel: 'BGM 淡出中',
    icon: Loader2,
    tone: 'warning',
  },
  'track-preroll': {
    label: '留白',
    accessibleLabel: '曲目前留白',
    icon: Clock,
    tone: 'muted',
  },
  'track-active': {
    label: '演唱',
    accessibleLabel: '演唱曲目播放中',
    icon: MicVocal,
    tone: 'accent',
  },
  'track-paused': {
    label: '暫停',
    accessibleLabel: '演唱曲目已暫停',
    icon: Pause,
    tone: 'muted',
  },
  'postroll-silence': {
    label: '留白',
    accessibleLabel: '曲後留白',
    icon: Clock,
    tone: 'muted',
  },
  'manual-hold': {
    label: '暫停',
    accessibleLabel: 'BGM 已暫停',
    icon: Pause,
    tone: 'muted',
  },
  error: {
    label: '失敗',
    accessibleLabel: 'BGM 操作失敗',
    icon: CircleAlert,
    tone: 'danger',
  },
});
const phaseStatus = computed(() => {
  const status = props.error
    ? PHASE_STATUS.error
    : (PHASE_STATUS[props.phase] ?? PHASE_STATUS.idle);
  return {
    ...status,
    accessibleLabel: props.error
      ? `${status.accessibleLabel}：${props.error}`
      : status.accessibleLabel,
  };
});
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
    <div class="bgm-transport__readout">
      <BgmCurrentSource class="bgm-transport__source" :track="currentTrack" />
      <div class="bgm-transport__meter" aria-live="polite">
        <UiChip
          class="bgm-transport__phase"
          :tone="phaseStatus.tone"
          :aria-label="phaseStatus.accessibleLabel"
          :title="phaseStatus.accessibleLabel"
        >
          <component :is="phaseStatus.icon" aria-hidden="true" />
          <span>{{ phaseStatus.label }}</span>
        </UiChip>
        <UiChip
          class="bgm-transport__restore"
          :class="{
            'bgm-transport__restore--hidden': !restorePending,
          }"
          tone="info"
          :aria-hidden="!restorePending"
          aria-label="曲後恢復 BGM"
          title="曲後恢復 BGM"
        >
          <RotateCcw aria-hidden="true" />
          <span>回復</span>
        </UiChip>
      </div>
    </div>

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
      <UiIconButton
        :icon="MicVocal"
        :label="dimActionLabel"
        :active="isDimmed"
        @click="emit('setDimmed', !isDimmed)"
      />
      <UiIconButton
        :icon="isMuted ? VolumeX : Volume2"
        :label="isMuted ? '取消 BGM 靜音' : 'BGM 靜音'"
        :active="isMuted"
        @click="emit('setMuted', !isMuted)"
      />
      <UiIconButton
        class="bgm-transport__cut"
        :icon="Square"
        label="緊急靜音 BGM"
        :disabled="!canCutBgm"
        @click="emit('cut')"
      />
      <UiRangeControl
        class="bgm-transport__volume"
        :model-value="volumeDraft"
        :min="0"
        :max="1"
        :step="0.01"
        :value-text="`${Math.round(volumeDraft * 100)}%`"
        :format-value="(value) => `${Math.round(value * 100)}%`"
        aria-label="BGM 音量"
        @update:model-value="updateVolume"
        @change="emit('commitVolume', volumeDraft)"
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

.bgm-transport__readout,
.bgm-transport__meter,
.bgm-transport__controls,
.bgm-transport__progress {
  align-items: center;
}

.bgm-transport__readout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--ui-space-3);
}

.bgm-transport__source {
  min-width: 0;
}

.bgm-transport__meter {
  display: grid;
  grid-template-columns: var(--ui-bgm-player-phase-status-inline-size) var(
      --ui-bgm-player-restore-status-inline-size
    );
  gap: var(--ui-space-1);
  white-space: nowrap;
}

.bgm-transport__phase,
.bgm-transport__restore {
  inline-size: 100%;
  justify-content: center;
  overflow: hidden;
}

.bgm-transport__restore--hidden {
  visibility: hidden;
  pointer-events: none;
}

.bgm-transport__phase :deep(svg),
.bgm-transport__restore :deep(svg) {
  width: var(--ui-space-4);
  height: var(--ui-space-4);
}

.bgm-transport__meter,
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
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
  line-height: var(--ui-line-height-caption);
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
  grid-template-columns: repeat(4, var(--ui-icon-button-size-md)) minmax(
      0,
      1fr
    );
  gap: var(--ui-space-1);
}

.bgm-transport__volume {
  inline-size: 100%;
  min-inline-size: var(--ui-bgm-player-volume-inline-size);
}

.bgm-transport__cut {
  color: var(--ui-color-danger);
}
</style>
