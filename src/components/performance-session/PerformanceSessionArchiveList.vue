<script setup>
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onScopeDispose,
  shallowRef,
} from 'vue';
import { Video } from '../../icons/index.js';
import { useAppView } from '../../composables/useAppView.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { groupPerformanceArchiveDays } from '../../utils/performanceArchivePresentation.js';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiTabs from '../ui/UiTabs.vue';
import PerformanceSessionArchiveCalendar from './PerformanceSessionArchiveCalendar.vue';
import PerformanceSessionArchiveGroups from './PerformanceSessionArchiveGroups.vue';

const PerformanceSessionArchive = defineAsyncComponent(() =>
  import('./PerformanceSessionArchive.vue').then(
    ({ default: component }) => component,
  ),
);

const { state, initialize, refresh } = usePerformanceSessionPlan();
const { state: library } = useLibrary();
const { openLibraryContent } = useAppView();
const playlists = usePlaylists();
const obsExport = useObsSessionExport();
const view = shallowRef('calendar');
const searchQuery = shallowRef('');
const sessionId = shallowRef(null);
const views = [
  { id: 'calendar', label: t('session.archive.calendar') },
  { id: 'list', label: t('session.archive.list') },
];
const normalizedSearch = computed(() =>
  searchQuery.value.trim().toLocaleLowerCase(),
);
const archives = computed(() => state.plan.archives ?? []);
const groups = computed(() => {
  const tracks = new Map(library.tracks.map((track) => [track.id, track]));
  return groupPerformanceArchiveDays(
    archives.value.map((archive) => ({
      ...archive,
      kind: 'performance-archive',
      coverTracks: (archive.coverTrackIds ?? [])
        .map((id) => tracks.get(id))
        .filter(Boolean),
    })),
  );
});
const matches = computed(() =>
  groups.value.flatMap((group) => {
    const matching = group.archives.filter(({ name }) =>
      name.toLocaleLowerCase().includes(normalizedSearch.value),
    );
    return matching.length ? [{ ...group, archives: matching }] : [];
  }),
);

let openRevision = 0;
onScopeDispose(() => {
  openRevision++;
});

async function openSession(id) {
  const revision = ++openRevision;
  if (playlists.state.isLoading) await playlists.initialize();
  if (revision !== openRevision) return;

  const playlist = playlists.state.playlists.find(
    ({ performanceSessionId }) => performanceSessionId === id,
  );
  if (playlist) {
    playlists.select(playlist.id);
    openLibraryContent();
    return;
  }
  sessionId.value = id;
}

onMounted(initialize);
</script>

<template>
  <div class="performance-archive-list" :aria-busy="state.isLoading">
    <UiPageHeader :title="t('session.archive.records')">
      <template #actions>
        <div class="performance-archive-list__tools">
          <UiSearchBox
            v-model="searchQuery"
            class="performance-archive-list__search"
            :label="t('session.archive.search')"
            :placeholder="t('session.archive.search')"
          />
          <UiIconButton
            :icon="Video"
            :label="t('obs.export.latest')"
            @click="obsExport.open()"
          />
        </div>
      </template>
    </UiPageHeader>

    <UiNotice
      v-if="state.error"
      tone="warning"
      :message="state.error"
      compact
    />
    <UiButton v-if="state.error" :disabled="state.isLoading" @click="refresh">
      {{ t('session.archive.reload') }}
    </UiButton>
    <UiSkeleton
      v-else-if="!state.isInitialized && !archives.length"
      :aria-label="t('session.archive.loading')"
    />
    <UiHint v-else-if="!archives.length">{{
      t('session.archive.listEmpty')
    }}</UiHint>

    <template v-if="archives.length">
      <div v-if="normalizedSearch" aria-live="polite">
        <PerformanceSessionArchiveGroups
          v-if="matches.length"
          :groups="matches"
          @open="openSession"
        />
        <UiHint v-else>{{ t('session.archive.searchEmpty') }}</UiHint>
      </div>

      <div v-show="!normalizedSearch" class="performance-archive-list__views">
        <UiTabs
          v-model:active-id="view"
          :items="views"
          :aria-label="t('session.archive.views')"
          tab-id-prefix="performance-archive"
          panel-id-prefix="performance-archive"
          variant="bar"
        />
        <div
          v-show="view === 'calendar'"
          id="performance-archive-calendar-panel"
          role="tabpanel"
          aria-labelledby="performance-archive-calendar-tab"
        >
          <PerformanceSessionArchiveCalendar :groups="groups">
            <template #default="{ group }">
              <PerformanceSessionArchiveGroups
                :groups="[group]"
                @open="openSession"
              />
            </template>
          </PerformanceSessionArchiveCalendar>
        </div>
        <div
          v-show="view === 'list'"
          id="performance-archive-list-panel"
          role="tabpanel"
          aria-labelledby="performance-archive-list-tab"
        >
          <PerformanceSessionArchiveGroups
            v-if="view === 'list' && !normalizedSearch"
            :groups="groups"
            @open="openSession"
          />
        </div>
      </div>
    </template>

    <UiModal
      :open="Boolean(sessionId)"
      :title="t('session.archive.record')"
      size="wide"
      max-block-size="large"
      @close="sessionId = null"
    >
      <PerformanceSessionArchive
        v-if="sessionId"
        :session-id="sessionId"
        embedded
        allow-save-playlist
      />
    </UiModal>
  </div>
</template>

<style scoped>
.performance-archive-list,
.performance-archive-list__views {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-4);
}

.performance-archive-list__tools {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-inline-size: 0;
}

.performance-archive-list__search {
  inline-size: var(--ui-artwork-size-3xl);
  min-inline-size: 0;
}

.performance-archive-list > .ui-btn {
  justify-self: start;
}
</style>
