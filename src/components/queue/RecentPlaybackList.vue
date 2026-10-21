<script setup>
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
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
  busy: { type: Boolean, default: false },
  playbackActions: { type: Boolean, default: true },
  menuContext: { type: String, default: 'recent' },
  emptyMessage: { type: String, default: '尚無最近播放紀錄' },
  loadingMessage: { type: String, default: '讀取最近播放…' },
  errorTitle: { type: String, default: '最近播放未更新' },
});

const emit = defineEmits([
  'selectEntry',
  'activateEntry',
  'toggleEntryPlayback',
  'artistNavigate',
  'openTrackMenu',
]);

function isEntryPlaying(entry) {
  return props.playerPlaying && entry.track.id === props.playingTrackId;
}

function openTrackMenu(entry, payload) {
  emit('openTrackMenu', {
    track: entry.track,
    event: payload.event,
    context: props.menuContext,
    key: `${props.menuContext}:${entry.key}`,
    entry,
  });
}
</script>

<template>
  <div class="recent-playback" :aria-busy="loading || undefined">
    <UiNotice
      v-if="error"
      compact
      tone="warning"
      :title="errorTitle"
      :message="error"
    />
    <UiSkeleton
      v-if="loading && !error && entries.length === 0"
      :lines="2"
      :aria-label="loadingMessage"
    />
    <UiHint v-else-if="!loading && !error && entries.length === 0">{{
      emptyMessage
    }}</UiHint>
    <ul v-else-if="entries.length" class="recent-playback__list">
      <QueueTrackButton
        v-for="entry in entries"
        :key="entry.key"
        class="recent-playback__item"
        :track="entry.track"
        :ordinal="entry.ordinal"
        :ordinal-label="entry.ordinalLabel"
        :active="entry.key === selectedEntryKey"
        :current="entry.track.id === currentTrackId"
        :draggable="false"
        :menu-open="openMenuKey === `${menuContext}:${entry.key}`"
        :playing="isEntryPlaying(entry)"
        :artist-text="entry.artistText"
        :playback-disabled="busy || entry.playbackDisabled === true"
        :playback-actions="playbackActions"
        :playback-label="entry.playbackLabel"
        @select="emit('selectEntry', entry)"
        @activate="playbackActions && emit('activateEntry', entry)"
        @toggle-playback="playbackActions && emit('toggleEntryPlayback', entry)"
        @navigate-artist="emit('artistNavigate', $event)"
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
}
</style>
