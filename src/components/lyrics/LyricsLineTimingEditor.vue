<script setup>
import { computed, shallowRef, useId, watch } from 'vue';
import { ChevronLeft, ChevronRight, Clock, Pin } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTextField from '../ui/UiTextField.vue';
import { t } from '../../utils/i18n.js';
const props = defineProps({
  draft: { type: Object, required: true },
  positionMs: { type: Number, default: null },
  disabled: { type: Boolean, default: false },
  canEnableSegments: { type: Boolean, default: false },
  dependencies: { type: Array, default: () => [] },
  error: { type: String, default: '' },
  offsetMs: { type: Number, default: 0 },
  durationMs: { type: Number, default: null },
});
const emit = defineEmits(['set-start', 'set-end', 'shift', 'enable-segments']);
const id = useId(),
  startText = shallowRef(''),
  endText = shallowRef('');
const seconds = (ms) => (Number.isFinite(ms) ? (ms / 1000).toFixed(3) : '');
watch(
  () => props.draft,
  (line) => {
    startText.value = seconds(line.startMs);
    endText.value = seconds(line.endMs);
  },
  { immediate: true },
);
const canRecord = computed(
  () => !props.disabled && Number.isFinite(props.positionMs),
);
const outsideMedia = computed(() =>
  [props.draft.startMs, props.draft.endMs].some(
    (value) =>
      Number.isFinite(value) &&
      (value - props.offsetMs < 0 ||
        (Number.isFinite(props.durationMs) &&
          value - props.offsetMs > props.durationMs)),
  ),
);
function commit(which) {
  if (props.disabled) return;
  const value = which === 'start' ? startText.value : endText.value;
  emit(
    which === 'start' ? 'set-start' : 'set-end',
    String(value).trim() ? Math.round(Number(value) * 1000) : NaN,
  );
}
function record(which) {
  if (canRecord.value)
    emit(
      which === 'start' ? 'set-start' : 'set-end',
      Math.round(props.positionMs),
    );
}
</script>
<template>
  <section
    class="lyrics-line-timing"
    :aria-label="t('lyricsEditor.modes.line')"
  >
    <p class="lyrics-line-timing__text">{{ draft.text }}</p>
    <div class="lyrics-line-timing__fields">
      <UiTextField
        :id="`${id}-start`"
        v-model="startText"
        :label="t('lyricsEditor.lineTiming.start')"
        type="number"
        min="0"
        step="0.001"
        :disabled="disabled"
        @change="commit('start')"
      >
        <template #action
          ><UiIconButton
            :icon="Clock"
            :label="t('lyricsEditor.lineTiming.setStartNow')"
            :disabled="!canRecord"
            @click="record('start')"
        /></template>
      </UiTextField>
      <UiTextField
        :id="`${id}-end`"
        v-model="endText"
        :label="
          draft.endInferred
            ? t('lyricsEditor.lineTiming.endInferred')
            : t('lyricsEditor.lineTiming.end')
        "
        type="number"
        min="0"
        step="0.001"
        :placeholder="t('lyricsEditor.lineTiming.unset')"
        :disabled="disabled"
        @change="commit('end')"
      >
        <template #action>
          <UiIconButton
            v-if="draft.endInferred"
            :icon="Pin"
            :label="t('lyricsEditor.lineTiming.pinEnd')"
            :disabled="disabled"
            @click="emit('set-end', draft.endMs)"
          />
          <UiIconButton
            :icon="Clock"
            :label="t('lyricsEditor.lineTiming.setEndNow')"
            :disabled="!canRecord"
            @click="record('end')"
          />
        </template>
      </UiTextField>
    </div>
    <div class="lyrics-line-timing__actions">
      <UiButton
        :icon="ChevronLeft"
        :aria-label="t('lyricsEditor.lineTiming.shiftEarlier')"
        :title="t('lyricsEditor.lineTiming.shiftEarlier')"
        :disabled="disabled"
        @click="emit('shift', -100)"
        >{{ t('lyricsEditor.lineTiming.step') }}</UiButton
      >
      <UiButton
        :icon="ChevronRight"
        :aria-label="t('lyricsEditor.lineTiming.shiftLater')"
        :title="t('lyricsEditor.lineTiming.shiftLater')"
        :disabled="disabled"
        @click="emit('shift', 100)"
        >{{ t('lyricsEditor.lineTiming.step') }}</UiButton
      >
      <UiButton
        v-if="!draft.segments?.length"
        :disabled="disabled || !canEnableSegments"
        :title="
          canEnableSegments ? '' : t('lyricsEditor.lineTiming.wordUnavailable')
        "
        @click="emit('enable-segments')"
        >{{ t('lyricsEditor.modes.word') }}</UiButton
      >
    </div>
    <UiHint v-for="line in dependencies" :key="line.lineId">{{
      t('lyricsEditor.lineTiming.dependency', {
        text: line.text,
        seconds: seconds(line.endMs),
      })
    }}</UiHint>
    <UiHint v-if="outsideMedia">{{
      t('lyricsEditor.lineTiming.outsideMedia')
    }}</UiHint>
    <UiHint v-if="error" role="status">{{ error }}</UiHint>
  </section>
</template>
<style scoped>
.lyrics-line-timing {
  display: grid;
  min-width: 0;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-4);
}
.lyrics-line-timing__text {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--ui-color-text);
}
.lyrics-line-timing__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 15rem));
  gap: var(--ui-space-2);
}
.lyrics-line-timing__actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
@container (max-width: 27rem) {
  .lyrics-line-timing__fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
