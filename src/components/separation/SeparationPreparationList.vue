<script setup>
import { MicAudioLines, BadgeCheck, RotateCcw } from '../../icons/index.js';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  unpreparedTracks: { type: Array, default: () => [] },
  preparedTracks: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(['startTrack', 'restartPrepared', 'navigate']);
</script>

<template>
  <div class="separation-preparation-list">
    <AppRightDockSection
      :heading="t('prep.list.unprepared', { count: unpreparedTracks.length })"
    >
      <UiHint v-if="unpreparedTracks.length === 0">{{
        t('prep.list.noneToAdd')
      }}</UiHint>
      <ul v-else class="separation-preparation-list__items">
        <TrackIdentityRow
          v-for="track in unpreparedTracks"
          :key="track.id"
          class="right-dock-track"
          :track="track"
          navigation="artist"
          hide-duration
          state-surface
          overflow="ellipsis"
          thumb-loading="lazy"
          thumb-decoding="async"
          @navigate="emit('navigate', $event)"
        >
          <template #trail>
            <UiIconButton
              :icon="MicAudioLines"
              :label="t('prep.list.enqueueNamed', { title: track.title })"
              :disabled="busy"
              @click.stop="emit('startTrack', track.id)"
              @dblclick.stop
            />
          </template>
        </TrackIdentityRow>
      </ul>
    </AppRightDockSection>

    <AppRightDockSection
      :heading="t('prep.list.prepared', { count: preparedTracks.length })"
    >
      <template #trailing>
        <UiIconButton
          :icon="RotateCcw"
          :label="t('prep.list.regenerate')"
          :disabled="busy || preparedTracks.length === 0"
          @click="emit('restartPrepared')"
        />
      </template>
      <UiHint v-if="preparedTracks.length === 0">{{
        t('prep.list.noneToRegenerate')
      }}</UiHint>
      <ul v-else class="separation-preparation-list__items">
        <TrackIdentityRow
          v-for="track in preparedTracks"
          :key="track.id"
          class="right-dock-track"
          :track="track"
          navigation="artist"
          hide-duration
          state-surface
          overflow="ellipsis"
          thumb-loading="lazy"
          thumb-decoding="async"
          @navigate="emit('navigate', $event)"
        >
          <template #trail>
            <UiStatusIcon
              :icon="BadgeCheck"
              tone="muted"
              :label="t('prep.list.hasAccompaniment')"
            />
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
  gap: var(--ui-track-list-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.separation-preparation-list :deep(.app-right-dock-section__header) {
  min-block-size: var(--ui-control-height);
}

@container (max-width: 42rem) {
  .separation-preparation-list {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
