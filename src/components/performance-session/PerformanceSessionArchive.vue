<script setup>
import { computed, ref, toRef } from 'vue';
import { ArrowLeft, Copy, Download, Tickets } from '../../icons/index.js';
import { FOLDER_DOSSIER_ARTWORK_SIZE } from '../../constants/ui.js';
import { useAppView } from '../../composables/useAppView.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePerformanceArchive } from '../../composables/usePerformanceArchive.js';
import { usePerformanceQueueActions } from '../../composables/usePerformanceQueueActions.js';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';
import {
  performanceArchiveDate,
  performanceArchiveRows,
} from '../../utils/performanceArchivePresentation.js';
import {
  performanceSessionSummary,
  formatPerformanceSessionSummary,
} from '../../utils/performanceSessionSummary.js';
import AppFolderDossier from '../layout/AppFolderDossier.vue';
import AppFolderContentField from '../layout/AppFolderContentField.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import TrackTable from '../track/TrackTable.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import CollectionActionRail from '../library/CollectionActionRail.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import PerformanceSessionPlaylistExportModal from './PerformanceSessionPlaylistExportModal.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({ sessionId: { type: String, required: true } });
const { session, loading, error, refresh } = usePerformanceArchive(
  toRef(props, 'sessionId'),
);
const { state: library } = useLibrary();
const { openPerformancePreparation } = useAppView();
const timeline = useObsSessionExport();
const performanceQueue = usePerformanceQueueActions();
const playlist = ref(null);
const rows = computed(() =>
  performanceArchiveRows(session.value, library.tracks),
);
const tableEntries = computed(() =>
  rows.value.map((row, visibleIndex) => ({
    key: row.key,
    visibleIndex,
    track: {
      ...row.track,
      id: row.track?.id ?? row.key,
      title: row.title,
      artist: row.artist,
    },
    performanceStatusText: row.status,
  })),
);
const coverTracks = computed(() => {
  const seen = new Set();
  return rows.value
    .map((row) => row.track)
    .filter((track) => {
      if (!track || seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
});
const fields = computed(() =>
  session.value
    ? [
        {
          key: 'ended',
          text: t('session.archive.archivedAt', {
            date: performanceArchiveDate(session.value.endedAt),
          }),
        },
        {
          key: 'summary',
          text: formatPerformanceSessionSummary(
            performanceSessionSummary(session.value.items, library.tracks),
            session.value.items,
          ),
        },
      ]
    : [],
);
</script>

<template>
  <section class="performance-archive" :aria-busy="loading">
    <UiButton :icon="ArrowLeft" @click="openPerformancePreparation">{{
      t('session.archive.back')
    }}</UiButton>
    <UiSkeleton
      v-if="loading && !session"
      :lines="4"
      :aria-label="t('session.archive.loading')"
    />
    <UiNotice v-if="error" compact tone="warning" :message="error" />
    <UiButton v-if="error" :disabled="loading" @click="refresh">{{
      t('session.archive.reload')
    }}</UiButton>
    <template v-if="session">
      <AppFolderDossier
        :marker="t('session.archive.marker')"
        :title="session.name"
        title-id="performance-archive-title"
        :fields="fields"
      >
        <template #artwork
          ><UiCollageThumb
            :tracks="coverTracks"
            :size="FOLDER_DOSSIER_ARTWORK_SIZE"
            radius="0"
        /></template>
      </AppFolderDossier>
      <CollectionActionRail
        :entity-label="t('session.archive.entity')"
        :show-search="false"
        :show-density="false"
      >
        <template #actions>
          <UiIconButton
            :icon="Tickets"
            :label="t('session.archive.addToQueue')"
            :disabled="!session.items.length || performanceQueue.state.isSaving"
            @click="performanceQueue.addArchive(session.id)"
          />
          <UiIconButton
            :icon="Copy"
            :label="t('session.archive.saveAsPlaylist')"
            @click="playlist = { id: session.id, name: session.name }"
          />
          <UiIconButton
            :icon="Download"
            :label="t('session.archive.exportTimeline')"
            @click="timeline.openForArrangement(session.id)"
          />
        </template>
      </CollectionActionRail>
      <AppFolderContentField :aria-label="t('session.archive.tracksLabel')">
        <UiHint v-if="!rows.length">{{ t('session.archive.empty') }}</UiHint>
        <TrackTable
          v-else
          collection-kind="performance-archive"
          :entries="tableEntries"
          :content-key="session.id"
        />
      </AppFolderContentField>
    </template>
    <PerformanceSessionPlaylistExportModal
      :open="Boolean(playlist)"
      :session-id="playlist?.id"
      :suggested-name="playlist?.name"
      @close="playlist = null"
    />
  </section>
</template>

<style scoped>
.performance-archive {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-3);
}
.performance-archive > .ui-btn {
  justify-self: start;
}
</style>
