<script setup>
import { computed, shallowRef, watch } from 'vue';
import { useAlbumNavigation } from '../../../composables/useAlbumNavigation.js';
import { usePlaybackQueue } from '../../../composables/usePlaybackQueue.js';
import { usePerformanceQueueActions } from '../../../composables/usePerformanceQueueActions.js';
import { usePlaylists } from '../../../composables/usePlaylists.js';
import { useSongEditor } from '../../../composables/useSongEditor.js';
import { useReleaseOrganization } from '../../../composables/useReleaseOrganization.js';
import { Ellipsis } from '../../../icons/index.js';
import { TRACK_MENU_ACTIONS } from '../../../utils/playlistMenu.js';
import RightDockTrackMenuButton from '../../queue/RightDockTrackMenuButton.vue';
import TrackActionMenu from '../../track/TrackActionMenu.vue';
import UiIconButton from '../../ui/UiIconButton.vue';

const props = defineProps({
  track: { type: Object, required: true },
  context: {
    type: String,
    default: 'current',
    validator: (value) =>
      ['current', 'queued', 'source', 'editor'].includes(value),
  },
  trigger: {
    type: String,
    default: 'overlay',
    validator: (value) => ['overlay', 'row', 'inline'].includes(value),
  },
  beforeNavigate: { type: Function, default: null },
  canUnlinkWork: { type: Boolean, default: false },
});

const emit = defineEmits(['openChange', 'unlinkWork']);

const performanceQueue = usePerformanceQueueActions();
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
const { albumForTrack, jumpToAlbum, jumpToPlaylist } = useAlbumNavigation();
const songEditor = useSongEditor();
const releaseOrganization = useReleaseOrganization();
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
  } else if (value.action === TRACK_MENU_ACTIONS.addToPerformanceQueue) {
    await performanceQueue.addTrack(track.id);
  } else if (value.action === TRACK_MENU_ACTIONS.removeFromQueue) {
    removeQueuedTrack(track.id);
  } else if (value.action === TRACK_MENU_ACTIONS.addToPlaylist) {
    addTrackToPlaylist(value.playlistId, track.id);
  } else if (
    [
      TRACK_MENU_ACTIONS.editMetadata,
      TRACK_MENU_ACTIONS.workOrganization,
    ].includes(value.action)
  ) {
    await songEditor.open(track);
  } else if (
    value.action === TRACK_MENU_ACTIONS.unlinkWork &&
    props.canUnlinkWork
  ) {
    emit('unlinkWork');
  } else if (value.action === TRACK_MENU_ACTIONS.createLocalRelease) {
    if (props.beforeNavigate && !(await props.beforeNavigate())) {
      closeTrackMenu();
      return;
    }
    await releaseOrganization.openCreate(track);
  } else if (value.action === TRACK_MENU_ACTIONS.goToRelease) {
    if (props.beforeNavigate && !(await props.beforeNavigate())) {
      closeTrackMenu();
      return;
    }
    jumpToPlaylist(value.collectionId);
  } else if (value.action === TRACK_MENU_ACTIONS.goToAlbum) {
    if (props.beforeNavigate && !(await props.beforeNavigate())) {
      closeTrackMenu();
      return;
    }
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
      tooltip-placement="start"
      aria-haspopup="menu"
      :aria-expanded="Boolean(trackMenu)"
      @click="openTrackMenu"
    />
    <UiIconButton
      v-else-if="trigger === 'inline'"
      :icon="Ellipsis"
      :label="`${track.title}的更多選項`"
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
      :performance-queue-busy="performanceQueue.state.isSaving"
      :open="Boolean(trackMenu)"
      :anchor="trackMenu.anchor"
      :track="track"
      :context="context"
      :can-unlink-work="canUnlinkWork"
      :playlists="playlistState.playlists"
      :current-track-id="menuCurrentTrackId"
      :queued-track-ids="queuedTrackIds"
      :can-go-to-album="canGoToAlbum"
      @select="handleTrackMenuSelect"
      @close="closeTrackMenu"
    />
  </div>
</template>

<style scoped>
.track-context-actions {
  display: grid;
}
</style>
