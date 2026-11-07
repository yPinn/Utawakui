<script setup>
import { computed, shallowRef, watch } from 'vue';
import { MicVocal, Square, Volume1 } from '../../icons/index.js';
import { projectBgmPrimaryAction } from './bgmPresentation.js';
import { formatDuration } from '../../utils/format.js';
import audioControlValues from '../../../shared/audioControlValues.json';
import UiIconButton from '../ui/UiIconButton.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';
import UiVolumeControl from '../ui/UiVolumeControl.vue';
import { t } from '../../utils/i18n.js';

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
    ? t('player.bgm.restore')
    : t('player.bgm.dim', { db: dimReductionDb.value }),
);
const guideActionLabel = computed(() =>
  !props.currentTrack
    ? t('player.bgm.chooseFirst')
    : !props.hasGuideVocal
      ? t('player.bgm.guideUnavailable')
      : props.guideVocalOn
        ? t('player.bgm.guideOff')
        : t('player.bgm.guideOn'),
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
    :aria-label="t('player.bgm.controls')"
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
        :aria-label="t('player.bgm.progress')"
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
        :label="t('player.bgm.stopNow')"
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

      <UiVolumeControl
        class="bgm-transport__audio"
        :model-value="volumeDraft"
        :muted="isMuted"
        :active="isMuted"
        :min="audioControlValues.bgmVolume.min"
        :max="audioControlValues.bgmVolume.max"
        :step="audioControlValues.bgmVolume.step"
        :volume-label="t('player.bgm.volume')"
        :mute-label="t('player.bgm.mute')"
        :unmute-label="t('player.bgm.unmute')"
        @update:muted="emit('setMuted', $event)"
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
  --ui-volume-control-range-size: auto;
  min-inline-size: calc(
    var(--ui-icon-button-size-md) + var(--ui-space-1) + var(--ui-space-7)
  );
}
.bgm-transport--dock .bgm-transport__controls {
  grid-template-columns: auto auto minmax(0, 1fr);
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
