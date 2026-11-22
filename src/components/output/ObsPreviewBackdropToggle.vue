<script setup>
import { computed } from 'vue';
import { Grid2X2, Moon, Sun } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import { t } from '../../utils/i18n.js';

const CHECKER_BACKDROP = {
  id: 'checker',
  label: t('outputPanel.backdrop.checker'),
  icon: Grid2X2,
};
const GALLERY_BACKDROPS = Object.freeze([
  { id: 'dark', label: t('outputPanel.backdrop.dark'), icon: Moon },
  { id: 'light', label: t('outputPanel.backdrop.light'), icon: Sun },
  CHECKER_BACKDROP,
]);
const WORKBENCH_BACKDROPS = Object.freeze([
  CHECKER_BACKDROP,
  { id: 'white', label: t('outputPanel.backdrop.white'), icon: Sun },
  { id: 'black', label: t('outputPanel.backdrop.black'), icon: Moon },
]);

const props = defineProps({
  modelValue: { type: String, default: null },
  workbench: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const backdrops = computed(() =>
  props.workbench ? WORKBENCH_BACKDROPS : GALLERY_BACKDROPS,
);
const currentIndex = computed(() =>
  Math.max(
    0,
    backdrops.value.findIndex((option) => option.id === props.modelValue),
  ),
);
const current = computed(() => backdrops.value[currentIndex.value]);
const next = computed(
  () => backdrops.value[(currentIndex.value + 1) % backdrops.value.length],
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
