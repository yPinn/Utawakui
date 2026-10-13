<script setup>
import { BadgeCheck, RotateCcw } from '../../icons/index.js';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';

defineProps({
  unpreparedTracks: { type: Array, default: () => [] },
  preparedTracks: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(['restartPrepared', 'navigate']);
</script>

<template>
  <div class="separation-preparation-list">
    <AppRightDockSection v-if="unpreparedTracks.length > 0" heading="尚未準備">
      <ul class="separation-preparation-list__items">
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
        />
      </ul>
    </AppRightDockSection>

    <AppRightDockSection v-if="preparedTracks.length > 0" heading="已有伴奏">
      <template #trailing>
        <UiIconButton
          :icon="RotateCcw"
          label="重新準備已有伴奏"
          :disabled="busy"
          @click="emit('restartPrepared')"
        />
      </template>
      <ul class="separation-preparation-list__items">
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
  gap: var(--ui-right-dock-section-gap);
}

.separation-preparation-list__items {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
