<script setup>
import { computed } from 'vue';
import { useAlbumNavigation } from '../composables/useAlbumNavigation.js';
import { useAppView } from '../composables/useAppView.js';
import { useArtistIndex } from '../composables/useArtistIndex.js';
import { useLibrary } from '../composables/useLibrary.js';
import { useLyrics } from '../composables/useLyrics.js';
import { usePlaybackQueue } from '../composables/usePlaybackQueue.js';
import { usePlayer } from '../composables/usePlayer.js';
import { usePlaylists } from '../composables/usePlaylists.js';
import { isArtistSourceId } from '../utils/artistPage.js';
import { playlistDisplayName } from '../utils/playlistMenu.js';
import {
  createLocalArtistSummary,
  createTrackLyricsPreview,
  createTrackReadiness,
} from '../utils/trackContextPresentation.js';
import TrackContextPanel from '../components/playlists/TrackContextPanel.vue';

const emit = defineEmits(['close', 'openQueue']);

const { state: playerState } = usePlayer();
const {
  state: queueState,
  currentTrack: queueCurrentTrack,
  upcomingTracks,
} = usePlaybackQueue();
const { state: libraryState } = useLibrary();
const { state: playlistsState } = usePlaylists();
const { jumpToArtist, jumpToPlaylist } = useAlbumNavigation();
const { setActiveView } = useAppView();
const { state: artistIndexState, ensureLoaded: ensureArtistIndex } =
  useArtistIndex();
ensureArtistIndex();
const {
  selectedTrack: selectedLyricsTrack,
  selectedSource: selectedLyricsSource,
  lyricLines,
  activeLineIndex,
} = useLyrics();

// The audio element-backed player state is the currently playing authority.
// Queue state supplies the same identity before playback starts and owns every
// upcoming entry plus its source context.
const currentTrack = computed(
  () => playerState.track ?? queueCurrentTrack.value ?? null,
);

const queueSourcePlaylist = computed(() =>
  playlistsState.playlists.find(
    (candidate) => candidate.id === queueState.sourceId,
  ),
);
const queueSourceName = computed(
  () =>
    queueState.sourceName ||
    (queueSourcePlaylist.value
      ? playlistDisplayName(queueSourcePlaylist.value)
      : ''),
);

const queueSourceDestination = computed(() => {
  if (queueSourcePlaylist.value) {
    return {
      id: queueSourcePlaylist.value.id,
      kindLabel:
        queueSourcePlaylist.value.kind === 'album' ? '專輯' : '播放清單',
    };
  }
  if (isArtistSourceId(queueState.sourceId)) {
    return { id: queueState.sourceId, kindLabel: '藝人' };
  }
  return null;
});

const queueSourceLinkLabel = computed(() => {
  if (!queueSourceDestination.value) return '';
  return `前往${queueSourceDestination.value.kindLabel}：${queueSourceName.value}`;
});

function navigateToQueueSource() {
  if (!queueSourceDestination.value) return;
  jumpToPlaylist(queueSourceDestination.value.id);
}

function openLyrics() {
  setActiveView('lyrics');
}

function openArtist() {
  if (!artistSummary.value?.artistId) return;
  jumpToArtist(artistSummary.value.artistId);
}

// Only rendered when playback started from a real playlist/album — playing
// from the general library view (no queueState.sourceId) keeps today's
// behavior with no collection card, rather than inventing a "library" identity
// the Inspector doesn't otherwise need to know about.
const activeCollection = computed(() => {
  const playlist = queueSourcePlaylist.value;
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

const lyricsPreview = computed(() =>
  createTrackLyricsPreview({
    currentTrackId: currentTrack.value?.id ?? null,
    selectedTrackId: selectedLyricsTrack.value?.id ?? null,
    activeLineIndex: activeLineIndex.value,
    lines: lyricLines.value,
    source: selectedLyricsSource.value,
  }),
);

const artistSummary = computed(() =>
  createLocalArtistSummary(
    currentTrack.value,
    libraryState.tracks,
    artistIndexState.index,
  ),
);

const readiness = computed(() => createTrackReadiness(currentTrack.value));
</script>

<template>
  <TrackContextPanel
    :current-track="currentTrack"
    :queue-source-name="queueSourceName"
    :source-navigable="Boolean(queueSourceDestination)"
    :source-link-label="queueSourceLinkLabel"
    :upcoming-tracks="upcomingTracks"
    :collection="activeCollection"
    :lyrics-preview="lyricsPreview"
    :artist-summary="artistSummary"
    :readiness="readiness"
    @navigate-source="navigateToQueueSource"
    @open-artist="openArtist"
    @open-lyrics="openLyrics"
    @open-queue="emit('openQueue')"
    @close="emit('close')"
  />
</template>
