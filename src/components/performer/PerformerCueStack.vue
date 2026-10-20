<script setup>
import PerformerLyricCue from './PerformerLyricCue.vue';

defineProps({
  frame: { type: Object, required: true },
});

const modeMessages = {
  idle: '尚未播放曲目',
  'no-lyrics': '目前曲目沒有可顯示的歌詞',
  unsynced: '目前歌詞沒有時間軸',
  waiting: '等待下一句',
};
</script>

<template>
  <section class="performer-cue-stack" aria-live="polite">
    <p v-if="frame.mode !== 'live'" class="performer-cue-stack__state">
      {{ modeMessages[frame.mode] }}
    </p>
    <PerformerLyricCue
      :line="frame.currentLine"
      :reading="frame.currentReading"
      current
    />
    <PerformerLyricCue :line="frame.nextLine" :reading="frame.nextReading" />
    <p
      v-if="
        frame.mode === 'live' && frame.readingExpected && !frame.currentReading
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
