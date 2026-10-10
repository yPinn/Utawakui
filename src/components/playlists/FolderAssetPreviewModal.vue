<script setup>
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { Trash2 } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiPhotoFrame from '../ui/UiPhotoFrame.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  asset: { type: Object, default: null },
  removing: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'afterLeave', 'remove']);
const confirmation = useAppConfirmation();

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
        :icon="Trash2"
        label="從頁面移除"
        variant="overlay"
        intent="danger"
        tooltip-placement="start"
        :disabled="removing"
        @click="requestRemoval"
      />
    </template>

    <UiPhotoFrame
      v-if="asset"
      :src="asset.imageUrl"
      alt="展開的頁面照片"
      fit="contain"
      filtered
      intrinsic
    />
  </UiModal>
</template>
