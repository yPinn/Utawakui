<script setup>
import { useAttrs, useTemplateRef } from 'vue';
import { nativeControlAttrs } from './fieldAttrs.js';
import UiField from './UiField.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  labelHidden: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);
const attrs = useAttrs();
const selectRef = useTemplateRef('select');

function updateValue(event) {
  const selected = props.options.find(
    (option) => String(option.value) === event.target.value,
  );
  emit('update:modelValue', selected ? selected.value : event.target.value);
}

function focus() {
  selectRef.value?.focus();
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
      <select
        v-bind="nativeControlAttrs(attrs)"
        :id="id"
        ref="select"
        class="ui-select"
        :value="modelValue"
        :required="required"
        :disabled="disabled"
        :aria-describedby="describedBy"
        :aria-invalid="fieldInvalid || undefined"
        @change="updateValue"
      >
        <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
        <option
          v-for="option in options"
          :key="String(option.value)"
          :value="option.value"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </option>
      </select>
    </template>
  </UiField>
</template>

<style scoped>
.ui-select {
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
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    border-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.ui-select:hover:not(:disabled) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

.ui-select:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-select[aria-invalid='true'] {
  border-color: var(--ui-field-border-invalid);
}

.ui-select:disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}
</style>
