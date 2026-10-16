<script setup>
// Edits a photo's instant-film line and its caption note. Drafts commit only
// on Save; clearing a field removes that text.
import { computed, shallowRef, watch } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiFolderArtifact from '../ui/UiFolderArtifact.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import UiTextField from '../ui/UiTextField.vue';

const PHOTO_LABEL_MAX_LENGTH = 16;
const PHOTO_CAPTION_MAX_LENGTH = 80;
// Matches the note editor and playlist details so all three share one anatomy.
const PREVIEW_SIZE = 160;

const props = defineProps({
  open: { type: Boolean, default: false },
  // The photo projection: imageUrl, frame, ratio, label, caption.
  photo: { type: Object, default: null },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'save']);

const labelDraft = shallowRef('');
const captionDraft = shallowRef('');
const previewStyle = Object.freeze({
  '--app-folder-photo-text-preview-size': `${PREVIEW_SIZE}px`,
});

const isInstant = computed(() => props.photo?.frame === 'instant');
const changed = computed(
  () =>
    labelDraft.value !== (props.photo?.label ?? '') ||
    captionDraft.value !== (props.photo?.caption ?? ''),
);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    labelDraft.value = props.photo?.label ?? '';
    captionDraft.value = props.photo?.caption ?? '';
  },
  { immediate: true },
);

function save() {
  if (props.saving || !changed.value) return;
  emit('save', {
    label: isInstant.value ? labelDraft.value.trim() : '',
    caption: captionDraft.value.trim(),
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
    title="編輯照片文字"
    size="notice"
    :close-disabled="saving"
    @close="cancel"
  >
    <div class="app-folder-photo-text" :style="previewStyle">
      <div class="app-folder-photo-text__preview" aria-hidden="true">
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

      <div class="app-folder-photo-text__fields">
        <UiTextField
          v-if="isInstant"
          id="app-folder-photo-text-label"
          v-model="labelDraft"
          label="拍立得文字"
          :hint="`寫在相框下緣，最多 ${PHOTO_LABEL_MAX_LENGTH} 字。`"
          placeholder="例如：2024 夏・台北"
          :maxlength="PHOTO_LABEL_MAX_LENGTH"
          :disabled="saving"
          @keydown.enter="save"
        />
        <UiTextarea
          id="app-folder-photo-text-caption"
          v-model="captionDraft"
          class="app-folder-photo-text__caption"
          label="說明"
          fill
          resize="none"
          placeholder="展開照片時，以便條顯示在照片旁。"
          :rows="3"
          :maxlength="PHOTO_CAPTION_MAX_LENGTH"
          :disabled="saving"
        />
      </div>
    </div>

    <template #footer>
      <UiHint class="app-folder-photo-text__footnote">
        清空欄位即移除該段文字。
      </UiHint>
      <UiButton variant="secondary" :disabled="saving" @click="cancel">
        取消
      </UiButton>
      <UiButton
        variant="accent"
        :loading="saving"
        loading-label="儲存中"
        :disabled="saving || !changed"
        @click="save"
      >
        儲存
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

/* The print keeps its own shape; widths shrink so even instant film fits. */
.app-folder-photo-text__preview {
  --ui-folder-artifact-photo-width: 9rem;
  --ui-folder-artifact-photo-width-portrait: 5.5rem;
  --ui-folder-artifact-photo-width-square: 7rem;
  --ui-folder-artifact-photo-width-wide: 10rem;
  --ui-folder-artifact-photo-width-tall: 5.5rem;

  inline-size: var(--app-folder-photo-text-preview-size);
  block-size: var(--app-folder-photo-text-preview-size);
  display: grid;
  place-items: center;
  overflow: hidden;
  pointer-events: none;
}

.app-folder-photo-text__fields {
  min-inline-size: 0;
  min-block-size: var(--app-folder-photo-text-preview-size);
  display: grid;
  grid-template-rows: auto minmax(calc(var(--ui-field-height) * 2), 1fr);
  align-content: start;
  gap: var(--ui-modal-section-gap);
}

.app-folder-photo-text__fields:has(> :only-child) {
  grid-template-rows: minmax(calc(var(--ui-field-height) * 2), 1fr);
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
