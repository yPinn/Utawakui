<script setup>
import { computed } from 'vue';
import { Grid2X2, Moon, Sun } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import { t } from '../../utils/i18n.js';

// Default first, then its contrast, then the transparency check.
const PREVIEW_BACKDROPS = Object.freeze([
  { id: 'dark', label: t('outputPanel.backdrop.dark'), icon: Moon },
  { id: 'light', label: t('outputPanel.backdrop.light'), icon: Sun },
  { id: 'checker', label: t('outputPanel.backdrop.checker'), icon: Grid2X2 },
]);

const props = defineProps({
  modelValue: { type: String, default: 'dark' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const currentIndex = computed(() =>
  Math.max(
    0,
    PREVIEW_BACKDROPS.findIndex((option) => option.id === props.modelValue),
  ),
);
const current = computed(() => PREVIEW_BACKDROPS[currentIndex.value]);
const next = computed(
  () => PREVIEW_BACKDROPS[(currentIndex.value + 1) % PREVIEW_BACKDROPS.length],
);
const label = computed(() =>
  t('outputPanel.backdrop.toggle', {
    current: current.value.label,
    next: next.value.label,
  }),
);
</script>

<template>
  <UiIconButton
    :icon="current.icon"
    :disabled="disabled"
    :label="label"
    :data-backdrop="current.id"
    @click="emit('update:modelValue', next.id)"
  />
</template>
