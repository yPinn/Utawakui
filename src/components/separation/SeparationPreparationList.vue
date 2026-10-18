<script setup>
import { AudioWaveform, BadgeCheck, RotateCcw } from '../../icons/index.js';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';

defineProps({
  unpreparedTracks: { type: Array, default: () => [] },
  preparedTracks: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(['startTrack', 'restartPrepared', 'navigate']);
</script>

<template>
  <div class="separation-preparation-list">
    <AppRightDockSection :heading="`尚未生成 · ${unpreparedTracks.length} 首`">
      <UiHint v-if="unpreparedTracks.length === 0">沒有尚未生成的曲目</UiHint>
      <ul v-else class="separation-preparation-list__items">
        <TrackIdentityRow
          v-for="track in unpreparedTracks"
          :key="track.id"
          class="right-dock-track"
          :track="track"
          navigation="artist"
          hide-duration
          overflow="ellipsis"
          thumb-loading="lazy"
          @navigate="emit('navigate', $event)"
        >
          <template #trail>
            <UiIconButton
              :icon="AudioWaveform"
              :label="`加入伴奏處理佇列：${track.title}`"
              :disabled="busy"
              @click.stop="emit('startTrack', track.id)"
              @dblclick.stop
            />
          </template>
        </TrackIdentityRow>
      </ul>
    </AppRightDockSection>

    <AppRightDockSection :heading="`已有伴奏 · ${preparedTracks.length} 首`">
      <template #trailing>
        <UiIconButton
          :icon="RotateCcw"
          label="重新準備已有伴奏"
          :disabled="busy || preparedTracks.length === 0"
          @click="emit('restartPrepared')"
        />
      </template>
      <UiHint v-if="preparedTracks.length === 0">沒有已有伴奏的曲目</UiHint>
      <ul v-else class="separation-preparation-list__items">
        <TrackIdentityRow
          v-for="track in preparedTracks"
          :key="track.id"
          class="right-dock-track"
          :track="track"
          navigation="artist"
          hide-duration
          overflow="ellipsis"
          thumb-loading="lazy"
          @navigate="emit('navigate', $event)"
        >
          <template #trail>
            <UiStatusIcon :icon="BadgeCheck" tone="muted" label="已有伴奏" />
          </template>
        </TrackIdentityRow>
      </ul>
    </AppRightDockSection>
  </div>
</template>

<style scoped>
.separation-preparation-list {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--ui-right-dock-section-gap);
}

.separation-preparation-list__items {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.separation-preparation-list :deep(.app-right-dock-section__header) {
  min-block-size: var(--ui-control-height);
}
</style>
