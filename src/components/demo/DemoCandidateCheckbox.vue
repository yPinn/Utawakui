<script setup>
import { computed, useAttrs, useTemplateRef } from 'vue';
import { Check, Minus } from '../../icons/index.js';
import { nativeControlAttrs } from '../ui/fieldAttrs.js';
import UiField from '../ui/UiField.vue';

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
const ariaChecked = computed(() => (props.indeterminate ? 'mixed' : undefined));

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
    class="demo-candidate-checkbox"
    inline
  >
    <template #default="{ describedBy, invalid: fieldInvalid }">
      <span class="demo-candidate-checkbox__control">
        <input
          v-bind="nativeControlAttrs(attrs)"
          :id="id"
          ref="checkbox"
          class="demo-candidate-checkbox__native"
          type="checkbox"
          :checked="modelValue"
          :indeterminate="indeterminate"
          :required="required"
          :disabled="disabled"
          :aria-checked="ariaChecked"
          :aria-describedby="describedBy"
          :aria-invalid="fieldInvalid || undefined"
          @change="emit('update:modelValue', $event.target.checked)"
        />
        <span class="demo-candidate-checkbox__indicator" aria-hidden="true">
          <Minus v-if="indeterminate" :size="12" />
          <Check v-else-if="modelValue" :size="12" />
        </span>
      </span>
    </template>
  </UiField>
</template>

<style scoped>
.demo-candidate-checkbox {
  --demo-checkbox-resolved-target-size: var(
    --demo-checkbox-target-size,
    var(--ui-control-height)
  );
}

.demo-candidate-checkbox.has-hidden-label {
  width: var(--demo-checkbox-resolved-target-size);
  max-width: var(--demo-checkbox-resolved-target-size);
  flex: 0 0 var(--demo-checkbox-resolved-target-size);
}

.demo-candidate-checkbox.has-hidden-label :deep(.ui-field__main) {
  grid-template-columns: minmax(0, 1fr);
}

.demo-candidate-checkbox.has-hidden-label :deep(.ui-field__control) {
  width: 100%;
}

.demo-candidate-checkbox :deep(.ui-field__main) {
  position: relative;
  min-height: var(--demo-checkbox-resolved-target-size);
  align-items: start;
}

.demo-candidate-checkbox :deep(.ui-field__label--inline) {
  box-sizing: border-box;
  min-width: 0;
  padding-block: max(
    0px,
    calc((var(--demo-checkbox-resolved-target-size) - 1lh) / 2)
  );
  overflow-wrap: anywhere;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}

.demo-candidate-checkbox__control {
  display: grid;
  width: var(--ui-checkbox-size);
  height: var(--ui-checkbox-size);
  margin-block-start: calc(
    (var(--demo-checkbox-resolved-target-size) - var(--ui-checkbox-size)) / 2
  );
  place-items: center;
}

.demo-candidate-checkbox.has-hidden-label .demo-candidate-checkbox__control {
  margin-inline: auto;
}

.demo-candidate-checkbox__native {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.demo-candidate-checkbox__indicator {
  box-sizing: border-box;
  display: grid;
  width: var(--ui-checkbox-size);
  height: var(--ui-checkbox-size);
  place-items: center;
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-on-accent);
  pointer-events: none;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    border-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.demo-candidate-checkbox__native:hover:not(:disabled)
  + .demo-candidate-checkbox__indicator {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-surface-hover);
}

.demo-candidate-checkbox__native:checked + .demo-candidate-checkbox__indicator,
.demo-candidate-checkbox__native[aria-checked='mixed']
  + .demo-candidate-checkbox__indicator {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-accent);
}

.demo-candidate-checkbox__native:focus-visible
  + .demo-candidate-checkbox__indicator {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-candidate-checkbox__native[aria-invalid='true']
  + .demo-candidate-checkbox__indicator {
  border-color: var(--ui-color-danger);
}

.demo-candidate-checkbox.is-disabled :deep(.ui-field__main) {
  opacity: var(--ui-opacity-disabled);
}

.demo-candidate-checkbox.is-disabled :deep(.ui-field__label--inline),
.demo-candidate-checkbox__native:disabled {
  cursor: not-allowed;
}
</style>
