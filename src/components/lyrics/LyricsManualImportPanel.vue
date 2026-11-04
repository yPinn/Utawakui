<script setup>
import { computed, ref, useId } from 'vue';
import { FolderOpen } from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSurface from '../ui/UiSurface.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import UiTextField from '../ui/UiTextField.vue';
import { t } from '../../utils/i18n.js';

const emit = defineEmits(['cancel', 'saved']);

const { state, selectedTrack, importManualLyricsText, importManualLyricsFile } =
  useLyrics();

const fieldId = `lyrics-manual-import-${useId()}`;
const labelDraft = ref('');
const textDraft = ref('');
const isImportingFile = ref(false);

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
