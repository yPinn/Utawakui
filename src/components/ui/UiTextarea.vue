<script setup>
import { useAttrs, useTemplateRef } from 'vue';
import { nativeControlAttrs } from './fieldAttrs.js';
import UiField from './UiField.vue';

defineOptions({ inheritAttrs: false });

defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  rows: { type: Number, default: 3 },
  maxlength: { type: Number, default: undefined },
  autocomplete: { type: String, default: 'off' },
  dir: { type: String, default: 'auto' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  labelHidden: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);
const attrs = useAttrs();
const textareaRef = useTemplateRef('textarea');

function focus() {
  textareaRef.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <UiField
    :id="id"
    :class="attrs.class"
    :style="attrs.style"
    :label="label"
    :hint="hint"
    :error="error"
    :described-by="attrs['aria-describedby']"
    :required="required"
    :invalid="invalid"
    :label-hidden="labelHidden"
  >
    <template #default="{ describedBy, invalid: fieldInvalid }">
      <textarea
        v-bind="nativeControlAttrs(attrs)"
        :id="id"
        ref="textarea"
        class="ui-textarea"
        :value="modelValue"
        :placeholder="placeholder"
        :rows="rows"
        :maxlength="maxlength"
        :autocomplete="autocomplete"
        :dir="dir"
        :required="required"
        :disabled="disabled"
        :aria-describedby="describedBy"
        :aria-invalid="fieldInvalid || undefined"
        @input="emit('update:modelValue', $event.target.value)"
      />
    </template>
  </UiField>
</template>

<style scoped>
.ui-textarea {
  width: 100%;
  min-width: 0;
  min-height: calc(var(--ui-field-height) * 2);
  padding: var(--ui-field-padding-block) var(--ui-field-padding-inline);
  resize: vertical;
  border: var(--ui-border-width) solid var(--ui-field-border);
  border-radius: var(--ui-field-radius);
  background: var(--ui-field-bg);
  color: var(--ui-field-fg);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-body);
  -webkit-user-select: text;
  user-select: text;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    border-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.ui-textarea:hover:not(:disabled) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

.ui-textarea::placeholder {
  color: var(--ui-field-placeholder);
}

.ui-textarea:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-textarea[aria-invalid='true'] {
  border-color: var(--ui-field-border-invalid);
}

.ui-textarea:disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}
</style>
