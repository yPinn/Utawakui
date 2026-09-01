<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useLibrary } from '../composables/useLibrary.js';
import { usePlayer } from '../composables/usePlayer.js';
import { usePlaylists } from '../composables/usePlaylists.js';
import StudioLibraryDossier from '../components/playlists/StudioLibraryDossier.vue';
import { createStudioLibraryPresentation } from '../utils/studioLibraryPresentation.js';
import '../styles/tokens-v2.css';

const {
  state: libraryState,
  initialize: initializeLibrary,
  refresh: refreshLibrary,
} = useLibrary();
const { state: playlistState, selectedPlaylist } = usePlaylists();
const { state: playerState } = usePlayer();

const presentation = computed(() =>
  createStudioLibraryPresentation({
    selectedPlaylist: selectedPlaylist.value,
    libraryView: playlistState.libraryView,
    tracks: libraryState.tracks,
  }),
);
const libraryErrorMessage = computed(
  () => libraryState.error?.message ?? libraryState.error?.title ?? '',
);
let previousUiSystem;

onMounted(async () => {
  const root = document.documentElement;
  previousUiSystem = root.dataset.uiSystem;
  root.dataset.uiSystem = 'v2';

  const wasInitialized = libraryState.isInitialized;
  await initializeLibrary();
  if (wasInitialized) await refreshLibrary();
});

onUnmounted(() => {
  const root = document.documentElement;
  if (previousUiSystem) root.dataset.uiSystem = previousUiSystem;
  else delete root.dataset.uiSystem;
});
</script>

<template>
  <section class="studio-library-view">
    <StudioLibraryDossier
      :collection-type="presentation.collectionType"
      :kind-label="presentation.kindLabel"
      :title="presentation.title"
      :summary="presentation.summary"
      :description="presentation.description"
      :tracks="presentation.tracks"
      :cover-url="presentation.coverUrl"
      :can-collage="presentation.canCollage"
      :current-track-id="playerState.track?.id ?? null"
      :loading="libraryState.isLoading"
      :error-message="libraryErrorMessage"
      @retry="refreshLibrary"
    />
  </section>
</template>

<style scoped>
.studio-library-view {
  container: studio-library / inline-size;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-color-surface);
}

:global(:root[data-ui-system='v2'] .app-tabs__folder--active),
:global(:root[data-ui-system='v2'] .app-tabs__row::after) {
  background: var(--ui-color-folder-primary);
}

:global(:root[data-ui-system='v2'] .app-tabs__folder--active) {
  color: var(--ui-color-text);
}
</style>
