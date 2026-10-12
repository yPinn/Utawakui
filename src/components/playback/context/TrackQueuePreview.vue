<script setup>
import { computed, shallowRef, useTemplateRef } from 'vue';
import AppRightDockSection from '../../layout/AppRightDockSection.vue';
import QueueTrackButton from '../../queue/QueueTrackButton.vue';
import UiButton from '../../ui/UiButton.vue';
import TrackContextActions from './TrackContextActions.vue';

const props = defineProps({
  tracks: { type: Array, required: true },
  queuedTrackIds: { type: Array, default: () => [] },
  playingTrackId: { type: String, default: '' },
  playerPlaying: { type: Boolean, default: false },
});

const emit = defineEmits(['open', 'togglePlayback', 'navigateArtist']);

const nextTrackActions = useTemplateRef('nextTrackActions');
const menuOpen = shallowRef(false);
const nextTrack = computed(() => props.tracks[0] ?? null);
const nextTrackContext = computed(() =>
  props.queuedTrackIds.includes(nextTrack.value?.id) ? 'queued' : 'source',
);
const listLabel = computed(() =>
  nextTrack.value ? `下一首：${nextTrack.value.title}` : '沒有下一首',
);

function openTrackActions(payload) {
  nextTrackActions.value?.open(payload?.event);
}
</script>

<template>
  <AppRightDockSection
    class="track-queue-preview"
    heading="下一首"
    appearance="contained"
  >
    <template #trailing>
      <UiButton variant="ghost" @click="emit('open')">開啟佇列</UiButton>
    </template>

    <ol class="track-queue-preview__list" :aria-label="listLabel">
      <QueueTrackButton
        v-if="nextTrack"
        :key="nextTrack.id"
        class="studio-context-inspector__queue-item"
        :track="nextTrack"
        :interactive="false"
        :menu-open="menuOpen"
        :playing="playerPlaying && playingTrackId === nextTrack.id"
        @toggle-playback="emit('togglePlayback', $event)"
        @navigate-artist="emit('navigateArtist', $event)"
        @open-menu="openTrackActions"
      >
        <template #trail>
          <TrackContextActions
            ref="nextTrackActions"
            :track="nextTrack"
            :context="nextTrackContext"
            trigger="row"
            @open-change="menuOpen = $event"
          />
        </template>
      </QueueTrackButton>
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
