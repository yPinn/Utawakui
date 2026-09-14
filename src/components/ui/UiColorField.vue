<script setup>
import { computed, ref, useAttrs, useTemplateRef, watch } from 'vue';
import { nativeControlAttrs } from './fieldAttrs.js';
import UiField from './UiField.vue';

defineOptions({ inheritAttrs: false });

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const DEFAULT_COLOR_VALUE = '#000000';

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, default: '#000000' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  invalidMessage: {
    type: String,
    default: '請輸入 #RRGGBB 六位色碼',
  },
  placeholder: { type: String, default: '#RRGGBB' },
  autocomplete: { type: String, default: 'off' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  labelHidden: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'commit']);
const attrs = useAttrs();
const inputRef = useTemplateRef('input');
const draft = ref(String(props.modelValue));

const validDraft = computed(() => HEX_COLOR_PATTERN.test(draft.value));
const fieldError = computed(
  () => props.error || (validDraft.value ? '' : props.invalidMessage),
);
const fieldInvalid = computed(
  () => props.invalid || !validDraft.value || Boolean(fieldError.value),
);
const pickerValue = computed(() => {
  if (validDraft.value) return draft.value;
  const modelValue = String(props.modelValue);
  return HEX_COLOR_PATTERN.test(modelValue) ? modelValue : DEFAULT_COLOR_VALUE;
});
const pickerLabel = computed(() => `${props.label}色票`);

watch(
  () => props.modelValue,
  (value) => {
    draft.value = String(value);
  },
);

function updateText(event) {
  draft.value = event.target.value;
  if (validDraft.value) emit('update:modelValue', draft.value);
}

function commitText(event) {
  draft.value = event.target.value;
  if (validDraft.value) emit('commit', draft.value);
}

function updatePicker(event) {
  draft.value = event.target.value;
  if (validDraft.value) emit('update:modelValue', draft.value);
}

function commitPicker(event) {
  draft.value = event.target.value;
  if (validDraft.value) emit('commit', draft.value);
}

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
    :error="fieldError"
    :described-by="attrs['aria-describedby']"
    :required="required"
    :invalid="fieldInvalid"
    :label-hidden="labelHidden"
  >
    <template #default="{ describedBy, invalid: controlInvalid }">
      <div class="ui-color-field">
        <input
          class="ui-color-field__picker"
          type="color"
          :value="pickerValue"
          :disabled="disabled"
          :aria-label="pickerLabel"
          :aria-describedby="describedBy"
          @input="updatePicker"
          @change="commitPicker"
        />
        <input
          v-bind="nativeControlAttrs(attrs)"
          :id="id"
          ref="input"
          class="ui-color-field__input"
          type="text"
          :value="draft"
          :placeholder="placeholder"
          :autocomplete="autocomplete"
          :maxlength="7"
          pattern="#[0-9A-Fa-f]{6}"
          dir="ltr"
          spellcheck="false"
          :required="required"
          :disabled="disabled"
          :aria-describedby="describedBy"
          :aria-invalid="controlInvalid || undefined"
          @input="updateText"
          @change="commitText"
        />
      </div>
    </template>
  </UiField>
</template>

<style scoped>
.ui-color-field {
  min-width: 0;
  min-height: var(--ui-field-height);
  inline-size: 100%;
  max-inline-size: calc(
    var(--ui-control-height) + var(--ui-space-2) +
      var(--ui-field-hex-value-inline-size)
  );
  display: grid;
  grid-template-columns: var(--ui-control-height) minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-2);
}

.ui-color-field__picker,
.ui-color-field__input {
  min-width: 0;
  min-height: var(--ui-field-height);
  border: var(--ui-border-width) solid var(--ui-field-border);
  border-radius: var(--ui-field-radius);
  background: var(--ui-field-bg);
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    border-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.ui-color-field__picker {
  inline-size: var(--ui-control-height);
  block-size: var(--ui-control-height);
  padding: var(--ui-space-1);
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}

.ui-color-field__picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.ui-color-field__picker::-webkit-color-swatch {
  border: 0;
  border-radius: var(--ui-radius-xs);
}

.ui-color-field__input {
  inline-size: 100%;
  padding: var(--ui-field-padding-block) var(--ui-field-padding-inline);
  color: var(--ui-field-fg);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-label);
  -webkit-user-select: text;
  user-select: text;
}

.ui-color-field__picker:hover:not(:disabled),
.ui-color-field__input:hover:not(:disabled) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

.ui-color-field__input::placeholder {
  color: var(--ui-field-placeholder);
}

.ui-color-field__picker:focus-visible,
.ui-color-field__input:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-color-field__input[aria-invalid='true'] {
  border-color: var(--ui-field-border-invalid);
}

.ui-color-field__picker:disabled,
.ui-color-field__input:disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}
</style>
