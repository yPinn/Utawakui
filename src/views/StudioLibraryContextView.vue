<script setup>
import { computed } from 'vue';
import { useLibrary } from '../composables/useLibrary.js';
import { usePlaybackQueue } from '../composables/usePlaybackQueue.js';
import { usePlayer } from '../composables/usePlayer.js';
import { usePlaylists } from '../composables/usePlaylists.js';
import { playlistDisplayName } from '../utils/playlistMenu.js';
import StudioLibraryContextInspector from '../components/playlists/StudioLibraryContextInspector.vue';

const emit = defineEmits(['close']);

const { state: playerState } = usePlayer();
const {
  state: queueState,
  currentTrack: queueCurrentTrack,
  upcomingTracks,
} = usePlaybackQueue();
const { state: libraryState } = useLibrary();
const { state: playlistsState } = usePlaylists();

// The audio element-backed player state is the currently playing authority.
// Queue state supplies the same identity before playback starts and owns every
// upcoming entry plus its source context.
const currentTrack = computed(
  () => playerState.track ?? queueCurrentTrack.value ?? null,
);
const queueSourceName = computed(() => queueState.sourceName || '');

// Only rendered when playback started from a real playlist/album — playing
// from the general library view (no queueState.sourceId) keeps today's
// behavior with no collection card, rather than inventing a "library" identity
// the Inspector doesn't otherwise need to know about.
const activeCollection = computed(() => {
  const playlist = playlistsState.playlists.find(
    (candidate) => candidate.id === queueState.sourceId,
  );
  if (!playlist) return null;

  const tracksById = new Map(
    libraryState.tracks.map((track) => [track.id, track]),
  );
  return {
    name: playlistDisplayName(playlist),
    description: playlist.description ?? '',
    coverUrl: playlist.coverUrl ?? '',
    canCollage: playlist.kind !== 'album',
    tracks: playlist.trackIds
      .map((trackId) => tracksById.get(trackId))
      .filter(Boolean),
  };
});
</script>

<template>
  <StudioLibraryContextInspector
    :current-track="currentTrack"
    :queue-source-name="queueSourceName"
    :upcoming-tracks="upcomingTracks"
    :collection="activeCollection"
    @close="emit('close')"
  />
</template>
