<script setup>
import { t } from '../../utils/i18n.js';
// Edits a photo's instant-film line and its caption note, which takes a
// note's title and body. Drafts commit only on Save; clearing removes text.
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

const PHOTO_LABEL_MAX_LENGTH = 16;
const PHOTO_CAPTION_TITLE_MAX_LENGTH = 80;
const PHOTO_CAPTION_MAX_LENGTH = 2000;
// Matches the note editor and playlist details so all three share one anatomy.
const PREVIEW_SIZE = ARTWORK_SIZE['2xl'];

const props = defineProps({
  open: { type: Boolean, default: false },
  // The photo projection: imageUrl, frame, ratio, label, captionTitle, caption.
  photo: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['close', 'save']);

const labelDraft = shallowRef('');
const captionTitleDraft = shallowRef('');
const captionDraft = shallowRef('');
const captionPaperIndex = shallowRef(0);
// The stock shown on open, so only a real switch counts as a change.
let openedCaptionPaperIndex = 0;
const captionPaper = computed(() => NOTE_PAPERS[captionPaperIndex.value]);
const hasCaption = computed(
  () =>
    captionTitleDraft.value.trim() !== '' || captionDraft.value.trim() !== '',
);
const previewStyle = Object.freeze({
  '--app-folder-photo-text-preview-size': `${PREVIEW_SIZE}px`,
});

const isInstant = computed(() => props.photo?.frame === 'instant');
const changed = computed(
  () =>
    labelDraft.value !== (props.photo?.label ?? '') ||
    captionTitleDraft.value !== (props.photo?.captionTitle ?? '') ||
    captionDraft.value !== (props.photo?.caption ?? '') ||
    (hasCaption.value && captionPaperIndex.value !== openedCaptionPaperIndex),
);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    labelDraft.value = props.photo?.label ?? '';
    captionTitleDraft.value = props.photo?.captionTitle ?? '';
    captionDraft.value = props.photo?.caption ?? '';
    captionPaperIndex.value = notePaperIndex(props.photo?.captionPaper);
    openedCaptionPaperIndex = captionPaperIndex.value;
  },
  { immediate: true },
);

function save() {
  if (props.saving || !changed.value) return;
  emit('save', {
    label: isInstant.value ? labelDraft.value.trim() : '',
    captionTitle: captionTitleDraft.value.trim(),
    caption: captionDraft.value.trimEnd(),
    captionPaper: captionPaper.value.id,
  });
}

function cycleCaptionPaper() {
  if (props.saving) return;
  captionPaperIndex.value = nextNotePaperIndex(captionPaperIndex.value);
}

function cancel() {
  if (props.saving) return;
  emit('close');
}
</script>

<template>
  <UiModal
    :open="open"
    :title="t('folder.photo.editTitle')"
    size="notice"
    :close-disabled="saving"
    @close="cancel"
  >
    <div class="app-folder-photo-text" :style="previewStyle">
      <div class="app-folder-photo-text__visual">
        <div
          class="app-folder-photo-text__preview"
          :data-photo-frame="photo?.frame ?? 'print'"
          :data-photo-ratio="photo?.ratio ?? 'landscape'"
          aria-hidden="true"
        >
          <UiFolderArtifact
            v-if="photo"
            kind="photo"
            :src="photo.imageUrl"
            alt=""
            :frame="photo.frame ?? 'print'"
            :ratio="photo.ratio ?? 'landscape'"
            :label="isInstant ? labelDraft : ''"
          />
        </div>
        <!-- The caption note's swatch, tucked at the print's corner as it
             is when expanded; it fades until the caption has text. -->
        <div
          class="app-folder-photo-text__caption-paper"
          :class="{
            'app-folder-photo-text__caption-paper--empty': !hasCaption,
          }"
        >
          <UiFolderArtifact
            kind="note"
            material="translucent"
            :paper="captionPaper.id"
            aria-hidden="true"
          />
          <UiIconButton
            class="app-folder-photo-text__caption-paper-switch"
            :icon="Palette"
            :label="
              t('folder.photo.switchCaptionPaper', {
                paper: captionPaper.label,
              })
            "
            variant="overlay"
            tooltip-placement="bottom"
            :disabled="saving"
            @click="cycleCaptionPaper"
          />
        </div>
      </div>

      <div class="app-folder-photo-text__fields">
        <UiTextField
          v-if="isInstant"
          id="app-folder-photo-text-label"
          v-model="labelDraft"
          :label="t('folder.photo.frameText')"
          :hint="
            t('folder.photo.frameTextHint', { max: PHOTO_LABEL_MAX_LENGTH })
          "
          :placeholder="t('folder.photo.frameTextPlaceholder')"
          :maxlength="PHOTO_LABEL_MAX_LENGTH"
          :disabled="saving"
          @keydown.enter="save"
        />
        <UiTextField
          id="app-folder-photo-text-caption-title"
          v-model="captionTitleDraft"
          :label="t('folder.photo.captionTitle')"
          text-role="title"
          :placeholder="t('folder.note.titlePlaceholder')"
          :maxlength="PHOTO_CAPTION_TITLE_MAX_LENGTH"
          :disabled="saving"
          @keydown.enter="save"
        />
        <UiTextarea
          id="app-folder-photo-text-caption"
          v-model="captionDraft"
          class="app-folder-photo-text__caption"
          :label="t('folder.photo.caption')"
          label-hidden
          fill
          resize="none"
          :placeholder="t('folder.photo.captionPlaceholder')"
          :rows="3"
          :maxlength="PHOTO_CAPTION_MAX_LENGTH"
          :disabled="saving"
        />
      </div>
    </div>

    <UiNotice v-if="error" :message="error" tone="danger" compact />
    <template #footer>
      <UiHint class="app-folder-photo-text__footnote">
        {{ t('folder.photo.hint') }}
      </UiHint>
      <UiButton variant="secondary" :disabled="saving" @click="cancel">
        {{ t('common.cancel') }}
      </UiButton>
      <UiButton
        variant="accent"
        :loading="saving"
        :loading-label="t('common.saving')"
        :disabled="saving || !changed"
        @click="save"
      >
        {{ t('common.save') }}
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.app-folder-photo-text {
  min-inline-size: 0;
  display: grid;
  grid-template-columns:
    var(--app-folder-photo-text-preview-size)
    minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-modal-section-gap);
}

.app-folder-photo-text__visual {
  position: relative;
  inline-size: var(--app-folder-photo-text-preview-size);
  block-size: var(--app-folder-photo-text-preview-size);
}

/* A small square of the caption stock over the print's lower end corner. */
.app-folder-photo-text__caption-paper {
  --ui-folder-artifact-note-width: var(--ui-space-8);
  --ui-folder-artifact-note-min-height: var(--ui-space-8);

  position: absolute;
  z-index: var(--ui-layer-raised);
  inset-inline-end: 0;
  inset-block-end: 0;
  transition: opacity var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.app-folder-photo-text__caption-paper :deep(.ui-folder-artifact) {
  padding: 0;
}

.app-folder-photo-text__caption-paper--empty {
  opacity: var(--ui-opacity-disabled);
}

.app-folder-photo-text__caption-paper-switch {
  position: absolute;
  z-index: var(--ui-layer-indicator);
  inset-inline-end: var(--ui-space-1);
  inset-block-end: var(--ui-space-1);
}

/* Each print fills the square by its own long edge, so its text and the
   caption swatch read at a useful size. */
.app-folder-photo-text__preview {
  --app-folder-photo-text-long-mm: var(--ui-photo-print-long-mm);
  --ui-photo-page-scale: 1;
  /* Room around the long edge for the mat and border of a print. */
  --ui-photo-mm: calc(100cqmin / (var(--app-folder-photo-text-long-mm) * 1.2));

  container-type: size;
  inline-size: var(--app-folder-photo-text-preview-size);
  block-size: var(--app-folder-photo-text-preview-size);
  display: grid;
  place-items: center;
  overflow: hidden;
  pointer-events: none;
}

.app-folder-photo-text__preview[data-photo-frame='archival'] {
  --app-folder-photo-text-long-mm: var(--ui-photo-archival-long-mm);
}

.app-folder-photo-text__preview[data-photo-frame='instant'] {
  --app-folder-photo-text-long-mm: var(--ui-photo-instant-film-block-mm);
}

.app-folder-photo-text__preview[data-photo-frame='instant'][data-photo-ratio='landscape'] {
  --app-folder-photo-text-long-mm: var(--ui-photo-instant-wide-film-mm);
}

.app-folder-photo-text__fields {
  min-inline-size: 0;
  min-block-size: var(--app-folder-photo-text-preview-size);
  display: grid;
  grid-template-rows: auto auto minmax(calc(var(--ui-field-height) * 2), 1fr);
  align-content: start;
  gap: var(--ui-modal-section-gap);
}

/* Without the instant line, the caption title and body fill the column. */
.app-folder-photo-text__fields:not(:has(#app-folder-photo-text-label)) {
  grid-template-rows: auto minmax(calc(var(--ui-field-height) * 2), 1fr);
}

.app-folder-photo-text__caption {
  min-block-size: 0;
  block-size: 100%;
}

.app-folder-photo-text__footnote {
  min-inline-size: 0;
  margin-inline-end: auto;
}

@container (max-width: 25.5rem) {
  .app-folder-photo-text {
    grid-template-columns: minmax(0, 1fr);
  }

  .app-folder-photo-text__preview {
    justify-self: center;
  }

  .app-folder-photo-text__fields {
    min-block-size: 0;
  }
}
</style>
