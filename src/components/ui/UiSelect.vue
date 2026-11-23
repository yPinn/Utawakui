<script setup>
import { useAttrs, useTemplateRef } from 'vue';
import { ChevronDown, ICON_SIZE } from '../../icons/index.js';
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
  labelInline: { type: Boolean, default: false },
  fitContent: { type: Boolean, default: false },
  align: {
    type: String,
    default: 'start',
    validator: (value) => ['start', 'end'].includes(value),
  },
});

const emit = defineEmits(['update:modelValue']);
const attrs = useAttrs();
const selectRef = useTemplateRef('select');

function isOptionGroup(option) {
  return Array.isArray(option?.options);
}

function selectableOptions() {
  return props.options.flatMap((option) =>
    isOptionGroup(option) ? option.options : [option],
  );
}

function updateValue(event) {
  const selected = selectableOptions().find(
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
    :label-inline="labelInline"
  >
    <template #default="{ describedBy, invalid: fieldInvalid }">
      <span
        class="ui-select__control"
        :class="{
          'ui-select__control--fit-content': fitContent,
          'ui-select__control--align-end': align === 'end',
        }"
      >
        <select
          v-bind="nativeControlAttrs(attrs)"
          :id="id"
          ref="select"
          class="ui-field-surface ui-select"
          :value="modelValue"
          :required="required"
          :disabled="disabled"
          :aria-describedby="describedBy"
          :aria-invalid="fieldInvalid || undefined"
          @change="updateValue"
        >
          <option v-if="placeholder" value="" disabled>
            {{ placeholder }}
          </option>
          <template
            v-for="entry in options"
            :key="
              isOptionGroup(entry)
                ? `group:${entry.label}`
                : `option:${entry.value}`
            "
          >
            <optgroup
              v-if="isOptionGroup(entry)"
              :label="entry.label"
              :disabled="entry.disabled"
            >
              <option
                v-for="option in entry.options"
                :key="String(option.value)"
                :value="option.value"
                :disabled="entry.disabled || option.disabled"
              >
                {{ option.label }}
              </option>
            </optgroup>
            <option v-else :value="entry.value" :disabled="entry.disabled">
              {{ entry.label }}
            </option>
          </template>
        </select>
        <ChevronDown
          class="ui-select__indicator"
          :size="ICON_SIZE"
          aria-hidden="true"
        />
      </span>
    </template>
  </UiField>
</template>

<style scoped>
.ui-select__control {
  position: relative;
  display: block;
  min-width: 0;
}

.ui-select__control--fit-content {
  inline-size: fit-content;
  max-inline-size: 100%;
}

.ui-select__control--align-end {
  margin-inline-start: auto;
}

.ui-select {
  appearance: none;
  width: 100%;
  min-width: 0;
  min-height: var(--ui-field-height);
  padding: var(--ui-field-padding-block) var(--ui-field-padding-inline);
  padding-inline-end: calc(
    var(--ui-field-padding-inline) + var(--ui-space-4) + var(--ui-space-2)
  );
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-field-foreground);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-field-font-size);
  font-weight: var(--ui-field-font-weight);
  line-height: var(--ui-field-line-height);
}

.ui-select__indicator {
  position: absolute;
  top: 50%;
  inset-inline-end: var(--ui-field-padding-inline);
  color: var(--ui-field-foreground);
  pointer-events: none;
  transform: translateY(-50%);
}

.ui-select:disabled + .ui-select__indicator {
  opacity: var(--ui-opacity-disabled);
}

/* Native popups otherwise reuse the select's transient hover background.
   Keep their resting surface stable; the platform owns option highlighting. */
.ui-select option,
.ui-select optgroup {
  background-color: var(--ui-floating-list-background);
}
</style>
