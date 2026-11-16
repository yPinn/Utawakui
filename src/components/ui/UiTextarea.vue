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
  fill: { type: Boolean, default: false },
  resize: {
    type: String,
    default: 'vertical',
    validator: (value) => ['vertical', 'none', 'content'].includes(value),
  },
  // 'bare' drops the field surface so the text sits on its host material.
  variant: {
    type: String,
    default: 'field',
    validator: (value) => ['field', 'bare'].includes(value),
  },
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
    :class="[attrs.class, { 'ui-textarea-field--fill': fill }]"
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
        class="ui-field-surface ui-textarea"
        :class="{
          'ui-textarea--bare': variant === 'bare',
          'ui-textarea--fill': fill,
          'ui-textarea--resize-none': resize !== 'vertical',
          'ui-textarea--resize-content': resize === 'content',
        }"
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
  color: var(--ui-field-foreground);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-textarea-font-size);
  font-weight: var(--ui-textarea-font-weight);
  line-height: var(--ui-textarea-line-height);
  -webkit-user-select: text;
  user-select: text;
}

.ui-textarea::placeholder {
  color: var(--ui-field-placeholder);
}

.ui-textarea-field--fill,
.ui-textarea-field--fill :deep(.ui-field__main),
.ui-textarea-field--fill :deep(.ui-field__control),
.ui-textarea--fill {
  min-block-size: 0;
  block-size: var(--ui-textarea-fill-block-size, 100%);
}

.ui-textarea--resize-none {
  resize: none;
}

.ui-textarea--resize-content {
  field-sizing: content;
  min-block-size: var(--ui-field-height);
  max-block-size: 8lh;
}

.ui-textarea--bare {
  --_ui-field-surface-background: transparent;
  --_ui-field-surface-border: transparent;

  min-height: 0;
  padding: 0;
  resize: none;
  color: inherit;
  font-size: inherit;
}
</style>
