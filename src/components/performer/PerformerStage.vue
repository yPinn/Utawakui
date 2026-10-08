<script setup>
import PerformerSurface from './PerformerSurface.vue';

defineProps({
  frame: { type: Object, required: true },
});
</script>

<template>
  <PerformerSurface :frame="frame" mode="prompter" reading-scale="desk" />
</template>
