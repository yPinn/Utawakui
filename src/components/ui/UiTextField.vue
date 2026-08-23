<script setup>
import { useTemplateRef } from 'vue';

defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  maxlength: { type: Number, default: undefined },
  autocomplete: { type: String, default: 'off' },
  dir: { type: String, default: 'auto' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);
const inputRef = useTemplateRef('input');

function focus() {
  inputRef.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <label class="ui-text-field" :for="id">
    <span class="ui-text-field__label">{{ label }}</span>
    <input
      :id="id"
      ref="input"
      class="ui-text-field__control"
      :class="{ 'ui-text-field__control--invalid': invalid }"
      type="text"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :autocomplete="autocomplete"
      :dir="dir"
      :required="required"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      @input="emit('update:modelValue', $event.target.value)"
    />
  </label>
</template>

<style scoped>
.ui-text-field {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.ui-text-field__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.ui-text-field__control {
  width: 100%;
  min-width: 0;
  min-height: var(--ui-control-height);
  padding: var(--ui-space-1) var(--ui-space-2);
  border: 0;
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-label);
  -webkit-user-select: text;
  user-select: text;
  transition: background-color var(--ui-motion-fast) var(--ui-motion-ease);
}

.ui-text-field__control:hover:not(:disabled) {
  background: var(--ui-color-surface-active);
}

.ui-text-field__control::placeholder {
  color: var(--ui-color-text-muted);
}

.ui-text-field__control:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-text-field__control--invalid {
  box-shadow: inset 0 0 0 var(--ui-border-width) var(--ui-color-danger);
}

.ui-text-field__control:disabled {
  opacity: var(--ui-opacity-disabled);
}
</style>
