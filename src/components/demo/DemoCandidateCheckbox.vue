<script setup>
import { useTemplateRef } from 'vue';
import UiCheckbox from '../ui/UiCheckbox.vue';

defineOptions({ inheritAttrs: false });
const checkbox = useTemplateRef('checkbox');
defineExpose({ focus: () => checkbox.value?.focus() });
</script>

<template>
  <UiCheckbox v-bind="$attrs" ref="checkbox" class="demo-candidate-checkbox" />
</template>
