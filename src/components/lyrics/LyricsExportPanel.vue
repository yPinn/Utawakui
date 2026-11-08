<script setup>
import { onUnmounted, shallowRef, useId, watch } from 'vue';
import { formatMarkerTime } from '../../../shared/sessionExportTimepoints.mjs';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiSurface from '../ui/UiSurface.vue';

const props = defineProps({
  trackId: { type: String, required: true },
  filename: { type: String, required: true },
  session: { type: Object, required: true },
  blocked: Boolean,
});
const emit = defineEmits(['close', 'saving']);
const id = useId();
const format = shallowRef('lrc');
const preview = shallowRef(null);
const accepted = shallowRef(false);
const loading = shallowRef(false);
const saving = shallowRef(false);
const status = shallowRef('');
const error = shallowRef(false);
let generation = 0;
const formats = [
  { value: 'lrc', label: 'LRC' },
  { value: 'srt', label: 'SRT' },
];
const issues = [
  ['untimed', 'lyricsEditor.export.untimed'],
  ['invalid', 'lyricsEditor.export.invalid'],
  ['overlaps', 'lyricsEditor.export.overlaps'],
  ['estimatedEnds', 'lyricsEditor.export.estimatedEnds'],
  ['adjustedBreaks', 'lyricsEditor.export.adjustedBreaks'],
  ['sameTime', 'lyricsEditor.export.sameTime'],
];

async function loadPreview() {
  const request = ++generation;
  preview.value = null;
  error.value = false;
  accepted.value = false;
  status.value = '';
  if (props.blocked) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const result = await window.Utawakui.previewLyricsExport(
      props.trackId,
      props.filename,
      { ...props.session },
      format.value,
    );
    if (request === generation) preview.value = result;
  } catch {
    if (request === generation) error.value = true;
  } finally {
    if (request === generation) loading.value = false;
  }
}
watch(
  [
    () => props.trackId,
    () => props.filename,
    () => props.session,
    () => props.blocked,
    format,
  ],
  loadPreview,
  { immediate: true },
);
onUnmounted(() => {
  generation++;
  if (saving.value) emit('saving', false);
});

async function save() {
  const { token, needsConfirmation } = preview.value ?? {};
  if (
    !token ||
    (needsConfirmation && !accepted.value) ||
    props.blocked ||
    saving.value
  )
    return;
  const request = generation;
  saving.value = true;
  emit('saving', true);
  try {
    const result = await window.Utawakui.saveLyricsExport(
      token,
      accepted.value,
    );
    if (request !== generation) return;
    await loadPreview();
    if (result.status === 'saved')
      status.value = t('lyricsEditor.export.saved');
  } catch {
    if (request === generation) {
      preview.value = null;
      error.value = true;
    }
  } finally {
    saving.value = false;
    emit('saving', false);
  }
}
</script>

<template>
  <UiSurface class="lyrics-export">
    <UiHint>{{ t('lyricsEditor.export.basis') }}</UiHint>
    <UiSelect
      :id="`${id}-format`"
      v-model="format"
      :label="t('lyricsEditor.export.format')"
      :options="formats"
      :disabled="saving || blocked"
    />
    <UiHint v-if="loading" role="status">{{
      t('lyricsEditor.export.loading')
    }}</UiHint>
    <UiNotice
      v-else-if="error"
      :message="t('lyricsEditor.export.failed')"
      tone="danger"
      compact
    />
    <template v-else-if="preview">
      <UiHint role="status">{{
        t('lyricsEditor.export.count', { count: preview.count })
      }}</UiHint>
      <UiHint
        v-for="[key, label] in issues.filter(([key]) => preview.issues[key])"
        :key="key"
      >
        {{ t(label, { count: preview.issues[key] }) }}
      </UiHint>
      <ul v-if="preview.overlapDetails?.length" class="lyrics-export__samples">
        <li v-for="overlap in preview.overlapDetails" :key="overlap.later">
          {{
            t('lyricsEditor.export.overlapDetail', {
              earlier: overlap.earlier,
              later: overlap.later,
              start: formatMarkerTime(overlap.start),
              end: formatMarkerTime(overlap.end),
              text: overlap.text,
            })
          }}
        </li>
      </ul>
      <ul v-else-if="preview.rows.length" class="lyrics-export__samples">
        <li v-for="(row, index) in preview.rows" :key="index">
          <span class="lyrics-export__time">
            {{ formatMarkerTime(row.start) }}
            <template v-if="row.end !== undefined">
              {{
                t('lyricsEditor.export.until', {
                  time: formatMarkerTime(row.end),
                })
              }}
            </template>
            <template v-if="row.estimated">
              {{ t('lyricsEditor.export.estimated') }}
            </template>
          </span>
          <span>{{ row.text }}</span>
        </li>
      </ul>
      <UiHint v-if="!preview.token">
        {{
          t(
            preview.count
              ? 'lyricsEditor.export.fix'
              : 'lyricsEditor.export.noTimed',
          )
        }}
      </UiHint>
      <UiCheckbox
        v-if="preview.token && preview.needsConfirmation"
        :id="`${id}-confirm`"
        v-model="accepted"
        :disabled="saving"
        :label="t('lyricsEditor.export.confirm')"
      />
    </template>
    <UiHint v-if="status" role="status">{{ status }}</UiHint>
    <div class="lyrics-export__actions">
      <UiButton :disabled="saving" @click="emit('close')">{{
        t('common.close')
      }}</UiButton>
      <UiButton
        v-if="error"
        :disabled="blocked || loading || saving"
        @click="loadPreview"
      >
        {{ t('lyricsEditor.export.retry') }}
      </UiButton>
      <UiButton
        v-else
        variant="accent"
        :disabled="
          !preview?.token ||
          loading ||
          saving ||
          blocked ||
          (preview.needsConfirmation && !accepted)
        "
        @click="save"
      >
        {{ t('lyricsEditor.export.save') }}
      </UiButton>
    </div>
  </UiSurface>
</template>

<style scoped>
.lyrics-export {
  display: grid;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
}
.lyrics-export__samples {
  margin: 0;
  padding-inline-start: var(--ui-space-5);
  overflow-wrap: anywhere;
}
.lyrics-export__samples li {
  white-space: pre-line;
}
.lyrics-export__time {
  font-variant-numeric: tabular-nums;
  margin-inline-end: var(--ui-space-2);
}
.lyrics-export__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}
</style>
