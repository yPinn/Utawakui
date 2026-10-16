<script setup>
import { computed } from 'vue';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { Pencil, Trash2 } from '../../icons/index.js';
import { contentLangAttribute } from '../../utils/contentLanguage.js';
import UiFolderArtifact from '../ui/UiFolderArtifact.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiPhotoFrame from '../ui/UiPhotoFrame.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  asset: { type: Object, default: null },
  removing: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'afterLeave', 'remove', 'editText']);
const confirmation = useAppConfirmation();

const captionTitle = computed(() => props.asset?.captionTitle ?? '');
const caption = computed(() => props.asset?.caption ?? '');
const hasCaption = computed(() => Boolean(captionTitle.value || caption.value));

async function requestRemoval() {
  if (!props.asset || props.removing) return;
  const confirmed = await confirmation.confirm({
    title: '從頁面移除照片？',
    message: '原始檔案會保留。',
    confirmLabel: '移除照片',
    intent: 'danger',
  });
  if (confirmed) emit('remove', props.asset.key);
}
</script>

<template>
  <UiModal
    :open="open"
    title="頁面照片"
    presentation="media"
    dismiss-on-backdrop
    :close-disabled="removing"
    :selectable="false"
    @close="emit('close')"
    @after-leave="emit('afterLeave')"
  >
    <template v-if="asset" #header-actions>
      <UiIconButton
        :icon="Pencil"
        label="編輯照片說明"
        variant="overlay"
        tooltip-placement="start"
        :disabled="removing"
        @click="emit('editText', asset.key)"
      />
      <UiIconButton
        :icon="Trash2"
        label="從頁面移除"
        variant="overlay"
        intent="danger"
        tooltip-placement="start"
        :disabled="removing"
        @click="requestRemoval"
      />
    </template>

    <div
      v-if="asset"
      class="folder-asset-preview"
      :class="{ 'folder-asset-preview--captioned': hasCaption }"
    >
      <UiPhotoFrame
        :src="asset.imageUrl"
        alt="展開的頁面照片"
        fit="contain"
        filtered
        intrinsic
        scaled
        :frame="asset.frame ?? 'print'"
        :ratio="asset.ratio ?? 'landscape'"
        :label="asset.label ?? ''"
        :label-lang="contentLangAttribute(asset.label ?? '')"
      />
      <!-- The caption note sits beside the print, like the action rail. -->
      <UiFolderArtifact
        v-if="hasCaption"
        class="folder-asset-preview__caption"
        kind="note"
        material="translucent"
        :paper="asset.captionPaper ?? 'canary'"
        :title="captionTitle"
        :title-lang="contentLangAttribute(captionTitle)"
        :body="caption"
        :lang="contentLangAttribute(caption)"
      />
    </div>
  </UiModal>
</template>

<style scoped>
.folder-asset-preview {
  display: grid;
  grid-auto-flow: column;
  align-items: start;
  justify-content: center;
  gap: var(--ui-space-4);
}

/* The note column comes out of the print's bounds, so the two never overlap. */
.folder-asset-preview--captioned {
  --ui-media-max-inline-size: calc(
    var(--ui-modal-media-max-inline-size) -
      var(--ui-folder-artifact-note-width) - var(--ui-space-4)
  );
}

/* A full note: title and body, scrolling inside when the body runs long. */
.folder-asset-preview__caption {
  --ui-folder-artifact-note-min-height: auto;

  max-block-size: var(--ui-media-max-block-size);
  overflow-y: auto;
}
</style>
