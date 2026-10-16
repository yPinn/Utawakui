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

const caption = computed(() => props.asset?.caption ?? '');

async function requestRemoval() {
  if (!props.asset || props.removing) return;
  const confirmed = await confirmation.confirm({
    title: '移除這張照片？',
    message: '照片會從此頁面移除，原始檔案仍會保留。',
    confirmLabel: '移除',
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
        label="編輯照片文字"
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

    <div v-if="asset" class="folder-asset-preview">
      <UiPhotoFrame
        :src="asset.imageUrl"
        alt="展開的頁面照片"
        fit="contain"
        filtered
        intrinsic
        :frame="asset.frame ?? 'print'"
        :label="asset.label ?? ''"
        :label-lang="contentLangAttribute(asset.label ?? '')"
      />
      <!-- The caption is a small note tucked over the print's lower corner. -->
      <UiFolderArtifact
        v-if="caption"
        class="folder-asset-preview__caption"
        kind="note"
        material="translucent"
        :paper="asset.captionPaper ?? 'canary'"
        :body="caption"
        :lang="contentLangAttribute(caption)"
      />
    </div>
  </UiModal>
</template>

<style scoped>
.folder-asset-preview {
  position: relative;
  display: grid;
  justify-items: center;
}

/* Only about a quarter of the note rests on the print's corner. */
.folder-asset-preview__caption {
  --ui-folder-artifact-note-width: var(--ui-folder-artifact-note-width-compact);
  --ui-folder-artifact-note-min-height: auto;

  position: absolute;
  inset-inline-end: calc(var(--ui-folder-artifact-note-width-compact) * -0.75);
  inset-block-end: calc(var(--ui-space-6) * -1);
  transform: rotate(3deg);
  pointer-events: none;
}
</style>
