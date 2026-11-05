<script setup>
import { t } from '../../utils/i18n.js';
import { shallowRef, watch } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiTextField from '../ui/UiTextField.vue';

// Folder rename. A blank draft keeps the current name.
const props = defineProps({
  open: { type: Boolean, default: false },
  name: { type: String, default: '' },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'save']);

const draft = shallowRef('');

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) draft.value = props.name;
  },
  { immediate: true },
);

function save() {
  if (props.saving) return;
  emit('save', draft.value.trim() || props.name);
}

function cancel() {
  if (props.saving) return;
  emit('close');
}
</script>

<template>
  <UiModal
    :open="open"
    :title="t('playlist.folder.renameTitle')"
    size="notice"
    :close-disabled="saving"
    @close="cancel"
  >
    <UiTextField
      id="playlist-folder-name"
      v-model="draft"
      :label="t('playlist.folder.name')"
      label-hidden
      :maxlength="200"
      :disabled="saving"
      @keydown.enter="save"
    />
    <template #footer>
      <UiButton variant="secondary" :disabled="saving" @click="cancel">
        {{ t('playlist.details.cancel') }}
      </UiButton>
      <UiButton
        variant="accent"
        :loading="saving"
        :loading-label="t('playlist.details.saving')"
        :disabled="saving"
        @click="save"
      >
        {{ t('playlist.details.save') }}
      </UiButton>
    </template>
  </UiModal>
</template>
