<script setup>
import { computed, shallowRef, watch } from 'vue';
import { useAlbumNavigation } from '../../../composables/useAlbumNavigation.js';
import { useLibrary } from '../../../composables/useLibrary.js';
import { usePlaybackQueue } from '../../../composables/usePlaybackQueue.js';
import { usePlaylists } from '../../../composables/usePlaylists.js';
import { useTrackMetadataEditor } from '../../../composables/useTrackMetadataEditor.js';
import { Ellipsis } from '../../../icons/index.js';
import { TRACK_MENU_ACTIONS } from '../../../utils/playlistMenu.js';
import TrackMetadataModal from '../../library/TrackMetadataModal.vue';
import RightDockTrackMenuButton from '../../queue/RightDockTrackMenuButton.vue';
import TrackActionMenu from '../../track/TrackActionMenu.vue';
import UiIconButton from '../../ui/UiIconButton.vue';

const props = defineProps({
  track: { type: Object, required: true },
  context: {
    type: String,
    default: 'current',
    validator: (value) => ['current', 'queued', 'source'].includes(value),
  },
  trigger: {
    type: String,
    default: 'overlay',
    validator: (value) => ['overlay', 'row'].includes(value),
  },
});

const emit = defineEmits(['openChange']);

const { refresh: refreshLibrary } = useLibrary();
const {
  state: queueState,
  queuedTracks,
  enqueueTrack,
  removeQueuedTrack,
} = usePlaybackQueue();
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
const menuCurrentTrackId = computed(() =>
  props.context === 'current'
    ? (props.track?.id ?? '')
    : (queueState.currentTrackId ?? ''),
);

function openTrackMenu(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const fromButton = event?.type === 'click';
  trackMenu.value = {
    anchor: fromButton
      ? { kind: 'element', element: event.currentTarget ?? null }
      : {
          kind: 'point',
          x: event?.clientX ?? 0,
          y: event?.clientY ?? 0,
        },
  };
  emit('openChange', true);
}

function closeTrackMenu() {
  trackMenu.value = null;
  emit('openChange', false);
}

watch([() => props.track?.id, () => props.context], closeTrackMenu);

defineExpose({ open: openTrackMenu });

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
  } else if (value.action === TRACK_MENU_ACTIONS.removeFromQueue) {
    removeQueuedTrack(track.id);
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
      v-if="trigger === 'overlay'"
      :icon="Ellipsis"
      label="歌曲選項"
      variant="overlay"
      tooltip-placement="left"
      aria-haspopup="menu"
      :aria-expanded="Boolean(trackMenu)"
      @click="openTrackMenu"
    />
    <RightDockTrackMenuButton
      v-else
      :track-title="track.title"
      :menu-open="Boolean(trackMenu)"
      @open="openTrackMenu"
    />

    <TrackActionMenu
      v-if="trackMenu"
      :open="Boolean(trackMenu)"
      :anchor="trackMenu.anchor"
      :track="track"
      :context="context"
      :playlists="playlistState.playlists"
      :current-track-id="menuCurrentTrackId"
      :queued-track-ids="queuedTrackIds"
      :can-go-to-album="canGoToAlbum"
      @select="handleTrackMenuSelect"
      @close="closeTrackMenu"
    />

    <TrackMetadataModal
      v-if="trackMetadataEditor.isOpen.value"
      :open="trackMetadataEditor.isOpen.value"
      :title="trackMetadataEditor.state.titleDraft"
      :artist="trackMetadataEditor.state.artistDraft"
      :thumbnail-url="trackMetadataEditor.state.artworkPreviewUrl"
      :dirty="trackMetadataEditor.isDirty.value"
      :artwork-changed="trackMetadataEditor.isArtworkDirty.value"
      :saving="trackMetadataEditor.state.isSaving"
      :artwork-preparing="trackMetadataEditor.state.isArtworkPreparing"
      :artwork-searching="trackMetadataEditor.state.isArtworkSearching"
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
