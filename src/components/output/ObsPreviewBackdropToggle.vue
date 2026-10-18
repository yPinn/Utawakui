<script setup>
import { computed } from 'vue';
import { Grid2X2, Moon, Sun } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';

// Default first, then its contrast, then the transparency check.
const PREVIEW_BACKDROPS = Object.freeze([
  { id: 'dark', label: '暗色背景', icon: Moon },
  { id: 'light', label: '亮色背景', icon: Sun },
  { id: 'checker', label: '透明背景', icon: Grid2X2 },
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
const label = computed(
  () => `預覽背景：${current.value.label}，切換為${next.value.label}`,
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
