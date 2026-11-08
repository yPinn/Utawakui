<script setup>
import { computed, nextTick, useId, useTemplateRef, watch } from 'vue';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiSurface from '../ui/UiSurface.vue';

const props = defineProps({
  active: Boolean,
  lineId: { type: String, default: '' },
  lines: { type: Array, required: true },
  timed: { type: Number, required: true },
  canRecord: Boolean,
  busy: Boolean,
  error: { type: String, default: '' },
});
const emit = defineEmits(['start', 'select-line', 'record', 'skip', 'close']);
const id = useId();
const shortcut = useTemplateRef('shortcut');
const line = computed(() =>
  props.lines.find((item) => item.lineId === props.lineId),
);
const options = computed(() =>
  props.lines.map((item, index) => ({
    value: item.lineId,
    label: `${index + 1}. ${item.text.replace(/\s+/gu, ' ').slice(0, 95)}`,
  })),
);
watch(
  () => props.active,
  async (active) => {
    if (active) {
      await nextTick();
      shortcut.value?.focus();
    }
  },
);

function handleKey(event) {
  if (
    event.key.toLowerCase() !== 't' ||
    event.isComposing ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.target?.closest('input, select, textarea, [contenteditable]')
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat && props.active && props.canRecord && !props.busy)
    emit('record');
}
</script>

<template>
  <UiSurface class="lyrics-tap" @keydown="handleKey">
    <UiHint role="status">
      {{ t('lyricsEditor.tap.coverage', { timed, total: lines.length }) }}
    </UiHint>
    <template v-if="active">
      <UiSelect
        :id="id"
        :label="t('lyricsEditor.correction.line')"
        :model-value="lineId"
        :options="options"
        :disabled="busy"
        @update:model-value="emit('select-line', $event)"
      />
      <div
        ref="shortcut"
        tabindex="0"
        class="lyrics-tap__cue"
        aria-live="polite"
      >
        <strong>{{ line?.text }}</strong>
        <UiHint>{{
          t(
            canRecord
              ? 'lyricsEditor.tap.shortcut'
              : 'lyricsEditor.tap.loadTrack',
          )
        }}</UiHint>
      </div>
    </template>
    <UiHint v-else>{{ t('lyricsEditor.tap.hint') }}</UiHint>
    <UiNotice v-if="error" tone="danger" :message="error" compact />
    <div class="lyrics-tap__actions">
      <template v-if="active">
        <UiButton
          :disabled="busy || lines.at(-1)?.lineId === lineId"
          @click="emit('skip')"
        >
          {{ t('lyricsEditor.tap.skip') }}
        </UiButton>
        <UiButton
          variant="accent"
          :disabled="busy || !canRecord"
          @click="emit('record')"
        >
          {{ t('lyricsEditor.tap.record') }}
        </UiButton>
      </template>
      <template v-else>
        <UiButton :disabled="busy" @click="emit('close')">{{
          t('common.cancel')
        }}</UiButton>
        <UiButton
          variant="accent"
          :disabled="busy || !lines.length"
          @click="emit('start')"
        >
          {{ t('lyricsEditor.tap.start') }}
        </UiButton>
      </template>
    </div>
  </UiSurface>
</template>

<style scoped>
.lyrics-tap {
  display: grid;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
}

.lyrics-tap__cue {
  display: grid;
  gap: var(--ui-space-1);
  white-space: pre-line;
}

.lyrics-tap__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}
</style>
