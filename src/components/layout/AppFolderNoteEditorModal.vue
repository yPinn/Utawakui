<script setup>
// Creates or edits one Folder note. Content is drafted locally and committed
// only on Save, so an overlapping note can never be edited by a stray click.
import { computed, shallowRef, watch } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiFolderArtifact from '../ui/UiFolderArtifact.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import UiTextField from '../ui/UiTextField.vue';

const NOTE_TITLE_MAX_LENGTH = 80;
const NOTE_TEXT_MAX_LENGTH = 2000;
// Matches the playlist details cover so both editors share one anatomy.
const NOTE_PREVIEW_SIZE = 160;

const props = defineProps({
  open: { type: Boolean, default: false },
  mode: {
    type: String,
    default: 'create',
    validator: (value) => ['create', 'edit'].includes(value),
  },
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  // Edit mode previews the note's own stock; a new note's stock is picked on
  // creation, so its preview stays on the neutral tissue sheet.
  paper: { type: String, default: 'tissue' },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'save']);

const titleDraft = shallowRef('');
const textDraft = shallowRef('');
const previewStyle = Object.freeze({
  '--app-folder-note-editor-preview-size': `${NOTE_PREVIEW_SIZE}px`,
});

const modalTitle = computed(() =>
  props.mode === 'create' ? '新增便條' : '編輯便條',
);
const canSave = computed(
  () =>
    !props.saving &&
    (titleDraft.value.trim() !== '' || textDraft.value.trim() !== ''),
);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    titleDraft.value = props.title;
    textDraft.value = props.text;
  },
  { immediate: true },
);

function save() {
  if (!canSave.value) return;
  emit('save', {
    title: titleDraft.value.trim(),
    text: textDraft.value.trimEnd(),
  });
}

function cancel() {
  if (props.saving) return;
  emit('close');
}
</script>

<template>
  <UiModal
    :open="open"
    :title="modalTitle"
    size="notice"
    :close-disabled="saving"
    @close="cancel"
  >
    <div class="app-folder-note-editor" :style="previewStyle">
      <div class="app-folder-note-editor__preview" aria-hidden="true">
        <UiFolderArtifact
          kind="note"
          material="translucent"
          :paper="mode === 'edit' ? paper : 'tissue'"
          :title="titleDraft"
          :body="textDraft"
        />
      </div>

      <div class="app-folder-note-editor__fields">
        <UiTextField
          id="app-folder-note-editor-title"
          v-model="titleDraft"
          class="app-folder-note-editor__title-field"
          label="標題"
          label-hidden
          text-role="title"
          placeholder="標題（選填）"
          :maxlength="NOTE_TITLE_MAX_LENGTH"
          :disabled="saving"
          @keydown.enter="save"
        />
        <UiTextarea
          id="app-folder-note-editor-text"
          v-model="textDraft"
          class="app-folder-note-editor__text-field"
          label="內文"
          label-hidden
          fill
          resize="none"
          placeholder="內文"
          :rows="3"
          :maxlength="NOTE_TEXT_MAX_LENGTH"
          :disabled="saving"
        />
      </div>
    </div>

    <template #footer>
      <UiHint class="app-folder-note-editor__footnote">
        {{
          mode === 'create' ? '紙色於建立時決定；標題可留空。' : '標題可留空。'
        }}
      </UiHint>
      <UiButton variant="secondary" :disabled="saving" @click="cancel">
        取消
      </UiButton>
      <UiButton
        variant="accent"
        :loading="saving"
        loading-label="儲存中"
        :disabled="!canSave"
        @click="save"
      >
        儲存
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
/* Same anatomy as the playlist details editor: a square visual beside the
   fields, with the body field reaching the visual's bottom edge. */
.app-folder-note-editor {
  min-inline-size: 0;
  display: grid;
  grid-template-columns:
    var(--app-folder-note-editor-preview-size)
    minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-modal-section-gap);
}

.app-folder-note-editor__preview {
  inline-size: var(--app-folder-note-editor-preview-size);
  block-size: var(--app-folder-note-editor-preview-size);
  overflow: hidden;
  pointer-events: none;
}

/* The live preview fills the square instead of the canvas note stock. */
.app-folder-note-editor__preview :deep(.ui-folder-artifact) {
  inline-size: 100%;
  block-size: 100%;
  min-block-size: 0;
  overflow: hidden;
  padding: var(--ui-space-4);
}

.app-folder-note-editor__fields {
  min-inline-size: 0;
  min-block-size: var(--app-folder-note-editor-preview-size);
  display: grid;
  grid-template-rows: auto minmax(calc(var(--ui-field-height) * 2), 1fr);
  align-content: start;
  gap: var(--ui-modal-section-gap);
}

/* Fill the remaining track so the text aligns with the preview's bottom edge. */
.app-folder-note-editor__text-field {
  min-block-size: 0;
  block-size: 100%;
}

/* Start of the footer row, pushing the actions to the end. */
.app-folder-note-editor__footnote {
  min-inline-size: 0;
  margin-inline-end: auto;
}

@container (max-width: 25.5rem) {
  .app-folder-note-editor {
    grid-template-columns: minmax(0, 1fr);
  }

  .app-folder-note-editor__fields {
    min-block-size: 0;
    grid-template-rows: auto auto;
  }

  .app-folder-note-editor__text-field {
    --ui-textarea-fill-block-size: auto;

    block-size: auto;
  }
}
</style>
