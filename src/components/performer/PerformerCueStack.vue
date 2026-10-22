<script setup>
import { computed, useTemplateRef } from 'vue';
import { usePerformerLyricsFit } from '../../composables/usePerformerLyricsFit.js';
import PerformerLyricCue from './PerformerLyricCue.vue';

const props = defineProps({
  frame: { type: Object, required: true },
  readingScale: { type: String, default: 'desk' },
});
const emit = defineEmits(['display-boundary']);
const host = useTemplateRef('host');
const display = usePerformerLyricsFit(
  computed(() => props.frame),
  host,
  (delay) => emit('display-boundary', delay),
  { version: () => props.readingScale },
);
const fittedFrame = computed(() => display.frame.value);

const modeMessages = {
  idle: '尚未播放曲目',
  'no-lyrics': '目前曲目沒有可顯示的歌詞',
  unsynced: '目前歌詞沒有時間軸',
  waiting: '等待下一句',
};
</script>

<template>
  <section ref="host" class="performer-cue-stack" aria-live="polite">
    <p v-if="fittedFrame.mode !== 'live'" class="performer-cue-stack__state">
      {{ modeMessages[fittedFrame.mode] }}
    </p>
    <PerformerLyricCue
      :line="fittedFrame.currentLine"
      :reading="fittedFrame.currentReading"
      current
    />
    <PerformerLyricCue
      :line="fittedFrame.nextLine"
      :reading="fittedFrame.nextReading"
    />
    <p
      v-if="display.plan.value?.status === 'unfit'"
      class="performer-cue-stack__reading-status"
    >
      請放大視窗或調整閱讀距離，以完整顯示此句。
    </p>
    <p
      v-if="
        fittedFrame.mode === 'live' &&
        fittedFrame.readingExpected &&
        !fittedFrame.currentReading
      "
      class="performer-cue-stack__reading-status"
    >
      無讀音資料
    </p>
  </section>
</template>

<style scoped>
.performer-cue-stack {
  min-width: 0;
  display: grid;
  justify-items: center;
  gap: var(--ui-performer-cue-gap);
  width: min(100%, var(--ui-performer-lyrics-max-width));
  margin: auto;
}

.performer-cue-stack__state,
.performer-cue-stack__reading-status {
  margin: 0;
  color: var(--ui-performer-secondary-foreground);
}

.performer-cue-stack__state {
  font-size: var(--ui-font-size-lg);
}

.performer-cue-stack__reading-status {
  font-size: var(--ui-font-size-sm);
}
</style>
