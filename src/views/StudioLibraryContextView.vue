<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import { useLibrary } from '../composables/useLibrary.js';
import { usePlaybackQueue } from '../composables/usePlaybackQueue.js';
import { usePlayer } from '../composables/usePlayer.js';
import { usePlaylists } from '../composables/usePlaylists.js';
import { useStudioLibraryInspector } from '../composables/useStudioLibraryInspector.js';
import { playlistDisplayName } from '../utils/playlistMenu.js';
import StudioLibraryContextInspector from '../components/playlists/StudioLibraryContextInspector.vue';

const { state: playerState } = usePlayer();
const {
  state: queueState,
  currentTrack: queueCurrentTrack,
  upcomingTracks,
} = usePlaybackQueue();
const { state: libraryState } = useLibrary();
const { state: playlistsState } = usePlaylists();
const { isInspectorOpen, setInspectorOpen, toggleInspector } =
  useStudioLibraryInspector();
let returnFocusTarget = null;

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

function restoreInspectorFocus() {
  const requestedTarget = returnFocusTarget;
  returnFocusTarget = null;
  nextTick(() => {
    const fallbackTarget = document.querySelector(
      '[aria-controls="studio-library-inspector-content"][aria-expanded="false"]',
    );
    const target =
      requestedTarget?.isConnected === false ? fallbackTarget : requestedTarget;
    target?.focus?.();
  });
}

watch(isInspectorOpen, (open, wasOpen) => {
  if (open) {
    returnFocusTarget = document.activeElement;
  } else if (wasOpen) {
    restoreInspectorFocus();
  }
});

function handleDocumentKeydown(event) {
  if (
    event.key !== 'Escape' ||
    event.defaultPrevented ||
    !isInspectorOpen.value ||
    event.target?.closest?.('dialog[open]')
  ) {
    return;
  }

  event.preventDefault();
  setInspectorOpen(false);
}

onMounted(() => document.addEventListener('keydown', handleDocumentKeydown));
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleDocumentKeydown);
  if (isInspectorOpen.value) setInspectorOpen(false);
});
</script>

<template>
  <StudioLibraryContextInspector
    :open="isInspectorOpen"
    :current-track="currentTrack"
    :queue-source-name="queueSourceName"
    :upcoming-tracks="upcomingTracks"
    :collection="activeCollection"
    @toggle="toggleInspector"
  />
</template>
