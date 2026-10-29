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
        <h4 id="lyrics-manual-import-title">手動匯入</h4>
        <p>貼上 LRC 或純文字，或選擇本機歌詞檔。</p>
      </div>
      <UiButton title="收合手動匯入" @click="emit('cancel')">收合</UiButton>
    </div>

    <UiHint v-if="!selectedTrack" padded>請先選擇曲目。</UiHint>
    <UiNotice
      v-if="state.manualSave.error"
      tone="danger"
      title="歌詞未匯入"
      :message="state.manualSave.error"
      compact
    />

    <UiTextField
      :id="`${fieldId}-label`"
      v-model="labelDraft"
      label="標籤"
      :maxlength="32"
      placeholder="可留空"
    />

    <UiTextarea
      :id="`${fieldId}-text`"
      v-model="textDraft"
      label="歌詞內容"
      :rows="8"
      placeholder="貼上 LRC 或純文字歌詞"
    />

    <div class="lyrics-manual-import-panel__actions">
      <UiButton
        :icon="FolderOpen"
        :disabled="state.manualSave.isSaving || isImportingFile"
        title="選擇 LRC、VTT 或文字檔"
        @click="handleFileImport"
      >
        選擇檔案
      </UiButton>
      <UiButton
        variant="accent"
        :disabled="!canImportText"
        title="儲存貼上的歌詞"
        @click="handleTextSubmit"
      >
        {{ state.manualSave.isSaving ? '儲存中…' : '儲存' }}
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
