<script setup>
import { computed } from 'vue';
import { OUTPUT_LOOK_PRESETS } from '../../../shared/outputAppearance.mjs';
import UiCombobox from '../ui/UiCombobox.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: String, required: true },
  options: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
const alphabet = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});
const items = computed(() => {
  const groups = { basic: [], film: [] };
  for (const option of props.options) {
    const { colors, section = 'basic' } = OUTPUT_LOOK_PRESETS[option.id] ?? {};
    groups[section].push({
      ...option,
      value: option.id,
      swatches: colors && {
        '--ui-output-look-preview-ink': colors.ink,
        '--ui-output-look-preview-paper': colors.paper,
        '--ui-output-look-preview-accent': colors.current,
      },
    });
  }
  return Object.entries(groups)
    .filter(([, options]) => options.length > 0)
    .map(([section, options]) => {
      const sortKey = (option) => {
        if (option.id === 'original') return '';
        return section === 'basic' ? option.id : option.label;
      };
      return {
        label: t(`outputPanel.lookGroups.${section}`),
        options: options.sort((left, right) =>
          alphabet.compare(sortKey(left), sortKey(right)),
        ),
      };
    });
});
const displayedValue = computed(
  () =>
    props.options.find(
      (option) => option.id === props.modelValue && !option.disabled,
    )?.id ??
    items.value
      .flatMap(({ options }) => options)
      .find((option) => !option.disabled)?.id ??
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
    :placeholder="t('outputPanel.field.chooseLook')"
    @update:model-value="updateValue"
  >
    <template #value="{ item, placeholder }">
      <span class="obs-look-select__choice">
        <span
          v-if="item"
          class="obs-look-select__preview"
          :data-look="item.id"
          :style="item.swatches"
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
  --ui-output-look-preview-ink: var(--ui-output-look-original-ink);
  --ui-output-look-preview-paper: var(--ui-output-look-original-paper);
  --ui-output-look-preview-accent: var(--ui-output-look-original-accent);
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

.obs-look-select__label {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
