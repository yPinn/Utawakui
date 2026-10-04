<script setup>
import { Pause, Play } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';

defineProps({
  playing: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  playLabel: { type: String, default: '播放' },
  pauseLabel: { type: String, default: '暫停' },
});

defineEmits(['click']);
</script>

<template>
  <UiIconButton
    :icon="playing ? Pause : Play"
    :disabled="disabled"
    :label="playing ? pauseLabel : playLabel"
    shape="circle"
    size="lg"
    variant="accent"
    @click="$emit('click', $event)"
  />
</template>
