<script setup>
import { computed, ref } from 'vue';
import { usePerformanceSessionWorkspace } from '../../composables/usePerformanceSessionWorkspace.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { libraryViewTitle } from '../../utils/playlistMenu.js';
import SetlistView from '../../views/SetlistView.vue';
import AppFolderPage from '../layout/AppFolderPage.vue';
import AppSurfaceBoundary from '../layout/AppSurfaceBoundary.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';

const { state: playlistState, selectedPlaylist } = usePlaylists();
const performanceSessionWorkspace = usePerformanceSessionWorkspace();
const searchQuery = ref('');

const pageMode = computed(() =>
  performanceSessionWorkspace.isOpen.value ? 'workspace' : 'document',
);
const showLibraryHeader = computed(
  () => !performanceSessionWorkspace.isOpen.value && !selectedPlaylist.value,
);
const pageTitle = computed(() => libraryViewTitle(playlistState.libraryView));
const documentKey = computed(
  () => selectedPlaylist.value?.id ?? `library:${playlistState.libraryView}`,
);
</script>

<template>
  <AppSurfaceBoundary surface-id="setlist">
    <AppFolderPage
      :mode="pageMode"
      :document-key="documentKey"
      body-label="曲目內容"
    >
      <template v-if="showLibraryHeader" #header>
        <UiPageHeader :title="pageTitle">
          <template #actions>
            <UiSearchBox v-model="searchQuery" />
          </template>
        </UiPageHeader>
      </template>

      <SetlistView v-model:search-query="searchQuery" />
    </AppFolderPage>
  </AppSurfaceBoundary>
</template>
