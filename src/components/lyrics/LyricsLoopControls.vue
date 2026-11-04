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
import { t } from '../../utils/i18n.js';

const props = defineProps({ practice: { type: Object, required: true } });
const emit = defineEmits(['action']);
const detailsOpen = ref(false);
const pointLabel = (point) =>
  t(point === 'a' ? 'lyricsEditor.loop.pointA' : 'lyricsEditor.loop.pointB');
const time = (value) =>
  Number.isFinite(value)
    ? formatDuration(value).padStart(5, '0')
    : t('lyricsEditor.loop.unset');
const gaps = [0, 1, 2, 4].map((value) => ({
  value,
  label:
    value === 0
      ? t('lyricsEditor.loop.noWait')
      : t('lyricsEditor.loop.seconds', { value }),
}));
const errors = {
  'source-or-range': t('lyricsEditor.loop.errors.sourceOrRange'),
  seek: t('lyricsEditor.loop.errors.seek'),
  play: t('lyricsEditor.loop.errors.play'),
  interrupted: t('lyricsEditor.loop.errors.interrupted'),
  media: t('lyricsEditor.loop.errors.media'),
  busy: t('lyricsEditor.loop.errors.busy'),
};
const status = computed(() => {
  const p = props.practice;
  if (p.unavailableReason) return p.unavailableReason;
  if (p.error) return errors[p.error] ?? t('lyricsEditor.loop.pausedError');
  if (p.loading) return t('lyricsEditor.loop.loading');
  if (p.phase === 'source-changing')
    return t('lyricsEditor.loop.sourceChanging');
  if (p.phase === 'returning') return t('lyricsEditor.loop.returning');
  if (p.phase === 'gap')
    return t('lyricsEditor.loop.waiting', { seconds: p.waitingSeconds });
  const rest = p.gapSeconds
    ? t('lyricsEditor.loop.rest', { seconds: p.gapSeconds })
    : t('lyricsEditor.loop.noRest');
  if (p.running) return t('lyricsEditor.loop.running', { rest });
  if (p.enabled) return t('lyricsEditor.loop.enabled', { rest });
  if (p.a === null || p.b === null)
    return t('lyricsEditor.loop.markPoints', { rest });
  return p.canEnable ? rest : t('lyricsEditor.loop.tooShort');
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
        :title="t('lyricsEditor.loop.setNamed', { point: pointLabel(point) })"
        :aria-label="
          t('lyricsEditor.loop.setWithTime', {
            point: pointLabel(point),
            time: time(practice[point]),
          })
        "
        @click="emit('action', { kind: 'capture', point })"
        ><span class="player-practice__mark"
          ><span>{{
            t(
              point === 'a'
                ? 'lyricsEditor.loop.markA'
                : 'lyricsEditor.loop.markB',
            )
          }}</span
          ><small>{{ time(practice[point]) }}</small></span
        ></UiButton
      >
      <UiIconButton
        :icon="RotateCcw"
        :label="t('lyricsEditor.loop.clear')"
        :title="t('lyricsEditor.loop.clearHint')"
        :disabled="
          Boolean(practice.unavailableReason) ||
          (practice.a === null && practice.b === null)
        "
        @click="emit('action', { kind: 'clear' })"
      />
      <UiIconButton
        :icon="practice.running ? Pause : Play"
        :active="practice.running"
        :label="
          t(
            practice.running
              ? 'lyricsEditor.loop.pause'
              : 'lyricsEditor.loop.start',
          )
        "
        :disabled="
          Boolean(practice.unavailableReason) ||
          (!practice.running && !practice.canEnable)
        "
        :loading="practice.loading"
        :loading-label="t('lyricsEditor.loop.confirming')"
        @click="emit('action', { kind: 'toggle' })"
      />
      <UiIconButton
        :icon="SlidersHorizontal"
        :label="t('lyricsEditor.loop.advanced')"
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
          :label="
            t('lyricsEditor.loop.pointSeconds', { point: pointLabel(point) })
          "
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
        :label="t('lyricsEditor.loop.restLabel')"
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
