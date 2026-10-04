<script setup>
import { useAttrs, useTemplateRef } from 'vue';
import { Check, Minus } from '../../icons/index.js';
import { nativeControlAttrs } from './fieldAttrs.js';
import UiField from './UiField.vue';

defineOptions({ inheritAttrs: false });

defineProps({
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

function focus() {
  checkboxRef.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <UiField
    :id="id"
    :class="[
      attrs.class,
      { 'is-disabled': disabled, 'has-hidden-label': labelHidden },
    ]"
    :style="attrs.style"
    :label="label"
    :hint="hint"
    :error="error"
    :described-by="attrs['aria-describedby']"
    :required="required"
    :invalid="invalid"
    :label-hidden="labelHidden"
    class="ui-checkbox-field"
    inline
  >
    <template #default="{ describedBy, invalid: fieldInvalid }">
      <span class="ui-checkbox__control">
        <input
          v-bind="nativeControlAttrs(attrs)"
          :id="id"
          ref="checkbox"
          class="ui-checkbox ui-checkbox__native"
          type="checkbox"
          :checked="modelValue"
          :indeterminate="indeterminate"
          :required="required"
          :disabled="disabled"
          :aria-checked="indeterminate ? 'mixed' : undefined"
          :aria-label="attrs['aria-label'] || (labelHidden ? label : undefined)"
          :aria-describedby="describedBy"
          :aria-invalid="fieldInvalid || undefined"
          @change="emit('update:modelValue', $event.target.checked)"
        />
        <span class="ui-checkbox__indicator" aria-hidden="true">
          <Minus v-if="indeterminate" :size="12" />
          <Check v-else-if="modelValue" :size="12" />
        </span>
      </span>
    </template>
  </UiField>
</template>

<style scoped>
.ui-checkbox-field {
  --ui-checkbox-resolved-target-size: var(--ui-control-height);
}

.ui-checkbox-field.has-hidden-label {
  width: var(--ui-checkbox-resolved-target-size);
  max-width: var(--ui-checkbox-resolved-target-size);
  flex: 0 0 var(--ui-checkbox-resolved-target-size);
}

.ui-checkbox-field.has-hidden-label :deep(.ui-field__main) {
  grid-template-columns: minmax(0, 1fr);
}

.ui-checkbox-field.has-hidden-label :deep(.ui-field__control) {
  width: 100%;
}

.ui-checkbox-field :deep(.ui-field__main) {
  position: relative;
  min-height: var(--ui-checkbox-resolved-target-size);
  align-items: start;
}

.ui-checkbox-field :deep(.ui-field__label--inline) {
  box-sizing: border-box;
  min-width: 0;
  padding-block: max(
    var(--ui-space-0),
    calc((var(--ui-checkbox-resolved-target-size) - 1lh) / 2)
  );
  overflow-wrap: anywhere;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}

.ui-checkbox__control {
  display: grid;
  width: var(--ui-checkbox-size);
  height: var(--ui-checkbox-size);
  margin-block-start: calc(
    (var(--ui-checkbox-resolved-target-size) - var(--ui-checkbox-size)) / 2
  );
  place-items: center;
}

.ui-checkbox-field.has-hidden-label .ui-checkbox__control {
  margin-inline: auto;
}

.ui-checkbox__native {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.ui-checkbox__indicator {
  box-sizing: border-box;
  display: grid;
  width: var(--ui-checkbox-size);
  height: var(--ui-checkbox-size);
  place-items: center;
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-accent-contrast);
  pointer-events: none;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    border-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.ui-checkbox__native:hover:not(:disabled) + .ui-checkbox__indicator {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-surface-hover);
}

.ui-checkbox__native:checked + .ui-checkbox__indicator,
.ui-checkbox__native[aria-checked='mixed'] + .ui-checkbox__indicator {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-accent);
}

.ui-checkbox__native:focus-visible + .ui-checkbox__indicator {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-checkbox__native[aria-invalid='true'] + .ui-checkbox__indicator {
  border-color: var(--ui-color-danger);
}

.ui-checkbox-field.is-disabled :deep(.ui-field__main) {
  opacity: var(--ui-opacity-disabled);
}

.ui-checkbox-field.is-disabled :deep(.ui-field__label--inline),
.ui-checkbox__native:disabled {
  cursor: not-allowed;
}
</style>
