<script setup>
import { computed, onUnmounted, ref, useId, watch } from 'vue';
import timingValues from '../../../shared/lyricsTimingValues.json';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiSurface from '../ui/UiSurface.vue';
import UiTextarea from '../ui/UiTextarea.vue';

const props = defineProps({
  authored: Boolean,
  lines: { type: Array, required: true },
  recheckLineIds: { type: Array, default: () => [] },
  timingConfirmed: Boolean,
  busy: Boolean,
  error: { type: String, default: '' },
  fork: { type: Function, required: true },
  save: { type: Function, required: true },
});
const emit = defineEmits(['dirty', 'close']);
const id = useId();
const lineId = ref('');
const text = ref('');
const operation = ref('replace');
const line = computed(() =>
  props.lines.find((item) => item.lineId === lineId.value),
);
const options = computed(() =>
  props.lines.map((item, index) => ({
    value: item.lineId,
    label: `${index + 1}. ${item.text.replace(/\s+/gu, ' ').slice(0, 95)}`,
  })),
);
const dirty = computed(() =>
  Boolean(
    line.value &&
    (operation.value !== 'replace' || text.value !== line.value.text),
  ),
);
const operations = computed(() => [
  { value: 'replace', label: t('lyricsEditor.correction.title') },
  { value: 'insert', label: t('lyricsEditor.correction.insert') },
  { value: 'split', label: t('lyricsEditor.correction.split') },
  ...(props.lines.at(-1)?.lineId !== lineId.value
    ? [{ value: 'merge', label: t('lyricsEditor.correction.merge') }]
    : []),
]);
const canSave = computed(
  () =>
    dirty.value &&
    Boolean(text.value.trim()) &&
    (operation.value !== 'split' || /\r?\n/u.test(text.value)),
);
watch(dirty, (value) => emit('dirty', value), { flush: 'sync' });
onUnmounted(() => emit('dirty', false));

function selectLine(value, lines = props.lines) {
  lineId.value = value;
  operation.value = 'replace';
  text.value = lines.find((item) => item.lineId === value)?.text ?? '';
}
function selectOperation(value) {
  if (value === 'insert' && !dirty.value) text.value = '';
  operation.value = value;
}
watch(
  () => props.lines,
  () => {
    if (!line.value) selectLine(props.lines[0]?.lineId ?? '');
  },
  { immediate: true },
);

async function saveLine() {
  if (props.busy || !canSave.value) return;
  const saved = await props.save(lineId.value, text.value, operation.value);
  if (saved) selectLine(lineId.value, saved.timing.document.lines);
}
</script>

<template>
  <UiSurface class="lyrics-correction">
    <UiHint>{{
      t(
        authored
          ? 'lyricsEditor.correction.editHint'
          : 'lyricsEditor.correction.copyHint',
      )
    }}</UiHint>
    <template v-if="authored">
      <UiSelect
        :id="`${id}-line`"
        :label="t('lyricsEditor.correction.line')"
        :model-value="lineId"
        :options="options"
        :disabled="dirty || busy"
        @update:model-value="selectLine"
      />
      <UiSelect
        :id="`${id}-operation`"
        :label="t('lyricsEditor.correction.operation')"
        :model-value="operation"
        :options="operations"
        :disabled="busy || !line"
        @update:model-value="selectOperation"
      />
      <UiTextarea
        :id="`${id}-text`"
        v-model="text"
        :label="t('lyricsEditor.correction.text')"
        :maxlength="timingValues.maxTextLength"
        :disabled="busy || !line"
        :rows="2"
      />
      <UiHint
        v-if="
          recheckLineIds.includes(lineId) &&
          (!timingConfirmed || line?.startMs == null)
        "
      >
        {{ t('lyricsEditor.correction.recheck') }}
      </UiHint>
      <UiHint v-if="operation !== 'replace'">
        {{ t('lyricsEditor.correction.structureHint') }}
      </UiHint>
    </template>
    <UiNotice v-if="error" tone="danger" :message="error" compact />
    <div class="lyrics-correction__actions">
      <UiButton v-if="!dirty" :disabled="busy" @click="emit('close')">
        {{ t('lyricsEditor.workspace.finish') }}
      </UiButton>
      <UiButton v-else :disabled="busy" @click="selectLine(lineId)">
        {{ t('common.cancel') }}
      </UiButton>
      <UiButton
        v-if="!authored"
        variant="accent"
        :disabled="busy"
        @click="fork"
      >
        {{ t('lyricsEditor.correction.copy') }}
      </UiButton>
      <UiButton
        v-else
        variant="accent"
        :disabled="busy || !canSave"
        @click="saveLine"
      >
        {{ t('common.save') }}
      </UiButton>
    </div>
  </UiSurface>
</template>

<style scoped>
.lyrics-correction {
  display: grid;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
}

.lyrics-correction__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}
</style>
