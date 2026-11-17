<script setup>
import {
  ChevronDown,
  ChevronUp,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from '../icons/index.js';
import UiButtonGroup from '../components/ui/UiButtonGroup.vue';
import UiIconButton from '../components/ui/UiIconButton.vue';
import { t } from '../utils/i18n.js';

defineProps({
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['command']);

const groups = [
  {
    key: 'track',
    buttons: [
      ['player.previous', SkipBack, 'previous'],
      ['player.next', SkipForward, 'next'],
    ],
  },
  {
    key: 'key',
    buttons: [
      ['player.transpose-down', ChevronDown, 'keyDown'],
      ['player.transpose-up', ChevronUp, 'keyUp'],
    ],
  },
  {
    key: 'volume',
    buttons: [
      ['player.volume-down', Volume1, 'volumeDown'],
      ['player.volume-up', Volume2, 'volumeUp'],
      ['player.mute', VolumeX, 'mute'],
    ],
  },
];
</script>

<template>
  <div class="companion-remote-controls">
    <UiButtonGroup
      v-for="group in groups"
      :key="group.key"
      :label="t(`companion.remote.groups.${group.key}`)"
    >
      <UiIconButton
        v-for="[command, icon, label] in group.buttons"
        :key="command"
        :icon="icon"
        :label="t(`companion.remote.${label}`)"
        :disabled="disabled"
        @click="emit('command', command)"
      />
    </UiButtonGroup>
  </div>
</template>

<style scoped>
.companion-remote-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--ui-space-2);
}
</style>
