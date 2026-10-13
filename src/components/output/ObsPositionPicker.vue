<script setup>
import { computed, nextTick, useTemplateRef } from 'vue';

const POSITION_CHOICES = Object.freeze([
  { id: 'top-left', label: '左上' },
  { id: 'top-center', label: '中上' },
  { id: 'top-right', label: '右上' },
  { id: 'center-left', label: '左中' },
  { id: 'center', label: '正中' },
  { id: 'center-right', label: '右中' },
  { id: 'bottom-left', label: '左下' },
  { id: 'bottom-center', label: '中下' },
  { id: 'bottom-right', label: '右下' },
]);

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, required: true },
  options: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue']);
const optionRefs = useTemplateRef('options');
const choices = computed(() => {
  const available = new Map(props.options.map((option) => [option.id, option]));
  return POSITION_CHOICES.map((choice) => ({
    ...choice,
    ...available.get(choice.id),
    disabled: !available.has(choice.id) || available.get(choice.id)?.disabled,
  }));
});
const enabledChoices = computed(() =>
  choices.value.filter((choice) => !choice.disabled),
);
const focusId = computed(() =>
  enabledChoices.value.some((choice) => choice.id === props.modelValue)
    ? props.modelValue
    : enabledChoices.value[0]?.id,
);
const selectedLabel = computed(
  () =>
    choices.value.find((choice) => choice.id === props.modelValue)?.label ?? '',
);

function select(choice) {
  if (choice.disabled || choice.id === props.modelValue) return;
  emit('update:modelValue', choice.id);
}

function moveFocus(choice, event) {
  const keys = [
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'Home',
    'End',
  ];
  if (!keys.includes(event.key)) return;

  const currentIndex = choices.value.findIndex(
    (candidate) => candidate.id === choice.id,
  );
  const lastIndex = choices.value.length - 1;
  const rowStart = Math.floor(currentIndex / 3) * 3;
  const rowEnd = rowStart + 2;
  let targetIndex = currentIndex;

  if (event.key === 'Home') {
    targetIndex = choices.value.findIndex((candidate) => !candidate.disabled);
  } else if (event.key === 'End') {
    targetIndex = choices.value.findLastIndex(
      (candidate) => !candidate.disabled,
    );
  } else if (event.key === 'ArrowLeft') {
    targetIndex = Math.max(rowStart, currentIndex - 1);
  } else if (event.key === 'ArrowRight') {
    targetIndex = Math.min(rowEnd, currentIndex + 1);
  } else if (event.key === 'ArrowUp') {
    targetIndex = Math.max(0, currentIndex - 3);
  } else if (event.key === 'ArrowDown') {
    targetIndex = Math.min(lastIndex, currentIndex + 3);
  }

  const target = choices.value[targetIndex];
  if (!target || target.disabled || targetIndex === currentIndex) return;
  event.preventDefault();
  event.stopPropagation();
  select(target);
  nextTick(() => optionRefs.value?.[targetIndex]?.focus());
}
</script>

<template>
  <div class="obs-position-picker">
    <div
      :id="id"
      class="obs-position-picker__grid"
      role="radiogroup"
      :aria-label="label"
    >
      <button
        v-for="choice in choices"
        :key="choice.id"
        ref="options"
        type="button"
        class="obs-position-picker__option"
        :class="{
          'obs-position-picker__option--selected': choice.id === modelValue,
          'obs-position-picker__option--unavailable': choice.disabled,
        }"
        role="radio"
        :aria-label="choice.label"
        :aria-checked="choice.id === modelValue"
        :aria-disabled="choice.disabled || undefined"
        :disabled="choice.disabled"
        :tabindex="choice.id === focusId ? 0 : -1"
        @click="select(choice)"
        @keydown="moveFocus(choice, $event)"
      >
        <span class="obs-position-picker__dot" aria-hidden="true" />
      </button>
    </div>
    <output class="obs-position-picker__value" :for="id">
      {{ selectedLabel }}
    </output>
  </div>
</template>

<style scoped>
.obs-position-picker {
  min-width: 0;
  inline-size: fit-content;
  max-inline-size: 100%;
  display: grid;
  justify-items: center;
  gap: var(--ui-space-1);
}

.obs-position-picker__grid {
  inline-size: fit-content;
  max-inline-size: 100%;
  display: grid;
  grid-template-columns: repeat(3, var(--ui-control-height));
  gap: var(--ui-space-1);
  padding: var(--ui-space-1);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-canvas);
}

.obs-position-picker__option {
  inline-size: var(--ui-control-height);
  block-size: var(--ui-control-height);
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--ui-radius-xs);
  background: transparent;
  color: var(--ui-color-text-muted);
  cursor: pointer;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    color var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard);
}

.obs-position-picker__option:hover:not(:disabled) {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.obs-position-picker__option:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.obs-position-picker__option--selected {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-accent);
}

.obs-position-picker__option--unavailable {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.obs-position-picker__dot {
  inline-size: var(--ui-space-2);
  block-size: var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: currentColor;
}

.obs-position-picker__value {
  min-width: 0;
  inline-size: 100%;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
  text-align: center;
}
</style>
