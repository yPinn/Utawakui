<script setup>
defineProps({
  frame: { type: Object, required: true },
});

const statusLabels = {
  buffering: '緩衝中',
  ended: '已結束',
  error: '播放異常',
  paused: '已暫停',
  playing: '播放中',
  seeking: '定位中',
};
</script>

<template>
  <header class="performer-track-context">
    <div class="performer-track-context__copy">
      <strong>{{ frame.track?.title || 'Utawakui' }}</strong>
      <span v-if="frame.track?.artist">{{ frame.track.artist }}</span>
    </div>
    <div v-if="frame.track" class="performer-track-context__status">
      <span class="performer-track-context__playback">
        <span
          class="performer-track-context__playback-indicator"
          aria-hidden="true"
        />
        {{ statusLabels[frame.playbackStatus] || '待命' }}
      </span>
      <span>{{ frame.keyLabel }}</span>
      <span>Tempo {{ frame.tempoLabel }}</span>
    </div>
  </header>
</template>

<style scoped>
.performer-track-context {
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-direction: column;
  gap: var(--ui-space-2);
}

.performer-track-context__copy {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

.performer-track-context__copy strong,
.performer-track-context__copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.performer-track-context__copy strong {
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.performer-track-context__copy span {
  color: var(--ui-performer-secondary-foreground);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.performer-track-context__status {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: var(--ui-space-3);
  color: var(--ui-performer-secondary-foreground);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  font-variant-numeric: tabular-nums;
}

.performer-track-context__status span {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.performer-track-context__status .performer-track-context__playback {
  color: var(--ui-color-text-muted);
}

.performer-track-context__playback-indicator {
  width: var(--ui-status-dot-size);
  height: var(--ui-status-dot-size);
  flex: 0 0 0.375rem;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-accent);
}

@container performer-surface (min-width: 40rem) {
  .performer-track-context {
    align-items: center;
    flex-direction: row;
    gap: var(--ui-space-4);
  }

  .performer-track-context__status {
    justify-content: flex-end;
  }
}
</style>
