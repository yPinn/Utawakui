<script setup>
import { computed, onMounted } from 'vue';
import { useAppView } from '../../composables/useAppView.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { performanceArchiveSummary } from '../../utils/performanceArchivePresentation.js';
import { t } from '../../utils/i18n.js';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import PlaylistSidebarRow from '../playlists/PlaylistSidebarRow.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';

const { state, initialize, refresh } = usePerformanceSessionPlan();
const { state: library } = useLibrary();
const { openPerformanceArchive } = useAppView();
const obsExport = useObsSessionExport();
const { state: playlists } = usePlaylists();
const rows = computed(() => {
  const tracks = new Map(library.tracks.map((track) => [track.id, track]));
  const linked = new Set(
    playlists.playlists.map((playlist) => playlist.performanceSessionId),
  );
  return [...(state.plan.archives ?? [])]
    .reverse()
    .filter((session) => !linked.has(session.id))
    .map((session) => ({
      playlist: {
        id: session.id,
        name: session.name,
        kind: 'performance-archive',
      },
      summary: performanceArchiveSummary(session),
      coverTracks: (session.coverTrackIds ?? [])
        .map((id) => tracks.get(id))
        .filter(Boolean),
    }));
});
onMounted(initialize);
</script>

<template>
  <div class="performance-archive-list" :aria-busy="state.isLoading">
    <AppRightDockSection :heading="t('session.archive.records')">
      <template #trailing>
        <UiButton @click="obsExport.open()">{{
          t('obs.export.latest')
        }}</UiButton>
      </template>
      <UiNotice
        v-if="state.error"
        tone="warning"
        :message="state.error"
        compact
      />
      <UiButton
        v-if="state.error"
        :disabled="state.isLoading"
        @click="refresh()"
        >{{ t('session.archive.reload') }}</UiButton
      >
      <UiSkeleton
        v-else-if="!state.isInitialized && !rows.length"
        :aria-label="t('session.archive.loading')"
      />
      <UiHint v-else-if="!rows.length">{{
        t('session.archive.listEmpty')
      }}</UiHint>
      <div v-if="rows.length" class="performance-archive-list__rows">
        <PlaylistSidebarRow
          v-for="row in rows"
          :key="row.playlist.id"
          :playlist="row.playlist"
          :subtitle="row.summary"
          :cover-tracks="row.coverTracks"
          :playback-enabled="false"
          @select="openPerformanceArchive(row.playlist.id)"
        />
      </div>
    </AppRightDockSection>
  </div>
</template>

<style scoped>
.performance-archive-list {
  display: grid;
  gap: var(--ui-space-3);
}
.performance-archive-list__rows {
  display: grid;
  gap: var(--ui-track-list-gap);
}
</style>
