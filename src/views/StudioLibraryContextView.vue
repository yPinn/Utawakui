<script setup>
import { computed } from 'vue';
import { useLibrary } from '../composables/useLibrary.js';
import { usePlayer } from '../composables/usePlayer.js';
import { usePlaylists } from '../composables/usePlaylists.js';
import { useStudioLibraryInspector } from '../composables/useStudioLibraryInspector.js';
import StudioLibraryContextInspector from '../components/playlists/StudioLibraryContextInspector.vue';
import { createStudioLibraryPresentation } from '../utils/studioLibraryPresentation.js';

const { state: libraryState } = useLibrary();
const { state: playlistState, selectedPlaylist } = usePlaylists();
const { state: playerState } = usePlayer();
const { isInspectorOpen, toggleInspector } = useStudioLibraryInspector();

const presentation = computed(() =>
  createStudioLibraryPresentation({
    selectedPlaylist: selectedPlaylist.value,
    libraryView: playlistState.libraryView,
    tracks: libraryState.tracks,
  }),
);
const currentCollectionTrackTitle = computed(() => {
  const currentTrackId = playerState.track?.id;
  if (!currentTrackId) return '';
  return (
    presentation.value.tracks.find((track) => track.id === currentTrackId)
      ?.title ?? ''
  );
});
</script>

<template>
  <StudioLibraryContextInspector
    :open="isInspectorOpen"
    :collection-title="presentation.title"
    :cover-url="presentation.coverUrl"
    :tracks="presentation.tracks"
    :can-collage="presentation.canCollage"
    :facts="presentation.facts"
    :current-track-title="currentCollectionTrackTitle"
    @toggle="toggleInspector"
  />
</template>
