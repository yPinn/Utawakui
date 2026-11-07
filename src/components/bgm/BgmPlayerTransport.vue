<script setup>
import { computed, shallowRef, useTemplateRef, watch } from 'vue';
import { MicSignal, MicVocal, Square, Volume1 } from '../../icons/index.js';
import { projectBgmPrimaryAction } from './bgmPresentation.js';
import { formatDuration } from '../../utils/format.js';
import audioControlValues from '../../../shared/audioControlValues.json';
import UiIconButton from '../ui/UiIconButton.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';
import UiVolumeControl from '../ui/UiVolumeControl.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  compact: { type: Boolean, default: false },
  standby: { type: Boolean, default: false },
  statusVisible: { type: Boolean, default: undefined },
  inlineStatus: { type: Boolean, default: false },
  folded: { type: Boolean, default: false },
  animateFold: { type: Boolean, default: false },
  liftTools: { type: Boolean, default: false },
  toolsHost: { type: Object, default: null },
  cutHost: { type: Object, default: null },
  combinedTools: { type: Boolean, default: false },
  footerId: { type: String, default: undefined },
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
  seekDisabled: { type: Boolean, default: false },
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
  'expandAudio',
]);

const volumeDraft = shallowRef(props.volume);
const audioControls = useTemplateRef('audioControls');
watch(
  () => props.folded,
  (folded) => {
    const focused = globalThis.document?.activeElement;
    if (folded && !props.liftTools && audioControls.value?.contains(focused)) {
      emit('expandAudio');
    }
  },
);
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
        :disabled="seekDisabled || !currentTrack || duration <= 0"
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
    <div
      v-show="!compact"
      class="bgm-transport__context"
      :class="{
        'bgm-transport__context--combined': combinedTools,
        'bgm-transport__context--standby': standby,
        'bgm-transport__context--selected': combinedTools && currentTrack,
      }"
    >
      <div
        v-if="!inlineStatus && (statusVisible ?? !standby)"
        class="bgm-transport__status"
      >
        <slot name="status" />
      </div>
      <Teleport
        v-if="!liftTools || toolsHost"
        :to="toolsHost"
        :disabled="!liftTools"
      >
        <div
          :id="footerId"
          class="bgm-transport__fold"
          :class="{
            'bgm-transport__fold--animated': animateFold,
            'bgm-transport__fold--closed': folded && !liftTools,
            'bgm-transport__fold--lifted': liftTools,
          }"
          :inert="folded"
        >
          <div class="bgm-transport__fold-clip">
            <div ref="audioControls" class="bgm-transport__controls">
              <UiIconButton
                v-if="variant !== 'dock'"
                :icon="primaryAction.icon"
                :label="primaryAction.label"
                variant="accent"
                shape="circle"
                :disabled="primaryAction.disabled"
                @click="activatePrimaryAction"
              />
              <div class="bgm-transport__volume-cell">
                <UiVolumeControl
                  class="bgm-transport__audio"
                  :variant="variant === 'dock' ? 'reveal' : 'expanded'"
                  :inline="variant === 'dock'"
                  reveal-side="end"
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
                <div
                  v-if="inlineStatus && statusVisible"
                  class="bgm-transport__inline-status"
                >
                  <slot name="status" />
                </div>
              </div>
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
                :icon="variant === 'dock' ? MicSignal : Volume1"
                :label="dimActionLabel"
                :active="isDimmed"
                :aria-label="dimActionLabel"
                :aria-pressed="isDimmed"
                @click="emit('setDimmed', !isDimmed)"
              />
            </div>
          </div>
        </div>
      </Teleport>
      <div class="bgm-transport__picker"><slot name="context" /></div>
      <Teleport :to="cutHost" :disabled="!cutHost">
        <UiIconButton
          v-show="canCutBgm || (variant !== 'dock' && !standby && !folded)"
          class="bgm-transport__cut"
          :icon="Square"
          :label="t('player.bgm.stopNow')"
          intent="danger"
          :disabled="!canCutBgm"
          @click="emit('cut')"
        />
      </Teleport>
    </div>
  </section>
</template>

<style scoped>
.bgm-transport {
  display: grid;
  min-width: 0;
}
.bgm-transport__fold {
  grid-column: 1 / -1;
  grid-row: 2;
  display: grid;
  grid-template-rows: 1fr;
}
.bgm-transport__fold--animated {
  transition: grid-template-rows var(--ui-motion-duration-standard)
    var(--ui-motion-easing-reversible);
}
.bgm-transport__fold--closed {
  grid-template-rows: 0fr;
}
.bgm-transport__fold-clip {
  min-block-size: 0;
  overflow: clip;
  overflow-clip-margin: var(--ui-focus-safe-inset);
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
  --bgm-volume-group-inline-size: calc(
    var(--ui-icon-button-size-md) + var(--ui-space-1) +
      var(--ui-bgm-player-volume-inline-size)
  );
  display: grid;
  grid-template-columns:
    auto minmax(0, var(--bgm-volume-group-inline-size)) auto
    auto;
  justify-content: start;
  align-items: center;
  gap: var(--ui-space-2);
  padding-block-start: var(--ui-space-1);
}

.bgm-transport__volume-cell {
  position: relative;
  min-inline-size: 0;
  display: flex;
}

.bgm-transport__audio {
  --ui-volume-control-range-size: var(--ui-bgm-player-volume-inline-size);
}

.bgm-transport__inline-status {
  position: absolute;
  inset-block: 0;
  inset-inline: calc(
      var(--ui-icon-button-size-md) + var(--ui-player-action-gap)
    )
    0;
  display: flex;
  align-items: center;
  min-inline-size: 0;
  pointer-events: none;
  opacity: 0;
}

@media (hover: hover) and (pointer: fine) {
  .bgm-transport__inline-status {
    opacity: 1;
    transition: opacity 0s var(--ui-motion-duration-feedback);
  }

  .bgm-transport__volume-cell:has(
      .bgm-transport__audio:hover,
      .bgm-transport__audio :focus-visible,
      .bgm-transport__audio[data-dragging]
    )
    .bgm-transport__inline-status {
    opacity: 0;
    transition-delay: 0s;
  }
}
:is(.bgm-transport--dock, .bgm-transport__fold--lifted)
  .bgm-transport__controls {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

:is(.bgm-transport--dock, .bgm-transport__fold--lifted) .bgm-transport__audio {
  --ui-volume-control-gap: var(--ui-player-action-gap);
  --ui-range-target-size: var(--ui-space-4);
  inline-size: min(
    100%,
    calc(
      var(--ui-icon-button-size-md) + var(--ui-volume-control-gap) +
        var(--ui-player-volume-inline-size)
    )
  );
}

.bgm-transport__fold--lifted .bgm-transport__controls {
  padding-block-start: 0;
}

.bgm-transport__time--end {
  text-align: left;
}
.bgm-transport__context {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  column-gap: var(--ui-space-1);
  min-inline-size: 0;
}
.bgm-transport__context--selected {
  grid-template-columns: minmax(0, 1fr) auto;
}
.bgm-transport__context--standby {
  grid-template-columns: minmax(0, 1fr);
}
.bgm-transport__status {
  grid-column: 1;
  grid-row: 1;
  min-inline-size: 0;
}
.bgm-transport__context
  > :is(.bgm-transport__status, .bgm-transport__picker, .bgm-transport__cut) {
  margin-block-start: var(--ui-space-2);
}
.bgm-transport__picker {
  grid-column: 2;
  grid-row: 1;
}
.bgm-transport__context--combined .bgm-transport__status {
  grid-column: 1 / -1;
}
.bgm-transport__context--combined
  > :is(.bgm-transport__picker, .bgm-transport__cut) {
  grid-row: 2;
  margin-block-start: var(--ui-space-1);
}
.bgm-transport__context--combined .bgm-transport__fold {
  grid-column: 1;
}
.bgm-transport__context--standby .bgm-transport__controls {
  padding-block-start: var(--ui-space-2);
}
.bgm-transport__context--selected .bgm-transport__picker {
  display: none;
}
.bgm-transport__cut {
  grid-column: -2 / -1;
  grid-row: 1;
  justify-self: end;
}
</style>
