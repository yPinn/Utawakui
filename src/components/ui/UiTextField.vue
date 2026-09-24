<script setup>
import { useAttrs, useTemplateRef } from 'vue';
import { nativeControlAttrs } from './fieldAttrs.js';
import UiField from './UiField.vue';

defineOptions({ inheritAttrs: false });

defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, default: '' },
  type: { type: String, default: 'text' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  placeholder: { type: String, default: '' },
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
const inputRef = useTemplateRef('input');

function focus() {
  inputRef.value?.focus();
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
      <input
        v-bind="nativeControlAttrs(attrs)"
        :id="id"
        ref="input"
        class="ui-text-field"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
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
.ui-text-field {
  width: 100%;
  min-width: 0;
  min-height: var(--ui-field-height);
  padding: var(--ui-field-padding-block) var(--ui-field-padding-inline);
  border: var(--ui-border-width) solid var(--ui-field-border);
  border-radius: var(--ui-field-radius);
  background: var(--ui-field-bg);
  color: var(--ui-field-fg);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-label);
  -webkit-user-select: text;
  user-select: text;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    border-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.ui-text-field:hover:not(:disabled) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

.ui-text-field::placeholder {
  color: var(--ui-field-placeholder);
}

.ui-text-field:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-text-field[aria-invalid='true'] {
  border-color: var(--ui-field-border-invalid);
}

.ui-text-field:disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}
</style>
