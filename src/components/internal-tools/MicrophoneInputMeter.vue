<script setup>
import { computed } from 'vue';
import { ICON_SIZE, MicVocal } from '../../icons/index.js';
import { PITCH_MIN_DBFS } from '../../microphone/inputProcessing.js';
import { MICROPHONE_CLIP_PEAK } from '../../microphone/level.js';
import {
  formatMicrophoneDbfs,
  MICROPHONE_METER_MIN_DBFS,
  microphoneMeterPercent,
  microphonePitchTone,
  peakDbfs,
} from '../../microphone/pitchInputStatus.js';
import { t } from '../../utils/i18n.js';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';
import UiTooltip from '../ui/UiTooltip.vue';

const props = defineProps({
  deviceName: { type: String, required: true },
  status: { type: String, required: true },
  dbfs: { type: Number, default: null },
  peak: { type: Number, default: 0 },
  rawPeak: { type: Number, default: 0 },
});
const peakLevel = computed(() =>
  peakDbfs(props.status === 'rawClipping' ? props.rawPeak : props.peak),
);
const statusLabel = computed(() => t(`performerInput.status.${props.status}`));
const tone = computed(() => microphonePitchTone(props.status));
const meterValue = computed(() =>
  Math.min(
    0,
    Math.max(
      MICROPHONE_METER_MIN_DBFS,
      Math.round(props.dbfs ?? MICROPHONE_METER_MIN_DBFS),
    ),
  ),
);
const accessibleReading = computed(() =>
  tone.value === 'danger' && props.dbfs !== null
    ? t('performerInput.accessibleClippingReading', {
        level: formatMicrophoneDbfs(props.dbfs),
        status: statusLabel.value,
        peak: formatMicrophoneDbfs(peakLevel.value),
      })
    : t('performerInput.accessibleReading', {
        level:
          props.dbfs === null ? '— dBFS' : formatMicrophoneDbfs(props.dbfs),
        status: statusLabel.value,
      }),
);
const level = computed(() => microphoneMeterPercent(props.dbfs));
const peakPosition = computed(() => microphoneMeterPercent(peakLevel.value));
const threshold = microphoneMeterPercent(PITCH_MIN_DBFS);
const clipDbfs = Math.round(peakDbfs(MICROPHONE_CLIP_PEAK));
const clipPosition = microphoneMeterPercent(clipDbfs);
const zones = {
  '--input-meter-warning-start': `${microphoneMeterPercent(-20)}%`,
  '--input-meter-danger-start': `${microphoneMeterPercent(-9)}%`,
};
const ticks = Array.from(
  { length: 11 },
  (_, i) => MICROPHONE_METER_MIN_DBFS + i * 6,
);
const limits = t('performerInput.meterLimits', {
  pitch: PITCH_MIN_DBFS,
  clip: clipDbfs,
});
</script>

<template>
  <div
    class="input-meter"
    :data-tone="tone"
    :data-active="dbfs !== null"
    :data-input-status="status"
    :style="zones"
  >
    <MicVocal class="input-meter__icon" :size="ICON_SIZE" aria-hidden="true" />
    <UiOverflowTooltip class="input-meter__device-name" :text="deviceName" />
    <UiTooltip :text="limits" :described-by="false">
      <template #trigger="{ triggerProps }">
        <div
          v-bind="triggerProps"
          class="input-meter__track"
          role="meter"
          :aria-label="t('performerInput.meter')"
          :aria-description="limits"
          :aria-valuemin="MICROPHONE_METER_MIN_DBFS"
          :aria-valuemax="0"
          :aria-valuenow="meterValue"
          :aria-valuetext="accessibleReading"
        >
          <span
            class="input-meter__fill"
            :style="{ clipPath: `inset(0 ${100 - level}% 0 0)` }"
          />
          <span
            class="input-meter__threshold"
            :style="{ insetInlineStart: `${threshold}%` }"
          />
          <span
            class="input-meter__limit"
            :style="{
              insetInlineStart: `min(${clipPosition}%, calc(100% - var(--ui-border-width)))`,
            }"
          />
          <span
            v-if="peakPosition > 0"
            class="input-meter__peak"
            :style="{
              insetInlineStart: `min(${peakPosition}%, calc(100% - var(--ui-border-width)))`,
            }"
          />
        </div>
      </template>
    </UiTooltip>
    <div class="input-meter__scale" aria-hidden="true">
      <span
        v-for="tick in ticks"
        :key="tick"
        :style="{ insetInlineStart: `${microphoneMeterPercent(tick)}%` }"
        class="input-meter__tick"
        >{{ tick }}</span
      >
    </div>
  </div>
</template>

<style scoped>
.input-meter {
  --input-meter-zones: linear-gradient(
    to right,
    var(--ui-color-success) var(--input-meter-warning-start),
    var(--ui-color-warning) var(--input-meter-warning-start)
      var(--input-meter-danger-start),
    var(--ui-color-danger) var(--input-meter-danger-start)
  );
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  column-gap: var(--ui-space-2);
  padding-inline: var(--ui-space-3);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}
.input-meter__icon {
  grid-column: 1;
  align-self: center;
  margin-block-end: var(--ui-space-1);
}
.input-meter__device-name,
.input-meter__track,
.input-meter__scale {
  grid-column: 2;
}
.input-meter__device-name {
  display: block;
  min-inline-size: 0;
  padding-block-end: var(--ui-space-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.input-meter__track {
  position: relative;
  block-size: var(--ui-space-2);
  border-radius: var(--ui-radius-xs);
  background: var(--ui-color-surface-active);
  overflow: hidden;
}
.input-meter__track::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--input-meter-zones);
  opacity: 0.4;
}
.input-meter__fill,
.input-meter__threshold,
.input-meter__limit,
.input-meter__peak {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
}
.input-meter__fill {
  inset-inline-end: 0;
  background: var(--input-meter-zones);
}
.input-meter[data-active='true'] .input-meter__fill {
  transition: clip-path var(--ui-motion-duration-feedback) linear;
}
.input-meter__threshold,
.input-meter__limit,
.input-meter__peak {
  inline-size: var(--ui-border-width);
  background: var(--ui-color-text);
}
.input-meter__threshold {
  inset-block: 0 auto;
  block-size: 55%;
}
.input-meter__limit {
  z-index: 1;
  inset-block: auto 0;
  block-size: 55%;
  background: var(--ui-color-danger);
}
.input-meter[data-tone='danger'] .input-meter__limit {
  block-size: 100%;
  background: var(--ui-color-text);
}
.input-meter__scale {
  position: relative;
  block-size: calc(
    var(--ui-space-1) + var(--ui-type-caption-line-height) * 1em
  );
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
}
.input-meter__tick {
  position: absolute;
  padding-block-start: var(--ui-space-1);
  transform: translateX(-50%);
}
.input-meter__tick::before {
  content: '';
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 50%;
  inline-size: var(--ui-border-width);
  block-size: var(--ui-space-1);
  background: currentColor;
  transform: translateX(-50%);
}
@media (forced-colors: active) {
  .input-meter__track {
    outline: var(--ui-border-width) solid CanvasText;
  }
  .input-meter__track::before {
    display: none;
  }
  .input-meter__fill {
    forced-color-adjust: none;
    background: Highlight;
  }
  .input-meter__threshold,
  .input-meter__limit,
  .input-meter__peak,
  .input-meter__tick::before {
    forced-color-adjust: none;
    background: CanvasText;
  }
}
</style>
