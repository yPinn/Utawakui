<script setup>
import { useAttrs, useTemplateRef } from 'vue';
import { nativeControlAttrs } from './fieldAttrs.js';
import UiField from './UiField.vue';

defineOptions({ inheritAttrs: false });

defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: [String, Number], default: '' },
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
  textRole: {
    type: String,
    default: 'input',
    validator: (value) => ['input', 'title'].includes(value),
  },
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
      <div class="ui-text-field__control-row">
        <input
          v-bind="nativeControlAttrs(attrs)"
          :id="id"
          ref="input"
          class="ui-field-surface ui-text-field"
          :class="`ui-text-field--${textRole}`"
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
        <slot name="action" />
      </div>
    </template>
  </UiField>
</template>

<style scoped>
.ui-text-field__control-row {
  min-inline-size: 0;
  max-inline-size: var(--ui-text-field-control-max-inline-size, none);
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.ui-text-field__control-row > .ui-text-field {
  flex: 1 1 0;
}
.ui-text-field__control-row :slotted(button) {
  flex: 0 0 auto;
}
.ui-text-field {
  width: 100%;
  min-width: 0;
  min-height: var(--ui-field-height);
  padding: var(--ui-field-padding-block) var(--ui-field-padding-inline);
  color: var(--ui-field-foreground);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-field-font-size);
  font-weight: var(--ui-field-font-weight);
  line-height: var(--ui-field-line-height);
  -webkit-user-select: text;
  user-select: text;
}

.ui-text-field--title {
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.ui-text-field::placeholder {
  color: var(--ui-field-placeholder);
}
</style>
