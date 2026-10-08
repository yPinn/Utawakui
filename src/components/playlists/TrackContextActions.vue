<script setup>
import { computed, shallowRef, watch } from 'vue';
import { useAlbumNavigation } from '../../composables/useAlbumNavigation.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePlaybackQueue } from '../../composables/usePlaybackQueue.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { useTrackMetadataEditor } from '../../composables/useTrackMetadataEditor.js';
import { Ellipsis } from '../../icons/index.js';
import { TRACK_MENU_ACTIONS } from '../../utils/playlistMenu.js';
import TrackMetadataModal from '../library/TrackMetadataModal.vue';
import TrackActionMenu from '../track/TrackActionMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';

const props = defineProps({
  track: { type: Object, required: true },
});

const { refresh: refreshLibrary } = useLibrary();
const { state: queueState, queuedTracks, enqueueTrack } = usePlaybackQueue();
const {
  state: playlistState,
  create: createPlaylist,
  addTrack: addTrackToPlaylist,
} = usePlaylists();
const { albumForTrack, jumpToAlbum } = useAlbumNavigation();
const trackMetadataEditor = useTrackMetadataEditor({ refresh: refreshLibrary });
const trackMenu = shallowRef(null);

const queuedTrackIds = computed(() =>
  queuedTracks.value.map((track) => track.id),
);
const canGoToAlbum = computed(() => Boolean(albumForTrack(props.track)));

function openTrackMenu(event) {
  event.preventDefault();
  event.stopPropagation();
  trackMenu.value = { anchorEl: event.currentTarget };
}

function closeTrackMenu() {
  trackMenu.value = null;
}

watch(() => props.track?.id, closeTrackMenu);

async function handleTrackMenuSelect(value) {
  const track = props.track;
  if (!track) {
    closeTrackMenu();
    return;
  }

  if (value.action === TRACK_MENU_ACTIONS.createPlaylist) {
    const playlist = await createPlaylist();
    if (playlist) addTrackToPlaylist(playlist.id, track.id);
  } else if (value.action === TRACK_MENU_ACTIONS.addToQueue) {
    enqueueTrack(track);
  } else if (value.action === TRACK_MENU_ACTIONS.addToPlaylist) {
    addTrackToPlaylist(value.playlistId, track.id);
  } else if (value.action === TRACK_MENU_ACTIONS.editMetadata) {
    trackMetadataEditor.open(track);
  } else if (value.action === TRACK_MENU_ACTIONS.goToAlbum) {
    jumpToAlbum(track);
  }

  closeTrackMenu();
}
</script>

<template>
  <div class="track-context-actions">
    <UiIconButton
      :icon="Ellipsis"
      label="歌曲選項"
      variant="overlay"
      tooltip-placement="left"
      aria-haspopup="menu"
      :aria-expanded="Boolean(trackMenu)"
      @click="openTrackMenu"
    />

    <TrackActionMenu
      v-if="trackMenu"
      :open="Boolean(trackMenu)"
      :anchor-el="trackMenu?.anchorEl ?? null"
      :track="track"
      context="current"
      :playlists="playlistState.playlists"
      :current-track-id="track.id ?? queueState.currentTrackId ?? ''"
      :queued-track-ids="queuedTrackIds"
      :can-go-to-album="canGoToAlbum"
      @select="handleTrackMenuSelect"
      @close="closeTrackMenu"
    />

    <TrackMetadataModal
      v-if="trackMetadataEditor.state.open"
      :open="trackMetadataEditor.state.open"
      :title="trackMetadataEditor.state.title"
      :artist="trackMetadataEditor.state.artist"
      :thumbnail-url="trackMetadataEditor.state.thumbnailUrl"
      :saving="trackMetadataEditor.state.saving"
      :artwork-saving="trackMetadataEditor.state.artworkSaving"
      :artwork-searching="trackMetadataEditor.state.artworkSearching"
      :artwork-search-open="trackMetadataEditor.state.artworkSearchOpen"
      :artwork-search-completed="
        trackMetadataEditor.state.artworkSearchCompleted
      "
      :artwork-query="trackMetadataEditor.state.artworkQuery"
      :artwork-candidates="trackMetadataEditor.state.artworkCandidates"
      :selected-artwork-candidate-id="
        trackMetadataEditor.state.selectedArtworkCandidateId
      "
      :error="trackMetadataEditor.state.error ?? ''"
      @close="trackMetadataEditor.close"
      @save="trackMetadataEditor.save"
      @choose-thumbnail="trackMetadataEditor.chooseThumbnail"
      @clear-thumbnail="trackMetadataEditor.clearThumbnail"
      @open-artwork-search="trackMetadataEditor.openArtworkSearch"
      @close-artwork-search="trackMetadataEditor.closeArtworkSearch"
      @update-artwork-query="trackMetadataEditor.setArtworkQueryField"
      @search-artwork="trackMetadataEditor.searchArtwork"
      @select-artwork-candidate="trackMetadataEditor.selectArtworkCandidate"
      @apply-artwork="trackMetadataEditor.applySelectedArtwork"
      @update-title="trackMetadataEditor.setTitleDraft"
      @update-artist="trackMetadataEditor.setArtistDraft"
    />
  </div>
</template>

<style scoped>
.track-context-actions {
  display: grid;
}
</style>
