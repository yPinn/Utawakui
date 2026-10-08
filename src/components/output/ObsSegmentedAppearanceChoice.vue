<script setup>
import { computed } from 'vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  editor: {
    type: String,
    required: true,
    validator: (value) => ['alignment', 'font-scale'].includes(value),
  },
  modelValue: { type: String, required: true },
  options: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue']);
const items = computed(() =>
  props.options.map((option) => ({
    id: option.id,
    label: option.label,
    disabled: option.disabled,
  })),
);
</script>

<template>
  <UiSegmentedControl
    :id="id"
    class="obs-segmented-appearance-choice"
    :data-editor="editor"
    :items="items"
    :model-value="modelValue"
    :aria-label="label"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #label="{ item }">
      <span
        v-if="editor === 'alignment'"
        class="obs-segmented-appearance-choice__alignment"
        :data-alignment="item.id"
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
      </span>
      <span
        v-else
        class="obs-segmented-appearance-choice__scale"
        :data-scale="item.id"
      >
        {{ item.label }}
      </span>
      <span v-if="editor === 'alignment'" class="ui-visually-hidden">
        {{ item.label }}
      </span>
    </template>
  </UiSegmentedControl>
</template>

<style scoped>
.obs-segmented-appearance-choice {
  inline-size: 100%;
}

.obs-segmented-appearance-choice :deep(.ui-segmented-control__option) {
  flex: 1 1 0;
  padding-inline: var(--ui-space-2);
}

.obs-segmented-appearance-choice__scale[data-scale='small'] {
  font-size: var(--ui-font-size-sm);
}

.obs-segmented-appearance-choice__scale[data-scale='medium'] {
  font-size: var(--ui-font-size-md);
}

.obs-segmented-appearance-choice__scale[data-scale='large'] {
  font-size: var(--ui-font-size-lg);
}

.obs-segmented-appearance-choice__alignment {
  inline-size: 1rem;
  display: grid;
  gap: 0.125rem;
}

.obs-segmented-appearance-choice__alignment > span {
  block-size: var(--ui-border-width);
  inline-size: 100%;
  display: block;
  background: currentColor;
}

.obs-segmented-appearance-choice__alignment > span:nth-child(2) {
  inline-size: 68%;
}

.obs-segmented-appearance-choice__alignment[data-alignment='center']
  > span:nth-child(2) {
  justify-self: center;
}

.obs-segmented-appearance-choice__alignment[data-alignment='right']
  > span:nth-child(2) {
  justify-self: end;
}
</style>
