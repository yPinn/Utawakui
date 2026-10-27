<script setup>
import { computed, ref } from 'vue';
import UiPopover from '../ui/UiPopover.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import { Repeat } from '../../icons/index.js';
import { useAppRightDockWidth } from '../../composables/useAppRightDockWidth.js';
import { usePlayerPractice } from '../../composables/usePlayerPractice.js';
import { usePlayer } from '../../composables/usePlayer.js';
import LyricsLoopControls from './LyricsLoopControls.vue';
const props = defineProps({ contextTrackId: { type: String, default: '' } });
const owner = usePlayerPractice(),
  player = usePlayer();
const practice = computed(() => ({
  ...owner.state,
  canEnable: owner.canEnable.value,
  running: owner.running.value,
  unavailableReason:
    props.contextTrackId !== player.state.track?.id
      ? '請先播放這首曲目。'
      : owner.unavailableReason.value,
}));
function action(value) {
  if (practice.value.unavailableReason) return;
  if (value.kind === 'clear') owner.clear();
  else if (value.kind === 'capture') owner.capture(value.point);
  else if (value.kind === 'point') owner.setPoint(value.point, value.value);
  else if (value.kind === 'gap') owner.setGap(value.value);
  else if (value.kind === 'toggle') void owner.toggle();
}
const open = ref(false);
const { width } = useAppRightDockWidth();
const panelStyle = computed(() => ({ inlineSize: `${width.value}px` }));
</script>
<template>
  <span class="player-practice-loop">
    <UiPopover
      v-model:open="open"
      aria-label="片段練習"
      placement="bottom-end"
      :close-on-scroll="false"
      :panel-style="panelStyle"
      focus-on-open
    >
      <template #trigger="{ triggerProps }"
        ><UiIconButton
          v-bind="triggerProps"
          :icon="Repeat"
          label="片段練習"
          :active="open || practice.enabled"
          :disabled="Boolean(practice.unavailableReason)"
          :title="practice.unavailableReason || '片段練習：選一段反覆練唱'"
          @click="open = !open"
      /></template>
      <template #header>
        <strong>片段練習</strong>
      </template>
      <LyricsLoopControls :practice="practice" @action="action" />
    </UiPopover>
  </span>
</template>
<style scoped>
.player-practice-loop {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
</style>
