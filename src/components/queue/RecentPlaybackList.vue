<script setup>
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiButton from '../ui/UiButton.vue';
import QueueTrackButton from './QueueTrackButton.vue';

defineProps({
  entries: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  selectedEntryKey: { type: String, default: null },
  currentTrackId: { type: String, default: null },
});

const emit = defineEmits(['selectEntry', 'activateEntry', 'clear']);
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
    <div v-if="entries.length > 0" class="recent-playback__toolbar">
      <UiButton aria-label="清除最近播放紀錄" @click="emit('clear')">
        清除
      </UiButton>
    </div>
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
        @select="emit('selectEntry', entry)"
        @activate="emit('activateEntry', entry)"
      />
    </ul>
  </div>
</template>

<style scoped>
.recent-playback {
  display: grid;
  gap: var(--ui-space-2);
}

.recent-playback__toolbar {
  display: flex;
  justify-content: flex-end;
}

.recent-playback__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
}

.recent-playback__item {
  content-visibility: auto;
  contain-intrinsic-block-size: var(--ui-track-row-min-height);
}
</style>
