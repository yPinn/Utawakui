<script setup>
import { computed, onMounted, shallowRef } from 'vue';
import { Search, Video } from '../../icons/index.js';
import { useAppView } from '../../composables/useAppView.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import {
  groupPerformanceArchives,
  performanceArchiveSummary,
  unlinkedPerformanceArchives,
} from '../../utils/performanceArchivePresentation.js';
import { t } from '../../utils/i18n.js';
import CollectionActionRail from '../library/CollectionActionRail.vue';
import LibraryEntityDossier from '../library/LibraryEntityDossier.vue';
import PlaylistSidebarRow from '../playlists/PlaylistSidebarRow.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';

const { state, initialize, refresh } = usePerformanceSessionPlan();
const { state: library } = useLibrary();
const { openPerformanceArchive } = useAppView();
const obsExport = useObsSessionExport();
const { state: playlists } = usePlaylists();
const searchOpen = shallowRef(false);
const searchQuery = shallowRef('');
const normalizedSearch = computed(() =>
  searchQuery.value.trim().toLocaleLowerCase(),
);
const archives = computed(() =>
  unlinkedPerformanceArchives(state.plan.archives, playlists.playlists),
);
const groups = computed(() => {
  const tracks = new Map(library.tracks.map((track) => [track.id, track]));
  const matching = archives.value.filter(({ name }) =>
    name.toLocaleLowerCase().includes(normalizedSearch.value),
  );
  return groupPerformanceArchives(matching).map(({ key, label, archives }) => ({
    key,
    label,
    rows: archives.map((session) => ({
      playlist: {
        id: session.id,
        name: session.name,
        kind: 'performance-archive',
      },
      summary: performanceArchiveSummary(session, { compact: true }),
      coverTracks: (session.coverTrackIds ?? [])
        .map((id) => tracks.get(id))
        .filter(Boolean),
    })),
  }));
});
onMounted(initialize);
</script>

<template>
  <div class="performance-archive-list" :aria-busy="state.isLoading">
    <LibraryEntityDossier
      entity-kind="library"
      library-view="performance-records"
      :title="t('session.archive.records')"
    />
    <CollectionActionRail
      :entity-label="t('session.archive.records')"
      :show-search="false"
      :show-density="false"
    >
      <template #actions>
        <UiIconButton
          :icon="Video"
          :label="t('obs.export.latest')"
          @click="obsExport.open()"
        />
      </template>
      <template #tools>
        <UiPopover
          v-model:open="searchOpen"
          :aria-label="t('session.archive.search')"
          placement="bottom-end"
          focus-on-open
        >
          <template #trigger="{ triggerProps }">
            <UiIconButton
              v-bind="triggerProps"
              :icon="Search"
              :label="t('session.archive.search')"
              :active="searchOpen || Boolean(normalizedSearch)"
              @click="searchOpen = !searchOpen"
            />
          </template>
          <UiSearchBox
            v-model="searchQuery"
            :label="t('session.archive.search')"
            :placeholder="t('session.archive.search')"
          />
        </UiPopover>
      </template>
    </CollectionActionRail>
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
      v-else-if="!state.isInitialized && !archives.length"
      :aria-label="t('session.archive.loading')"
    />
    <UiHint v-else-if="!groups.length">{{
      t(
        archives.length
          ? 'session.archive.searchEmpty'
          : 'session.archive.listEmpty',
      )
    }}</UiHint>
    <div v-if="groups.length" class="performance-archive-list__groups">
      <section
        v-for="group in groups"
        :key="group.key"
        class="performance-archive-list__rows"
      >
        <h2 class="performance-archive-list__month">{{ group.label }}</h2>
        <PlaylistSidebarRow
          v-for="row in group.rows"
          :key="row.playlist.id"
          :playlist="row.playlist"
          :subtitle="row.summary"
          :cover-tracks="row.coverTracks"
          :playback-enabled="false"
          @select="openPerformanceArchive(row.playlist.id)"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.performance-archive-list {
  display: grid;
  gap: var(--ui-space-3);
}
.performance-archive-list__groups {
  display: grid;
  gap: var(--ui-folder-section-gap);
}
.performance-archive-list__rows {
  display: grid;
  gap: var(--ui-track-list-gap);
}
.performance-archive-list__month {
  margin: 0;
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}
</style>
