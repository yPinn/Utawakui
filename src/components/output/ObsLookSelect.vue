<script setup>
import { computed } from 'vue';
import UiCombobox from '../ui/UiCombobox.vue';

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, required: true },
  options: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
const items = computed(() =>
  props.options.map((option) => ({ ...option, value: option.id })),
);
const displayedValue = computed(
  () =>
    props.options.find(
      (option) => option.id === props.modelValue && !option.disabled,
    )?.id ??
    props.options.find((option) => !option.disabled)?.id ??
    '',
);
function updateValue(value) {
  if (value !== props.modelValue) emit('update:modelValue', value);
}
</script>

<template>
  <UiCombobox
    :id="id"
    :label="label"
    :aria-label="label"
    :model-value="displayedValue"
    :items="items"
    :disabled="disabled"
    :editable="false"
    label-hidden
    placeholder="選擇配色風格"
    @update:model-value="updateValue"
  >
    <template #value="{ item, placeholder }">
      <span class="obs-look-select__choice">
        <span
          v-if="item"
          class="obs-look-select__preview"
          :data-look="item.id"
          aria-hidden="true"
        >
          <span class="obs-look-select__swatch--ink" />
          <span class="obs-look-select__swatch--paper" />
          <span class="obs-look-select__swatch--accent" />
        </span>
        <span class="obs-look-select__label">{{
          item?.label ?? placeholder
        }}</span>
      </span>
    </template>
    <template #option="{ item }">
      <span class="obs-look-select__choice">
        <span
          class="obs-look-select__preview"
          :data-look="item.id"
          aria-hidden="true"
        >
          <span class="obs-look-select__swatch--ink" />
          <span class="obs-look-select__swatch--paper" />
          <span class="obs-look-select__swatch--accent" />
        </span>
        <span class="obs-look-select__label">{{ item.label }}</span>
      </span>
    </template>
  </UiCombobox>
</template>

<style scoped>
.obs-look-select__choice {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-2);
}

.obs-look-select__preview {
  inline-size: 2.25rem;
  block-size: 0.75rem;
  overflow: hidden;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-xs);
}

.obs-look-select__swatch--ink {
  background: var(--ui-output-look-preview-ink);
}

.obs-look-select__swatch--paper {
  background: var(--ui-output-look-preview-paper);
}

.obs-look-select__swatch--accent {
  background: var(--ui-output-look-preview-accent);
}

.obs-look-select__preview[data-look='original'] {
  --ui-output-look-preview-ink: var(--ui-output-look-original-ink);
  --ui-output-look-preview-paper: var(--ui-output-look-original-paper);
  --ui-output-look-preview-accent: var(--ui-output-look-original-accent);
}

.obs-look-select__preview[data-look='warm'] {
  --ui-output-look-preview-ink: var(--ui-output-look-warm-ink);
  --ui-output-look-preview-paper: var(--ui-output-look-warm-paper);
  --ui-output-look-preview-accent: var(--ui-output-look-warm-accent);
}

.obs-look-select__preview[data-look='cool'] {
  --ui-output-look-preview-ink: var(--ui-output-look-cool-ink);
  --ui-output-look-preview-paper: var(--ui-output-look-cool-paper);
  --ui-output-look-preview-accent: var(--ui-output-look-cool-accent);
}

.obs-look-select__preview[data-look='monochrome'] {
  --ui-output-look-preview-ink: var(--ui-output-look-monochrome-ink);
  --ui-output-look-preview-paper: var(--ui-output-look-monochrome-paper);
  --ui-output-look-preview-accent: var(--ui-output-look-monochrome-accent);
}

.obs-look-select__preview[data-look='high-contrast'] {
  --ui-output-look-preview-ink: var(--ui-output-look-contrast-ink);
  --ui-output-look-preview-paper: var(--ui-output-look-contrast-paper);
  --ui-output-look-preview-accent: var(--ui-output-look-contrast-accent);
}

.obs-look-select__label {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
