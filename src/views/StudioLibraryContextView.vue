<script setup>
import { computed } from 'vue';
import { useAlbumNavigation } from '../composables/useAlbumNavigation.js';
import { useAppView } from '../composables/useAppView.js';
import { useArtistIndex } from '../composables/useArtistIndex.js';
import { useCurrentTrackLyricsPreview } from '../composables/useCurrentTrackLyricsPreview.js';
import { useLibrary } from '../composables/useLibrary.js';
import { useLyrics } from '../composables/useLyrics.js';
import { usePlaybackQueue } from '../composables/usePlaybackQueue.js';
import { usePlayer } from '../composables/usePlayer.js';
import { usePlaylists } from '../composables/usePlaylists.js';
import { isArtistSourceId } from '../utils/artistPage.js';
import { toPlayableTrack } from '../utils/playableTrack.js';
import { playlistDisplayName } from '../utils/playlistMenu.js';
import {
  createLocalArtistSummary,
  createTrackReadiness,
} from '../utils/trackContextPresentation.js';
import TrackContextPanel from '../components/playback/context/TrackContextPanel.vue';

const emit = defineEmits(['collapse', 'openQueue']);

const {
  state: playerState,
  playTrack,
  toggle: togglePlayerPlayback,
} = usePlayer();
const {
  state: queueState,
  currentTrack: queueCurrentTrack,
  queuedTracks,
  upcomingTracks,
  setCurrentTrack,
} = usePlaybackQueue();
const { state: libraryState } = useLibrary();
const { state: playlistsState } = usePlaylists();
const { jumpToArtist, jumpToPlaylist } = useAlbumNavigation();
const { openLiveLyrics } = useAppView();
const { state: artistIndexState, ensureLoaded: ensureArtistIndex } =
  useArtistIndex();
ensureArtistIndex();
const { state: lyricsState, lyricsTextVariant } = useLyrics();
const liveLyricsOffset = computed(() =>
  lyricsState.isLoadingLyrics
    ? null
    : {
        trackId: lyricsState.selectedTrackId,
        sourceFilename: lyricsState.selectedSourceFilename,
        offsetMs: Math.round(lyricsState.offsetSeconds * 1000),
      },
);

// The audio element-backed player state is the currently playing authority.
// Queue state supplies the same identity before playback starts and owns every
// upcoming entry plus its source context.
const currentTrack = computed(
  () => playerState.track ?? queueCurrentTrack.value ?? null,
);
const currentLyricsTrack = computed(() => {
  const track = currentTrack.value;
  if (!track?.id) return null;
  return (
    libraryState.tracks.find((candidate) => candidate.id === track.id) ?? track
  );
});
const {
  preview: lyricsPreview,
  document: lyricsDocument,
  isLoading: lyricsLoading,
  error: lyricsError,
} = useCurrentTrackLyricsPreview({
  currentTrack: currentLyricsTrack,
  playerState,
  liveOffset: liveLyricsOffset,
  textVariant: lyricsTextVariant,
});

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
const queuedTrackIds = computed(() =>
  queuedTracks.value.map((track) => track.id),
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
  openLiveLyrics();
}

function openArtist() {
  if (!artistSummary.value?.artistId) return;
  jumpToArtist(artistSummary.value.artistId);
}

function activateUpcomingTrack(track) {
  const source = !queuedTrackIds.value.includes(track.id);
  setCurrentTrack(track.id, { source });
  playTrack(toPlayableTrack(track));
}

function toggleUpcomingTrackPlayback(track) {
  if (playerState.track?.id === track.id) {
    togglePlayerPlayback();
    return;
  }
  activateUpcomingTrack(track);
}

const artistSummary = computed(() =>
  createLocalArtistSummary(
    currentTrack.value,
    libraryState.tracks,
    artistIndexState.index,
  ),
);

const readiness = computed(() =>
  createTrackReadiness(currentLyricsTrack.value, {
    document: lyricsDocument.value,
    isLoading: lyricsLoading.value,
    error: lyricsError.value,
  }),
);
</script>

<template>
  <TrackContextPanel
    :current-track="currentTrack"
    :queue-source-name="queueSourceName"
    :source-navigable="Boolean(queueSourceDestination)"
    :source-link-label="queueSourceLinkLabel"
    :upcoming-tracks="upcomingTracks"
    :queued-track-ids="queuedTrackIds"
    :playing-track-id="playerState.track?.id ?? ''"
    :player-playing="playerState.isPlaying"
    :lyrics-preview="lyricsPreview"
    :lyrics-loading="lyricsLoading"
    :artist-summary="artistSummary"
    :readiness="readiness"
    @navigate-source="navigateToQueueSource"
    @open-artist="openArtist"
    @open-lyrics="openLyrics"
    @open-queue="emit('openQueue')"
    @toggle-queue-track-playback="toggleUpcomingTrackPlayback"
    @collapse="emit('collapse')"
  />
</template>
