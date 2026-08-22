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
  <main class="performer-stage">
    <header class="performer-stage__track">
      <div class="performer-stage__track-copy">
        <strong>{{ frame.track?.title || 'Utawakui' }}</strong>
        <span v-if="frame.track?.artist">{{ frame.track.artist }}</span>
      </div>
      <div v-if="frame.track" class="performer-stage__adjustments">
        <span>{{ frame.keyLabel }}</span>
        <span>Tempo {{ frame.tempoLabel }}</span>
      </div>
    </header>

    <section class="performer-stage__lyrics" aria-live="polite">
      <p v-if="frame.mode !== 'live'" class="performer-stage__state">
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
          frame.mode === 'live' &&
          frame.readingExpected &&
          !frame.currentReading
        "
        class="performer-stage__reading-status"
      >
        無讀音資料
      </p>
    </section>

    <footer class="performer-stage__next">
      <span>下一首</span>
      <strong>{{ frame.nextTrack?.title || '未排定' }}</strong>
      <small v-if="frame.nextTrack?.artist">{{ frame.nextTrack.artist }}</small>
    </footer>
  </main>
</template>

<style scoped>
.performer-stage {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding: var(--ui-space-5) var(--ui-space-6);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--ui-color-surface) 72%, transparent),
      transparent 38%
    ),
    var(--ui-color-canvas);
}

.performer-stage__track,
.performer-stage__next {
  min-width: 0;
  display: flex;
  align-items: center;
}

.performer-stage__track {
  justify-content: space-between;
  gap: var(--ui-space-5);
}

.performer-stage__track-copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.performer-stage__track-copy strong,
.performer-stage__track-copy span,
.performer-stage__next strong,
.performer-stage__next small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.performer-stage__track-copy strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
}

.performer-stage__track-copy span,
.performer-stage__next small {
  color: var(--ui-color-text-muted);
}

.performer-stage__adjustments {
  flex: 0 0 auto;
  display: flex;
  gap: var(--ui-space-2);
}

.performer-stage__adjustments span {
  padding: var(--ui-space-1) var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.performer-stage__lyrics {
  min-width: 0;
  min-height: 0;
  align-self: center;
  display: grid;
  justify-items: center;
  gap: var(--ui-space-5);
  width: min(100%, 72rem);
  margin: 0 auto;
}

.performer-stage__state,
.performer-stage__reading-status {
  margin: 0;
  color: var(--ui-color-text-muted);
}

.performer-stage__state {
  font-size: var(--ui-font-size-lg);
}

.performer-stage__reading-status {
  font-size: var(--ui-font-size-sm);
}

.performer-stage__next {
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-4);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.performer-stage__next > span {
  flex: 0 0 auto;
  color: var(--ui-color-accent);
  font-size: var(--ui-font-size-sm);
  font-weight: 600;
}

.performer-stage__next strong {
  min-width: 0;
  color: var(--ui-color-text);
}

.performer-stage__next small {
  min-width: 0;
}

@media (max-width: 720px) {
  .performer-stage {
    padding: var(--ui-space-4);
  }

  .performer-stage__track {
    align-items: flex-start;
  }
}

@media (max-height: 400px) {
  .performer-stage {
    padding: var(--ui-space-3) var(--ui-space-4);
  }

  .performer-stage__lyrics {
    gap: var(--ui-space-2);
  }

  .performer-stage__next {
    padding-top: var(--ui-space-2);
  }
}
</style>
