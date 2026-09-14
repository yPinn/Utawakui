<script setup>
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import { useLibrary } from '../composables/useLibrary.js';
import { usePlayer } from '../composables/usePlayer.js';
import { usePlaylists } from '../composables/usePlaylists.js';
import { usePlaybackQueue } from '../composables/usePlaybackQueue.js';
import StudioLibraryDossier from '../components/playlists/StudioLibraryDossier.vue';
import { toPlayableTrack } from '../utils/playableTrack.js';
import { createStudioLibraryPresentation } from '../utils/studioLibraryPresentation.js';
import '../styles/tokens-v2.css';

const {
  state: libraryState,
  initialize: initializeLibrary,
  refresh: refreshLibrary,
} = useLibrary();
const { state: playlistState, selectedPlaylist } = usePlaylists();
const { state: playerState, playTrack } = usePlayer();
const { setQueue } = usePlaybackQueue();
const selectedTrackId = shallowRef(null);

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
let previousUiCandidateView;

watch(
  [() => selectedPlaylist.value?.id ?? null, () => playlistState.libraryView],
  () => {
    selectedTrackId.value = null;
  },
);

function selectTrackFromDossier(track) {
  selectedTrackId.value = track?.id ?? null;
}

function playTrackFromDossier(track, tracks) {
  if (
    !track ||
    !Array.isArray(tracks) ||
    !tracks.some(({ id }) => id === track.id)
  ) {
    return;
  }

  selectTrackFromDossier(track);
  setQueue(tracks, track.id, {
    sourceName: presentation.value.title,
    sourceId: selectedPlaylist.value?.id ?? null,
  });
  playTrack(toPlayableTrack(track));
}

onMounted(async () => {
  const root = document.documentElement;
  previousUiSystem = root.dataset.uiSystem;
  previousUiCandidateView = root.dataset.uiCandidateView;
  root.dataset.uiSystem = 'v2';
  root.dataset.uiCandidateView = 'studio-library';

  const wasInitialized = libraryState.isInitialized;
  await initializeLibrary();
  if (wasInitialized) await refreshLibrary();
});

onUnmounted(() => {
  const root = document.documentElement;
  if (previousUiSystem) root.dataset.uiSystem = previousUiSystem;
  else delete root.dataset.uiSystem;
  if (previousUiCandidateView) {
    root.dataset.uiCandidateView = previousUiCandidateView;
  } else {
    delete root.dataset.uiCandidateView;
  }
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
      :selected-track-id="selectedTrackId"
      :loading="libraryState.isLoading"
      :error-message="libraryErrorMessage"
      @select-track="selectTrackFromDossier"
      @activate-track="playTrackFromDossier"
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
</style>
