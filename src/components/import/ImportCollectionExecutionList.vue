<script setup>
import { computed } from 'vue';
import { useLibraryArtwork } from '../../composables/useLibraryArtwork.js';
import { CircleX, RefreshCw, Square } from '../../icons/index.js';
import {
  identityArtistLabel,
  identityTitle,
} from '../../utils/importCandidateDisplay.js';
import {
  downloadFailureHint,
  downloadFailureLabel,
} from '../../utils/downloadFailureDisplay.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import ImportCollectionTrackStatus from './ImportCollectionTrackStatus.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  tracks: { type: Array, default: () => [] },
  retryDisabled: { type: Boolean, default: false },
});

const emit = defineEmits(['cancel', 'retryFailed']);

function executionTrack(source) {
  return trackArtwork({
    ...source,
    title: identityTitle(source.trackIdentity, source.title),
    artist: identityArtistLabel(source.trackIdentity, source.artist),
  });
}
const { trackArtwork } = useLibraryArtwork();

const selectedTracks = computed(() =>
  props.tracks.filter((track) => track.selected),
);
const sections = computed(() =>
  [
    {
      id: 'active',
      label: t('import.collection.sections.active'),
      tracks: selectedTracks.value.filter(
        (track) => track.status === 'downloading',
      ),
    },
    {
      id: 'pending',
      label: t('import.collection.sections.next'),
      tracks: selectedTracks.value.filter(
        (track) => !track.alreadyDownloaded && track.status === 'pending',
      ),
    },
    {
      id: 'failed',
      label: t('import.collection.sections.failed'),
      tracks: selectedTracks.value.filter((track) => track.status === 'error'),
    },
    {
      id: 'completed',
      label: t('import.collection.sections.done'),
      tracks: selectedTracks.value.filter(
        (track) => !track.alreadyDownloaded && track.status === 'done',
      ),
    },
    {
      id: 'cancelled',
      label: t('import.collection.sections.cancelled'),
      tracks: selectedTracks.value.filter(
        (track) => track.status === 'cancelled',
      ),
    },
    {
      id: 'local',
      label: t('import.collection.sections.local'),
      tracks: selectedTracks.value.filter((track) => track.alreadyDownloaded),
    },
  ].filter((section) => section.tracks.length > 0),
);

function failureLabel(track) {
  if (!track.errorCode) return t('import.collection.downloadIncomplete');
  return t('import.collection.failureDetail', {
    label: downloadFailureLabel(track.errorCode),
    hint: downloadFailureHint(track.errorCode),
  });
}
</script>

<template>
  <div class="import-execution-list">
    <AppRightDockSection
      v-for="section in sections"
      :key="section.id"
      class="import-execution-list__section"
      :heading="
        t(
          'import.collection.sectionHeading',
          { label: section.label, count: section.tracks.length },
          section.tracks.length,
        )
      "
    >
      <template v-if="section.id === 'failed'" #trailing>
        <UiIconButton
          :icon="RefreshCw"
          :label="t('import.collection.retryFailed')"
          :disabled="retryDisabled"
          @click="emit('retryFailed')"
        />
      </template>

      <ul class="import-execution-list__rows">
        <UiTrackRow
          v-for="source in section.tracks"
          :key="source.id"
          class="import-execution-list__row"
          :track="executionTrack(source)"
          state-surface
          hide-duration
          overflow="ellipsis"
          thumb-loading="lazy"
          thumb-decoding="async"
        >
          <template v-if="section.id === 'active'" #trail>
            <UiIconButton
              :icon="Square"
              :label="
                t('import.collection.stopNamed', {
                  title: executionTrack(source).title,
                })
              "
              @click="emit('cancel', source.id)"
            />
          </template>
          <template v-else-if="section.id === 'failed'" #trail>
            <UiStatusIcon
              :icon="CircleX"
              tone="danger"
              :label="failureLabel(source)"
            />
          </template>
          <template v-else-if="section.id === 'cancelled'" #trail>
            <UiStatusIcon
              :icon="Square"
              tone="muted"
              :label="t('import.collection.sections.cancelled')"
            />
          </template>
          <template
            v-else-if="['completed', 'local'].includes(section.id)"
            #trail
          >
            <ImportCollectionTrackStatus :track="source" />
          </template>
        </UiTrackRow>
      </ul>
    </AppRightDockSection>
  </div>
</template>

<style scoped>
.import-execution-list {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-right-dock-section-gap);
}

.import-execution-list :deep(.app-right-dock-section__header) {
  min-block-size: var(--ui-control-height);
}

.import-execution-list__rows {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-track-list-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.import-execution-list__row {
  inline-size: 100%;
  min-inline-size: 0;
  max-inline-size: 100%;
  box-sizing: border-box;
}
</style>
