<script setup>
import { computed, ref, useId } from 'vue';
import { FolderOpen } from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { trackArtistText } from '../../utils/artistPage.js';
import {
  recordingVersionTags,
  trackTitlePresentation,
} from '../../utils/trackTitlePresentation.js';
import { pickPreferredLyricsSource } from '../../utils/lyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiSurface from '../ui/UiSurface.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import UiTextField from '../ui/UiTextField.vue';
import { t } from '../../utils/i18n.js';

const emit = defineEmits(['cancel', 'saved']);

const { state, selectedTrack, importManualLyricsText, importManualLyricsFile } =
  useLyrics();
const { state: library } = useLibrary();

const fieldId = `lyrics-manual-import-${useId()}`;
const labelDraft = ref('');
const textDraft = ref('');
const isImportingFile = ref(false);
const referenceId = ref('');
const readingReference = ref(false);
const referenceError = ref(false);
const references = computed(() => {
  const current = selectedTrack.value;
  const work = current?.workPresentation;
  if (work?.relationship !== 'cover') return [];
  const versions = recordingVersionTags(current);
  const score = (track) =>
    Number(track.id === work.referenceTrackId) * 8 +
    Number(
      recordingVersionTags(track).some((version) => versions.includes(version)),
    ) *
      3 +
    ({ original: 2, unknown: 1, cover: 0 }[
      track.workPresentation.relationship
    ] ?? 0);
  return library.tracks
    .filter(
      (track) =>
        track.id !== current.id &&
        track.workPresentation?.workId === work.workId,
    )
    .map((track) => ({ track, source: pickPreferredLyricsSource(track) }))
    .filter(({ source }) => source)
    .sort((a, b) => score(b.track) - score(a.track));
});
const referenceOptions = computed(() =>
  references.value.map(({ track }) => ({
    value: track.id,
    label: [trackTitlePresentation(track).title, trackArtistText(track)]
      .filter(Boolean)
      .join(' · '),
  })),
);
const selectedReference = computed(
  () =>
    references.value.find(({ track }) => track.id === referenceId.value) ??
    references.value[0],
);

async function prepareReference() {
  const currentId = selectedTrack.value?.id;
  const chosen = selectedReference.value;
  if (!chosen || !currentId || textDraft.value.trim() || readingReference.value)
    return;
  readingReference.value = true;
  referenceError.value = false;
  try {
    const result = await window.Utawakui.getTrackLyricsReference(
      chosen.track.id,
      chosen.source.filename,
    );
    if (
      selectedTrack.value?.id !== currentId ||
      selectedReference.value !== chosen ||
      textDraft.value.trim()
    )
      return;
    const text = result?.text;
    if (!text) {
      referenceError.value = true;
      return;
    }
    textDraft.value = text;
    if (!labelDraft.value) {
      labelDraft.value = t('lyricsSource.manual.referenceLabel', {
        artist: trackArtistText(chosen.track),
      }).slice(0, 32);
    }
  } catch {
    if (selectedTrack.value?.id === currentId) referenceError.value = true;
  } finally {
    readingReference.value = false;
  }
}

const canImportText = computed(
  () => textDraft.value.trim().length > 0 && !state.manualSave.isSaving,
);

function resetDrafts() {
  labelDraft.value = '';
  textDraft.value = '';
}

async function handleTextSubmit() {
  if (!canImportText.value) return;
  const result = await importManualLyricsText({
    text: textDraft.value,
    label: labelDraft.value,
  });
  if (!result) return;
  resetDrafts();
  emit('saved');
}

async function handleFileImport() {
  isImportingFile.value = true;
  try {
    const result = await importManualLyricsFile();
    if (result) {
      resetDrafts();
      emit('saved');
    }
  } finally {
    isImportingFile.value = false;
  }
}
</script>

<template>
  <UiSurface
    tag="form"
    class="lyrics-manual-import-panel"
    aria-labelledby="lyrics-manual-import-title"
    @submit.prevent="handleTextSubmit"
  >
    <div class="lyrics-manual-import-panel__header">
      <div>
        <h4 id="lyrics-manual-import-title">
          {{ t('lyricsAcquisition.manual') }}
        </h4>
        <p>{{ t('lyricsSource.manual.hint') }}</p>
      </div>
      <UiButton
        :title="t('lyricsSource.manual.collapseTitle')"
        @click="emit('cancel')"
        >{{ t('lyricsSource.manual.collapse') }}</UiButton
      >
    </div>

    <UiHint v-if="!selectedTrack" padded>{{
      t('lyricsEditor.document.selectTrack')
    }}</UiHint>
    <UiNotice
      v-if="state.manualSave.error"
      tone="danger"
      :title="t('lyricsSource.manual.failed')"
      :message="state.manualSave.error"
      compact
    />

    <UiTextField
      :id="`${fieldId}-label`"
      v-model="labelDraft"
      :label="t('lyricsSource.manual.label')"
      :maxlength="32"
      :placeholder="t('lyricsSource.manual.optional')"
    />

    <template v-if="referenceOptions.length">
      <UiSelect
        :id="`${fieldId}-reference`"
        :label="t('lyricsSource.manual.reference')"
        :model-value="selectedReference?.track.id"
        :options="referenceOptions"
        :disabled="readingReference"
        @update:model-value="referenceId = $event"
      />
      <div>
        <UiButton
          :loading="readingReference"
          :disabled="Boolean(textDraft.trim()) || state.manualSave.isSaving"
          @click="prepareReference"
          >{{ t('lyricsSource.manual.prepareReference') }}</UiButton
        >
        <UiHint v-if="referenceError" role="status">{{
          t('lyricsSource.manual.referenceFailed')
        }}</UiHint>
      </div>
    </template>

    <UiTextarea
      :id="`${fieldId}-text`"
      v-model="textDraft"
      :label="t('lyricsSource.manual.text')"
      :rows="8"
      :placeholder="t('lyricsSource.manual.placeholder')"
    />

    <div class="lyrics-manual-import-panel__actions">
      <UiButton
        :icon="FolderOpen"
        :disabled="state.manualSave.isSaving || isImportingFile"
        :title="t('lyricsSource.manual.fileTitle')"
        @click="handleFileImport"
      >
        {{ t('lyricsSource.manual.file') }}
      </UiButton>
      <UiButton
        variant="accent"
        :disabled="!canImportText"
        :title="t('lyricsSource.manual.saveTitle')"
        @click="handleTextSubmit"
      >
        {{
          state.manualSave.isSaving
            ? t('lyricsSource.saving')
            : t('common.save')
        }}
      </UiButton>
    </div>
  </UiSurface>
</template>

<style scoped>
.lyrics-manual-import-panel {
  display: grid;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
}

.lyrics-manual-import-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.lyrics-manual-import-panel__header h4 {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
}

.lyrics-manual-import-panel__header p {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.lyrics-manual-import-panel__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}
</style>
