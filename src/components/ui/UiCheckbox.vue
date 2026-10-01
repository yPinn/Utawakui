<script setup>
import { useAttrs, useTemplateRef, watchEffect } from 'vue';
import { nativeControlAttrs } from './fieldAttrs.js';
import UiField from './UiField.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: Boolean, default: false },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  indeterminate: { type: Boolean, default: false },
  labelHidden: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);
const attrs = useAttrs();
const checkboxRef = useTemplateRef('checkbox');

watchEffect(() => {
  if (checkboxRef.value) {
    checkboxRef.value.indeterminate = props.indeterminate;
  }
});

function focus() {
  checkboxRef.value?.focus();
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
    inline
  >
    <template #default="{ describedBy, invalid: fieldInvalid }">
      <input
        v-bind="nativeControlAttrs(attrs)"
        :id="id"
        ref="checkbox"
        class="ui-checkbox"
        type="checkbox"
        :checked="modelValue"
        :aria-checked="indeterminate ? 'mixed' : undefined"
        :aria-label="attrs['aria-label'] || (labelHidden ? label : undefined)"
        :required="required"
        :disabled="disabled"
        :aria-describedby="describedBy"
        :aria-invalid="fieldInvalid || undefined"
        @change="emit('update:modelValue', $event.target.checked)"
      />
    </template>
  </UiField>
</template>

<style scoped>
.ui-checkbox {
  width: var(--ui-checkbox-size);
  height: var(--ui-checkbox-size);
  margin: 0;
  accent-color: var(--ui-color-accent);
  cursor: pointer;
}

.ui-checkbox:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-checkbox:disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}
</style>
