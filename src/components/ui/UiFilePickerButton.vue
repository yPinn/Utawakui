<script setup>
import { useTemplateRef } from 'vue';
import UiButton from './UiButton.vue';

defineOptions({ inheritAttrs: false });
defineProps({ accept: { type: String, default: '' } });
const emit = defineEmits(['select']);
const picker = useTemplateRef('picker');

function selectFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (file) emit('select', file);
}
</script>

<template>
  <input
    ref="picker"
    type="file"
    :accept="accept"
    hidden
    @change="selectFile"
  />
  <UiButton v-bind="$attrs" type="button" @click="picker?.click()">
    <slot />
  </UiButton>
</template>
