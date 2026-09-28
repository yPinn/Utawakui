<script setup>
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue';
import { useAlbumNavigation } from '../../composables/useAlbumNavigation.js';
import { useDragReorder } from '../../composables/useDragReorder.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePlaybackQueue } from '../../composables/usePlaybackQueue.js';
import { usePlaybackHistory } from '../../composables/usePlaybackHistory.js';
import { useRecentPlaybackActivation } from '../../composables/useRecentPlaybackActivation.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { useTrackMetadataEditor } from '../../composables/useTrackMetadataEditor.js';
import { toPlayableTrack } from '../../utils/playableTrack.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { TRACK_MENU_ACTIONS } from '../../utils/playlistMenu.js';
import TrackMetadataModal from '../library/TrackMetadataModal.vue';
import AppRightDockHeader from '../layout/AppRightDockHeader.vue';
import TrackActionMenu from '../track/TrackActionMenu.vue';
import QueueSection from './QueueSection.vue';
import RecentPlaybackList from './RecentPlaybackList.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiTabs from '../ui/UiTabs.vue';

defineProps({
  active: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const { playTrack } = usePlayer();
const {
  state,
  currentTrack,
  queuedTracks,
  sourceUpcomingTracks,
  setCurrentTrack,
  enqueueTrack,
  clearQueuedTracks,
  removeQueuedTrack,
  reorderQueuedTrack,
  reorderSourceTrack,
} = usePlaybackQueue();
const {
  state: playlistState,
  create: createPlaylist,
  addTrack: addTrackToPlaylist,
} = usePlaylists();
const { refresh: refreshLibrary } = useLibrary();
const { albumForTrack, jumpToAlbum, jumpToPlaylist } = useAlbumNavigation();
const trackMetadataEditor = useTrackMetadataEditor({ refresh: refreshLibrary });
const {
  state: playbackHistoryState,
  recentItems,
  clear: clearRecentPlayback,
} = usePlaybackHistory();
const { activateRecentEntry } = useRecentPlaybackActivation();
const tabs = [
  { id: 'queue', label: '佇列' },
  { id: 'recent', label: '最近播放' },
];
const activeTab = shallowRef('queue');
const hasScrolled = shallowRef(false);
const selectedTrackId = shallowRef(null);
const selectedRecentEntryKey = shallowRef(null);
const trackMenu = shallowRef(null);
const scrollElement = useTemplateRef('scroll');

const currentTracks = computed(() =>
  currentTrack.value ? [currentTrack.value] : [],
);
const hasQueue = computed(
  () =>
    currentTracks.value.length > 0 ||
    queuedTracks.value.length > 0 ||
    sourceUpcomingTracks.value.length > 0,
);
const upcomingSourceLabel = computed(() => state.sourceName || '目前佇列');
// null for a non-playlist source (e.g. useLyrics.js's 'lyrics-workspace'
// marker, or no source at all) — only a real, still-existing playlist/album
// entry is worth making the section title jump to.
const upcomingSourcePlaylist = computed(() => {
  if (!state.sourceId) return null;
  return (
    playlistState.playlists.find(
      (playlist) => playlist.id === state.sourceId,
    ) ?? null
  );
});
const upcomingSourceLinkLabel = computed(() => {
  const kindLabel =
    upcomingSourcePlaylist.value?.kind === 'album' ? '專輯' : '歌單';
  return `前往${kindLabel}：${upcomingSourceLabel.value}`;
});
const openTrackMenuKey = computed(() => trackMenu.value?.key ?? '');
const queuedTrackIds = computed(() =>
  queuedTracks.value.map((track) => track.id),
);

function selectQueueTrack(track) {
  selectedTrackId.value = track.id;
}

function selectRecentEntry(entry) {
  selectedRecentEntryKey.value = entry.key;
}

function openTrackMenu(payload) {
  const event = payload?.event;
  if (!payload?.track || !event) return;
  event.preventDefault?.();
  event.stopPropagation?.();

  const fromButton = event.type === 'click';
  const rect = fromButton
    ? event.currentTarget?.getBoundingClientRect?.()
    : null;
  trackMenu.value = {
    ...payload,
    x: rect?.right ?? event.clientX ?? 0,
    y: rect ? rect.bottom + 4 : (event.clientY ?? 0),
    alignX: rect ? 'right' : 'left',
  };
}

function closeTrackMenu() {
  trackMenu.value = null;
}

async function handleTrackMenuSelect(value) {
  const menu = trackMenu.value;
  const track = menu?.track;
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
    if (selectedTrackId.value === track.id) selectedTrackId.value = null;
  } else if (value.action === TRACK_MENU_ACTIONS.addToPlaylist) {
    addTrackToPlaylist(value.playlistId, track.id);
  } else if (value.action === TRACK_MENU_ACTIONS.editMetadata) {
    trackMetadataEditor.open(track);
  } else if (value.action === TRACK_MENU_ACTIONS.goToAlbum) {
    jumpToAlbum(track);
  }

  closeTrackMenu();
}

function selectTab(tabId) {
  closeTrackMenu();
  activeTab.value = tabId;
  nextTick(() => {
    if (scrollElement.value) scrollElement.value.scrollTop = 0;
    hasScrolled.value = false;
  });
}

function updateScrollState(event) {
  hasScrolled.value = event.currentTarget.scrollTop > 0;
}

function playCurrentTrack(track) {
  playTrack(toPlayableTrack(track));
}

function playQueuedTrack(track, options = {}) {
  setCurrentTrack(track.id, options);
  playTrack(toPlayableTrack(track));
}

function jumpToUpcomingSource() {
  if (!upcomingSourcePlaylist.value) return;
  jumpToPlaylist(upcomingSourcePlaylist.value.id);
  emit('close');
}

// Two independent instances — queued tracks and upcoming-source tracks are
// two separate lists with two separate drag gestures, not one shared drag
// state (see useDragReorder.js's own doc comment on why this composable is
// a plain factory rather than a singleton).
const {
  draggingId: draggingQueuedTrackId,
  dropTargetId: dropTargetQueuedTrackId,
  dropPosition: queuedDropPosition,
  startDrag: startQueuedDrag,
  updateDropTarget: updateQueuedDropTarget,
  leaveDropTarget: leaveQueuedDropTarget,
  drop: dropQueuedTrack,
  clearDragState: clearQueuedDragState,
} = useDragReorder({
  onReorder: reorderQueuedTrack,
  canDrag: () => queuedTracks.value.length >= 2,
});

const {
  draggingId: draggingSourceTrackId,
  dropTargetId: dropTargetSourceTrackId,
  dropPosition: sourceDropPosition,
  startDrag: startSourceDrag,
  updateDropTarget: updateSourceDropTarget,
  leaveDropTarget: leaveSourceDropTarget,
  drop: dropSourceTrack,
  clearDragState: clearSourceDragState,
} = useDragReorder({
  onReorder: reorderSourceTrack,
  canDrag: () => sourceUpcomingTracks.value.length >= 2,
});
</script>

<template>
  <section class="queue-panel" aria-label="播放清單">
    <TrackMetadataModal
      :open="trackMetadataEditor.isOpen.value"
      :title="trackMetadataEditor.state.titleDraft"
      :artist="trackMetadataEditor.state.artistDraft"
      :thumbnail-url="trackMetadataEditor.state.track?.thumbnailUrl ?? ''"
      :saving="trackMetadataEditor.state.isSaving"
      :artwork-saving="trackMetadataEditor.state.isArtworkSaving"
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
      @apply-artwork="trackMetadataEditor.applySelectedArtwork"
      @open-artwork-source="trackMetadataEditor.openArtworkSource"
      @update-title="trackMetadataEditor.setTitleDraft"
      @update-artist="trackMetadataEditor.setArtistDraft"
    />

    <div ref="scroll" class="queue-panel__scroll" @scroll="updateScrollState">
      <div
        class="queue-panel__chrome"
        :class="{ 'queue-panel__chrome--scrolled': hasScrolled }"
      >
        <AppRightDockHeader
          title="播放清單"
          close-label="關閉播放佇列"
          @close="emit('close')"
        >
          <template #identity>
            <UiTabs
              :items="tabs"
              :active-id="activeTab"
              aria-label="播放清單檢視"
              tab-id-prefix="queue-panel"
              panel-id-prefix="queue-panel"
              variant="bar"
              @update:active-id="selectTab"
            />
          </template>
        </AppRightDockHeader>
      </div>

      <div
        v-show="activeTab === 'queue'"
        id="queue-panel-queue-panel"
        class="queue-panel__content"
        role="tabpanel"
        aria-labelledby="queue-panel-queue-tab"
        tabindex="0"
      >
        <UiHint v-if="!hasQueue">尚未建立播放佇列</UiHint>

        <div v-else class="queue-panel__sections">
          <QueueSection
            title="現正播放"
            menu-context="current"
            :tracks="currentTracks"
            :selected-track-id="selectedTrackId"
            :current-track-id="state.currentTrackId"
            :open-menu-key="openTrackMenuKey"
            @select-track="selectQueueTrack"
            @activate-track="playCurrentTrack"
            @open-track-menu="openTrackMenu"
          />

          <QueueSection
            v-if="queuedTracks.length > 0"
            title="佇列中下一首"
            menu-context="queued"
            :tracks="queuedTracks"
            :selected-track-id="selectedTrackId"
            :open-menu-key="openTrackMenuKey"
            :draggable-items="queuedTracks.length > 1"
            :dragging-track-id="draggingQueuedTrackId"
            :drop-target-track-id="dropTargetQueuedTrackId"
            :drop-position="queuedDropPosition"
            @select-track="selectQueueTrack"
            @activate-track="playQueuedTrack($event, { source: false })"
            @open-track-menu="openTrackMenu"
            @track-drag-start="startQueuedDrag"
            @track-drag-over="updateQueuedDropTarget"
            @track-drag-leave="leaveQueuedDropTarget"
            @track-drop="dropQueuedTrack"
            @track-drag-end="clearQueuedDragState"
          >
            <template #actions>
              <UiButton @click="clearQueuedTracks">清除佇列</UiButton>
            </template>
          </QueueSection>

          <QueueSection
            title-prefix="下一首來自："
            :title="upcomingSourceLabel"
            menu-context="source"
            :tracks="sourceUpcomingTracks"
            :selected-track-id="selectedTrackId"
            :open-menu-key="openTrackMenuKey"
            :draggable-items="sourceUpcomingTracks.length > 1"
            :dragging-track-id="draggingSourceTrackId"
            :drop-target-track-id="dropTargetSourceTrackId"
            :drop-position="sourceDropPosition"
            :title-jumpable="Boolean(upcomingSourcePlaylist)"
            :title-link-aria-label="upcomingSourceLinkLabel"
            empty-text="沒有下一首"
            @select-track="selectQueueTrack"
            @activate-track="playQueuedTrack($event, { source: true })"
            @open-track-menu="openTrackMenu"
            @section-title-click="jumpToUpcomingSource"
            @track-drag-start="startSourceDrag"
            @track-drag-over="updateSourceDropTarget"
            @track-drag-leave="leaveSourceDropTarget"
            @track-drop="dropSourceTrack"
            @track-drag-end="clearSourceDragState"
          />
        </div>
      </div>

      <div
        v-show="activeTab === 'recent'"
        id="queue-panel-recent-panel"
        class="queue-panel__content"
        role="tabpanel"
        aria-labelledby="queue-panel-recent-tab"
        tabindex="0"
      >
        <RecentPlaybackList
          :entries="recentItems"
          :loading="!playbackHistoryState.isInitialized"
          :error="playbackHistoryState.error"
          :selected-entry-key="selectedRecentEntryKey"
          :current-track-id="state.currentTrackId"
          :open-menu-key="openTrackMenuKey"
          @select-entry="selectRecentEntry"
          @activate-entry="activateRecentEntry"
          @open-track-menu="openTrackMenu"
          @clear="clearRecentPlayback"
        />
      </div>
    </div>

    <TrackActionMenu
      :open="Boolean(trackMenu)"
      :x="trackMenu?.x ?? 0"
      :y="trackMenu?.y ?? 0"
      :align-x="trackMenu?.alignX ?? 'left'"
      :track="trackMenu?.track ?? null"
      :context="trackMenu?.context ?? 'default'"
      :playlists="playlistState.playlists"
      :current-track-id="state.currentTrackId ?? ''"
      :queued-track-ids="queuedTrackIds"
      :can-go-to-album="
        Boolean(trackMenu?.track && albumForTrack(trackMenu.track))
      "
      @select="handleTrackMenuSelect"
      @close="closeTrackMenu"
    />
  </section>
</template>

<style scoped>
.queue-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  height: 100%;
  flex-direction: column;
}

.queue-panel__scroll {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--ui-color-border-strong) transparent;
  scrollbar-width: thin;
  -webkit-user-select: none;
  user-select: none;
}

.queue-panel__chrome {
  position: sticky;
  top: 0;
  z-index: var(--ui-z-sticky);
  background: var(--ui-right-dock-sticky-background);
  transition:
    box-shadow var(--ui-motion-duration-fast) var(--ui-motion-easing-standard),
    backdrop-filter var(--ui-motion-duration-fast)
      var(--ui-motion-easing-standard);
}

.queue-panel__chrome--scrolled {
  -webkit-backdrop-filter: blur(var(--ui-right-dock-sticky-blur));
  backdrop-filter: blur(var(--ui-right-dock-sticky-blur));
  box-shadow: var(--ui-right-dock-sticky-shadow);
}

.queue-panel__content {
  padding: var(--ui-right-dock-content-inset);
}

.queue-panel__content:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: calc(-1 * var(--ui-focus-width));
}

.queue-panel__content :deep(.ui-track__title),
.queue-panel__content :deep(.ui-track__artist) {
  -webkit-user-select: text;
  user-select: text;
}

:global(:root[data-ui-motion='reduced']) .queue-panel__chrome {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .queue-panel__chrome {
    transition: none;
  }
}
</style>
