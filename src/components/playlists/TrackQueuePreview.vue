<script setup>
import { computed } from 'vue';
import { formatDuration } from '../../utils/format.js';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import UiButton from '../ui/UiButton.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

const props = defineProps({
  tracks: { type: Array, required: true },
});

const emit = defineEmits(['open']);

const PREVIEW_LIMIT = 3;
const previewTracks = computed(() => props.tracks.slice(0, PREVIEW_LIMIT));
const listLabel = computed(() =>
  props.tracks.length > PREVIEW_LIMIT
    ? `接下來的播放佇列，顯示前 ${PREVIEW_LIMIT} 首，共 ${props.tracks.length} 首`
    : `接下來的播放佇列，共 ${props.tracks.length} 首`,
);

function trackMetadata(track) {
  const artist = track.artist || '未知演唱者';
  if (!Number.isFinite(track.duration)) return artist;
  return `${artist} · ${formatDuration(track.duration)}`;
}
</script>

<template>
  <AppRightDockSection
    class="track-queue-preview"
    heading="接下來"
    appearance="contained"
  >
    <template #trailing>
      <UiButton variant="ghost" @click="emit('open')">開啟佇列</UiButton>
    </template>

    <ol class="track-queue-preview__list" :aria-label="listLabel">
      <UiTrackRow
        v-for="(track, index) in previewTracks"
        :key="track.id ?? `${track.title}-${index}`"
        class="studio-context-inspector__queue-item"
        :track="track"
        :artist="trackMetadata(track)"
        hide-duration
        overflow="ellipsis"
        thumb-loading="lazy"
        thumb-decoding="async"
      />
    </ol>
  </AppRightDockSection>
</template>

<style scoped>
.track-queue-preview,
.track-queue-preview__list {
  min-inline-size: 0;
}

.track-queue-preview__list {
  display: grid;
  gap: var(--ui-track-list-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.track-queue-preview__list :deep(.ui-track__info) {
  -webkit-user-select: none;
  user-select: none;
}
</style>
