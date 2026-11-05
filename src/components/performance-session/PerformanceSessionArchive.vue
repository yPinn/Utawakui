<script setup>
import { computed, onScopeDispose, shallowRef, toRef } from 'vue';
import { Copy, Download } from '../../icons/index.js';
import { FOLDER_DOSSIER_ARTWORK_SIZE } from '../../constants/ui.js';
import { useAppView } from '../../composables/useAppView.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePerformanceArchive } from '../../composables/usePerformanceArchive.js';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import {
  performanceArchiveDate,
  performanceArchiveProgress,
  performanceArchiveRows,
} from '../../utils/performanceArchivePresentation.js';
import AppFolderDossier from '../layout/AppFolderDossier.vue';
import AppFolderContentField from '../layout/AppFolderContentField.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import TrackTable from '../track/TrackTable.vue';
import UiButton from '../ui/UiButton.vue';
import CollectionActionRail from '../library/CollectionActionRail.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiStack from '../ui/UiStack.vue';
import { t } from '../../utils/i18n.js';
import PerformanceSessionPlatformVideos from './PerformanceSessionPlatformVideos.vue';

const props = defineProps({
  sessionId: { type: String, required: true },
  embedded: Boolean,
});
const { session, loading, error, refresh } = usePerformanceArchive(
  toRef(props, 'sessionId'),
);
const { state: library } = useLibrary();
const { openLibraryContent } = useAppView();
const playlists = usePlaylists();
const timeline = useObsSessionExport();
const saving = shallowRef(false);
const saveError = shallowRef(false);
let disposed = false;
onScopeDispose(() => {
  disposed = true;
});
const rows = computed(() =>
  performanceArchiveRows(session.value, library.tracks),
);
const canSave = computed(() =>
  rows.value.some((row) => row.mode === 'library-track' && row.track),
);

async function createPlaylist() {
  if (!canSave.value || saving.value) return;
  const sessionId = props.sessionId;
  saving.value = true;
  saveError.value = false;
  try {
    const result = await playlists.createFromPerformanceArchive(sessionId);
    if (disposed || props.sessionId !== sessionId) return;
    if (
      !result?.playlistId ||
      !playlists.state.playlists.some(({ id }) => id === result.playlistId)
    ) {
      saveError.value = true;
      return;
    }
    playlists.select(result.playlistId);
    openLibraryContent();
  } catch {
    saveError.value = true;
  } finally {
    saving.value = false;
  }
}
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
    performanceStatusDetail: row.statusDetail,
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
const progressText = computed(() =>
  performanceArchiveProgress(
    rows.value.filter(({ progress }) => progress === 'completed').length,
    rows.value.length,
  ),
);
const timingFields = computed(() =>
  session.value
    ? [
        ...(session.value.startedAt
          ? [
              {
                key: 'started',
                text: t('session.archive.startedAt', {
                  date: performanceArchiveDate(session.value.startedAt),
                }),
              },
            ]
          : []),
        {
          key: 'ended',
          text: t('session.archive.archivedAt', {
            date: performanceArchiveDate(session.value.endedAt),
          }),
        },
      ]
    : [],
);
const fields = computed(() => [
  ...timingFields.value,
  { key: 'summary', text: progressText.value },
]);
</script>

<template>
  <section class="performance-archive" :aria-busy="loading">
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
        v-if="!embedded"
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
      <UiStack v-else direction="column" :gap="1">
        <UiStack :gap="2" wrap align="baseline">
          <h3 class="performance-archive__name">{{ session.name }}</h3>
          <UiHint>{{ progressText }}</UiHint>
        </UiStack>
        <UiStack :gap="2" wrap>
          <UiHint v-for="field in timingFields" :key="field.key">{{
            field.text
          }}</UiHint>
        </UiStack>
      </UiStack>
      <CollectionActionRail
        :entity-label="t('session.archive.entity')"
        :show-search="false"
        :show-density="false"
      >
        <template #actions>
          <UiButton
            v-if="!embedded && canSave"
            :icon="Copy"
            :disabled="saving"
            @click="createPlaylist"
            >{{ t('session.archive.savePlaylist') }}</UiButton
          >
          <UiButton
            :icon="Download"
            variant="secondary"
            @click="timeline.openForArrangement(session.id)"
            >{{ t('obs.export.title') }}</UiButton
          >
          <PerformanceSessionPlatformVideos :session-id="session.id" />
        </template>
      </CollectionActionRail>
      <UiNotice
        v-if="saveError"
        tone="warning"
        compact
        :message="t('session.history.playlistCreationFailed')"
      />
      <AppFolderContentField :aria-label="t('session.archive.tracksLabel')">
        <UiHint v-if="!rows.length">{{
          t(
            session.timeline?.some(({ type }) => type === 'marker')
              ? 'session.archive.markersOnly'
              : 'session.archive.empty',
          )
        }}</UiHint>
        <TrackTable
          v-else
          collection-kind="performance-archive"
          :density="embedded ? 'compact' : 'list'"
          :header-scroll-shadow="!embedded"
          :class="{ 'performance-archive__embedded-table': embedded }"
          :entries="tableEntries"
          :content-key="session.id"
        />
      </AppFolderContentField>
    </template>
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
.performance-archive__embedded-table {
  /* Close the modal scrollport's focus inset when the table header sticks. */
  --ui-folder-sticky-offset: calc(-1 * var(--ui-modal-focus-safe-inset));
}
.performance-archive__name {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-font-weight-semibold);
}
</style>
