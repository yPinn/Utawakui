<script setup>
import { Pause, Play } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  playing: { type: Boolean, default: false },
  fill: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  playLabel: { type: String, default: () => t('player.primary.play') },
  pauseLabel: { type: String, default: () => t('player.primary.pause') },
});

defineEmits(['click']);
</script>

<template>
  <UiIconButton
    :icon="playing ? Pause : Play"
    :disabled="disabled"
    :fill="fill"
    :label="playing ? pauseLabel : playLabel"
    shape="circle"
    size="lg"
    variant="accent"
    @click="$emit('click', $event)"
  />
</template>
