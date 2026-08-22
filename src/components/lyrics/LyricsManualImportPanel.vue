<script setup>
import { computed, ref } from 'vue';
import { FolderOpen } from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';

const emit = defineEmits(['cancel', 'saved']);

const { state, selectedTrack, importManualLyricsText, importManualLyricsFile } =
  useLyrics();

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
  <form
    class="lyrics-manual-import-panel"
    aria-labelledby="lyrics-manual-import-title"
    @submit.prevent="handleTextSubmit"
  >
    <div class="lyrics-manual-import-panel__header">
      <div>
        <h4 id="lyrics-manual-import-title">手動匯入</h4>
        <p>貼上 LRC / 純文字，或選擇本機歌詞檔。</p>
      </div>
      <UiButton title="收合手動匯入" @click="emit('cancel')">收合</UiButton>
    </div>

    <UiHint v-if="!selectedTrack" padded>請先選擇曲目。</UiHint>
    <UiNotice
      v-if="state.manualSave.error"
      tone="danger"
      title="歌詞變更未完成"
      :message="state.manualSave.error"
      compact
    />

    <label class="lyrics-manual-import-panel__field">
      <span class="lyrics-manual-import-panel__label">標籤</span>
      <input
        v-model="labelDraft"
        class="lyrics-manual-import-panel__input"
        maxlength="32"
        placeholder="可留空"
      />
    </label>

    <label class="lyrics-manual-import-panel__field">
      <span class="lyrics-manual-import-panel__label">歌詞內容</span>
      <textarea
        v-model="textDraft"
        class="lyrics-manual-import-panel__textarea"
        rows="8"
        placeholder="貼上 LRC 或純文字歌詞"
      />
    </label>

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
        {{ state.manualSave.isSaving ? '儲存中...' : '儲存' }}
      </UiButton>
    </div>
  </form>
</template>

<style scoped>
.lyrics-manual-import-panel {
  display: grid;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
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
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-body);
}

.lyrics-manual-import-panel__header p {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.lyrics-manual-import-panel__field {
  display: grid;
  gap: var(--ui-space-1);
}

.lyrics-manual-import-panel__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.lyrics-manual-import-panel__input,
.lyrics-manual-import-panel__textarea {
  width: 100%;
  min-width: 0;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
}

.lyrics-manual-import-panel__input {
  height: var(--ui-control-height);
  padding: 0 var(--ui-space-2);
}

.lyrics-manual-import-panel__textarea {
  resize: vertical;
  padding: var(--ui-space-2);
}

.lyrics-manual-import-panel__input:focus-visible,
.lyrics-manual-import-panel__textarea:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.lyrics-manual-import-panel__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}
</style>
