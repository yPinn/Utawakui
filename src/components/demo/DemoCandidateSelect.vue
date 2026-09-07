<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useAttrs,
  useTemplateRef,
  watch,
} from 'vue';
import { ChevronDown } from '../../icons/index.js';
import { nativeControlAttrs } from '../ui/fieldAttrs.js';
import UiField from '../ui/UiField.vue';

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
const valueLaneRef = useTemplateRef('valueLane');
const valueTextRef = useTemplateRef('valueText');
const isValueOverflowing = shallowRef(false);
const showsPlaceholder = computed(
  () => Boolean(props.placeholder) && props.modelValue === '',
);
const selectedLabel = computed(() => {
  const selected = props.options.find(
    (option) => String(option.value) === String(props.modelValue),
  );
  if (selected) return String(selected.label ?? '');
  if (showsPlaceholder.value) return props.placeholder;
  return String(props.modelValue ?? '');
});
const valueTooltipId = computed(() => `${props.id}-value-tooltip`);

let resizeObserver;
let frameId = 0;

function measureValueOverflow() {
  if (typeof requestAnimationFrame !== 'function') return;
  cancelAnimationFrame(frameId);
  frameId = requestAnimationFrame(() => {
    const lane = valueLaneRef.value;
    const text = valueTextRef.value;
    if (!lane || !text) return;
    isValueOverflowing.value =
      Math.ceil(text.scrollWidth - lane.clientWidth) > 1;
  });
}

function mergeDescribedBy(describedBy) {
  return (
    [describedBy, isValueOverflowing.value ? valueTooltipId.value : '']
      .filter(Boolean)
      .join(' ') || undefined
  );
}

function updateValue(event) {
  const selected = props.options.find(
    (option) => String(option.value) === event.target.value,
  );
  emit('update:modelValue', selected ? selected.value : event.target.value);
}

function focus() {
  selectRef.value?.focus();
}

onMounted(() => {
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(measureValueOverflow);
    if (valueLaneRef.value) resizeObserver.observe(valueLaneRef.value);
  }
  measureValueOverflow();
  if (typeof document !== 'undefined') {
    document.fonts?.ready?.then(measureValueOverflow);
  }
});

onUnmounted(() => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
  resizeObserver?.disconnect();
});

watch(selectedLabel, async () => {
  await nextTick();
  measureValueOverflow();
});

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
      <div
        class="demo-candidate-select__control"
        :data-value-overflow="isValueOverflowing || undefined"
        :class="{
          'demo-select-control--placeholder': showsPlaceholder,
          'is-disabled': disabled,
        }"
      >
        <select
          v-bind="nativeControlAttrs(attrs)"
          :id="id"
          ref="select"
          class="demo-candidate-select__native"
          :value="modelValue"
          :required="required"
          :disabled="disabled"
          :aria-describedby="mergeDescribedBy(describedBy)"
          :aria-invalid="fieldInvalid || undefined"
          @change="updateValue"
        >
          <option v-if="placeholder" value="" disabled hidden>
            {{ placeholder }}
          </option>
          <option
            v-for="option in options"
            :key="String(option.value)"
            :value="option.value"
            :disabled="option.disabled"
          >
            {{ option.label }}
          </option>
        </select>
        <ChevronDown
          class="demo-candidate-select__indicator"
          :size="16"
          aria-hidden="true"
        />
        <span
          ref="valueLane"
          class="demo-candidate-select__value-measure"
          aria-hidden="true"
        >
          <span ref="valueText">{{ selectedLabel }}</span>
        </span>
        <span
          v-if="selectedLabel"
          :id="valueTooltipId"
          class="demo-candidate-select__value-tooltip"
          role="tooltip"
          :aria-hidden="!isValueOverflowing"
        >
          {{ selectedLabel }}
        </span>
      </div>
    </template>
  </UiField>
</template>

<style scoped>
.demo-candidate-select__control {
  position: relative;
  min-width: 0;
}

.demo-candidate-select__native {
  width: 100%;
  min-width: 0;
  min-height: var(--ui-field-height);
  padding: var(--ui-field-padding-block) var(--ui-field-padding-inline);
  padding-inline-end: 2.25rem;
  appearance: none;
  border: var(--ui-border-width) solid var(--ui-field-border);
  border-radius: var(--ui-field-radius);
  background: var(--ui-field-bg);
  color: var(--ui-field-fg);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-label);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    border-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.demo-candidate-select__value-measure {
  position: absolute;
  inset-block: 0;
  inset-inline-start: var(--ui-field-padding-inline);
  inset-inline-end: 2.25rem;
  display: flex;
  min-width: 0;
  align-items: center;
  overflow: hidden;
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-label);
  pointer-events: none;
  visibility: hidden;
  white-space: nowrap;
}

.demo-candidate-select__value-measure > span {
  flex: none;
}

.demo-candidate-select__value-tooltip {
  position: absolute;
  z-index: var(--ui-z-tooltip);
  inset-block-end: calc(100% + var(--ui-space-2));
  inset-inline: 0;
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface-raised);
  box-shadow: var(--ui-shadow-overlay);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  opacity: 0;
  overflow-wrap: anywhere;
  pointer-events: none;
  visibility: hidden;
  transition: opacity var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.demo-candidate-select__control[data-value-overflow='true']:hover
  .demo-candidate-select__value-tooltip,
.demo-candidate-select__control[data-value-overflow='true']:focus-within
  .demo-candidate-select__value-tooltip {
  opacity: 1;
  visibility: visible;
}

.demo-candidate-select__indicator {
  position: absolute;
  top: 50%;
  inset-inline-end: 0.75rem;
  color: var(--ui-field-fg);
  pointer-events: none;
  transform: translateY(-50%);
}

.demo-select-control--placeholder .demo-candidate-select__native {
  color: var(--ui-field-placeholder);
}

.demo-candidate-select__native option {
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-text);
}

.demo-candidate-select__native option:checked {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-text);
}

.demo-candidate-select__native option[disabled] {
  color: var(--ui-color-text-muted);
}

.demo-candidate-select__native option[value=''][disabled] {
  display: none;
}

.demo-candidate-select__native:hover:not(:disabled) {
  border-color: var(--ui-field-border-hover);
  background: var(--ui-field-bg-hover);
}

.demo-candidate-select__native:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.demo-candidate-select__native[aria-invalid='true'] {
  border-color: var(--ui-field-border-invalid);
}

.demo-candidate-select__native:disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.demo-candidate-select__control.is-disabled .demo-candidate-select__indicator {
  opacity: var(--ui-opacity-disabled);
}
</style>
