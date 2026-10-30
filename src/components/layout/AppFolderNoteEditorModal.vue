<script setup>
import { t } from '../../utils/i18n.js';
// Creates or edits one Folder note. Content is drafted locally and committed
// only on Save, so an overlapping note can never be edited by a stray click.
import { computed, shallowRef, watch } from 'vue';
import { ARTWORK_SIZE } from '../../constants/ui.js';
import { Palette } from '../../icons/index.js';
import {
  NOTE_PAPERS,
  nextNotePaperIndex,
  notePaperIndex,
} from '../../utils/notePapers.js';
import UiButton from '../ui/UiButton.vue';
import UiFolderArtifact from '../ui/UiFolderArtifact.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import UiTextField from '../ui/UiTextField.vue';

const NOTE_TITLE_MAX_LENGTH = 80;
const NOTE_TEXT_MAX_LENGTH = 2000;
// Matches the playlist details cover so both editors share one anatomy.
const NOTE_PREVIEW_SIZE = ARTWORK_SIZE['2xl'];

const props = defineProps({
  open: { type: Boolean, default: false },
  mode: {
    type: String,
    default: 'create',
    validator: (value) => ['create', 'edit'].includes(value),
  },
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  // The note's own stock in edit mode; a new note starts on a random one.
  paper: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['close', 'save']);

const titleDraft = shallowRef('');
const textDraft = shallowRef('');
const paperIndex = shallowRef(0);
const paperDraft = computed(() => NOTE_PAPERS[paperIndex.value]);
const previewStyle = Object.freeze({
  '--app-folder-note-editor-preview-size': `${NOTE_PREVIEW_SIZE}px`,
});

const modalTitle = computed(() =>
  t(props.mode === 'create' ? 'folder.note.create' : 'folder.note.edit'),
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
    paperIndex.value = notePaperIndex(props.paper);
  },
  { immediate: true },
);

function save() {
  if (!canSave.value) return;
  emit('save', {
    title: titleDraft.value.trim(),
    text: textDraft.value.trimEnd(),
    paper: paperDraft.value.id,
  });
}

function cyclePaper() {
  if (props.saving) return;
  paperIndex.value = nextNotePaperIndex(paperIndex.value);
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
      <!-- A swatch of the paper itself; the shared overlay control moves to
           the next stock. -->
      <div class="app-folder-note-editor__paper">
        <UiFolderArtifact
          kind="note"
          material="translucent"
          :paper="paperDraft.id"
          aria-hidden="true"
        >
          <span class="app-folder-note-editor__paper-name">
            {{ paperDraft.label }}
          </span>
        </UiFolderArtifact>
        <UiIconButton
          class="app-folder-note-editor__paper-switch"
          :icon="Palette"
          :label="t('folder.note.switchPaper', { paper: paperDraft.label })"
          variant="overlay"
          tooltip-placement="bottom"
          :disabled="saving"
          @click="cyclePaper"
        />
      </div>

      <div class="app-folder-note-editor__fields">
        <UiTextField
          id="app-folder-note-editor-title"
          v-model="titleDraft"
          class="app-folder-note-editor__title-field"
          :label="t('folder.note.title')"
          label-hidden
          text-role="title"
          :placeholder="t('folder.note.titlePlaceholder')"
          :maxlength="NOTE_TITLE_MAX_LENGTH"
          :disabled="saving"
          @keydown.enter="save"
        />
        <UiTextarea
          id="app-folder-note-editor-text"
          v-model="textDraft"
          class="app-folder-note-editor__text-field"
          :label="t('folder.note.body')"
          label-hidden
          fill
          resize="none"
          :placeholder="t('folder.note.body')"
          :rows="3"
          :maxlength="NOTE_TEXT_MAX_LENGTH"
          :disabled="saving"
        />
      </div>
    </div>

    <UiNotice v-if="error" :message="error" tone="danger" compact />
    <template #footer>
      <UiHint class="app-folder-note-editor__footnote">
        {{ t('folder.note.hint') }}
      </UiHint>
      <UiButton variant="secondary" :disabled="saving" @click="cancel">
        {{ t('common.cancel') }}
      </UiButton>
      <UiButton
        variant="accent"
        :loading="saving"
        :loading-label="t('common.saving')"
        :disabled="!canSave"
        @click="save"
      >
        {{ t('common.save') }}
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

.app-folder-note-editor__paper {
  position: relative;
  inline-size: var(--app-folder-note-editor-preview-size);
  block-size: var(--app-folder-note-editor-preview-size);
}

/* Corner control: positioned by the swatch, like the cover's clear button. */
.app-folder-note-editor__paper-switch {
  position: absolute;
  z-index: var(--ui-layer-indicator);
  inset-inline-end: var(--ui-space-2);
  inset-block-end: var(--ui-space-2);
}

/* The swatch fills the square instead of the canvas note stock. */
.app-folder-note-editor__paper :deep(.ui-folder-artifact) {
  inline-size: 100%;
  block-size: 100%;
  min-block-size: 0;
  align-content: end;
  padding: var(--ui-space-4);
}

.app-folder-note-editor__paper-name {
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-utility);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  text-align: start;
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
