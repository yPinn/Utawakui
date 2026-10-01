<script setup>
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import QueueTrackButton from './QueueTrackButton.vue';

const props = defineProps({
  entries: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  currentTrackId: { type: String, default: null },
  playingTrackId: { type: String, default: null },
  playerPlaying: { type: Boolean, default: false },
  openMenuKey: { type: String, default: '' },
  selectedEntryKey: { type: String, default: null },
});

const emit = defineEmits([
  'selectEntry',
  'activateEntry',
  'toggleEntryPlayback',
  'openTrackMenu',
]);

function isEntryPlaying(entry) {
  return props.playerPlaying && entry.track.id === props.playingTrackId;
}

function openTrackMenu(entry, payload) {
  emit('openTrackMenu', {
    track: entry.track,
    event: payload.event,
    context: 'recent',
    key: `recent:${entry.key}`,
  });
}
</script>

<template>
  <div class="recent-playback">
    <UiNotice
      v-if="error"
      compact
      tone="warning"
      title="最近播放未更新"
      :message="error"
    />
    <UiHint v-if="loading">讀取最近播放…</UiHint>
    <UiHint v-else-if="entries.length === 0">尚無最近播放紀錄</UiHint>
    <ul v-else class="recent-playback__list">
      <QueueTrackButton
        v-for="entry in entries"
        :key="entry.key"
        class="recent-playback__item"
        :track="entry.track"
        :active="entry.key === selectedEntryKey"
        :current="entry.track.id === currentTrackId"
        :draggable="false"
        :menu-open="openMenuKey === `recent:${entry.key}`"
        :playing="isEntryPlaying(entry)"
        @select="emit('selectEntry', entry)"
        @activate="emit('activateEntry', entry)"
        @toggle-playback="emit('toggleEntryPlayback', entry)"
        @open-menu="openTrackMenu(entry, $event)"
      />
    </ul>
  </div>
</template>

<style scoped>
.recent-playback {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.recent-playback__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-inline-size: 0;
  margin: 0;
  padding: 0;
}

.recent-playback__item {
  inline-size: 100%;
  min-inline-size: 0;
  max-inline-size: 100%;
  box-sizing: border-box;
  content-visibility: auto;
  contain-intrinsic-block-size: var(--ui-track-row-min-height);
}
</style>
