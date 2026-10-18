<script setup>
import { useTemplateRef } from 'vue';
import { Search } from '../../icons/index.js';
import { useImportClipboardSuggestion } from '../../composables/import/useImportClipboardSuggestion.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiStack from '../ui/UiStack.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  active: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  resolving: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue', 'resolve']);
const field = useTemplateRef('field');
const { url, check, dismiss, accept } = useImportClipboardSuggestion({
  eligible: () => props.active && !props.busy && !props.modelValue.trim(),
  setInput: (value) => emit('update:modelValue', value),
});

function paste() {
  if (accept()) field.value?.focus();
}

function skip() {
  dismiss();
  field.value?.focus();
}

function resolve() {
  if (!props.busy && props.modelValue.trim()) emit('resolve');
}
</script>

<template>
  <div class="import-source-field">
    <form class="import-source-field__form" @submit.prevent="resolve">
      <UiSearchBox
        ref="field"
        :model-value="modelValue"
        label="歌曲名稱或外部來源連結"
        placeholder="搜尋歌名、歌手或貼上連結"
        :disabled="busy"
        @focus="check"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <UiIconButton
        :icon="Search"
        label="搜尋外部來源"
        variant="accent"
        :disabled="!modelValue.trim() || busy"
        :aria-busy="resolving"
        @click="resolve"
      />
    </form>
    <div v-if="url" class="import-source-field__suggestion">
      <UiHint role="status">偵測到剪貼簿有支援的來源連結</UiHint>
      <UiStack :gap="2" justify="end">
        <UiButton @click="skip">略過</UiButton>
        <UiButton variant="accent" @click="paste">貼上連結</UiButton>
      </UiStack>
    </div>
  </div>
</template>

<style scoped>
.import-source-field,
.import-source-field__suggestion {
  display: grid;
  min-width: 0;
  gap: var(--ui-space-2);
}

.import-source-field__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
}
</style>
