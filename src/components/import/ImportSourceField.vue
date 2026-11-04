<script setup>
import { useTemplateRef } from 'vue';
import { Search } from '../../icons/index.js';
import { useImportClipboardSuggestion } from '../../composables/import/useImportClipboardSuggestion.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiStack from '../ui/UiStack.vue';
import { t } from '../../utils/i18n.js';

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
        :label="t('import.sourceField.label')"
        :placeholder="t('import.sourceField.placeholder')"
        :disabled="busy"
        @focus="check"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <UiIconButton
        :icon="Search"
        :label="t('import.sourceField.search')"
        variant="accent"
        :disabled="!modelValue.trim() || busy"
        :aria-busy="resolving"
        @click="resolve"
      />
    </form>
    <div v-if="url" class="import-source-field__suggestion">
      <UiHint role="status">{{
        t('import.sourceField.clipboardDetected')
      }}</UiHint>
      <UiStack :gap="2" justify="end">
        <UiButton @click="skip">{{ t('import.sourceField.skip') }}</UiButton>
        <UiButton variant="accent" @click="paste">{{
          t('import.sourceField.paste')
        }}</UiButton>
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
