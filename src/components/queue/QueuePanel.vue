<script setup>
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue';
import { useAlbumNavigation } from '../../composables/useAlbumNavigation.js';
import { useDragReorder } from '../../composables/useDragReorder.js';
import { usePlaybackQueue } from '../../composables/usePlaybackQueue.js';
import { usePerformanceQueueActions } from '../../composables/usePerformanceQueueActions.js';
import { usePlaybackHistory } from '../../composables/usePlaybackHistory.js';
import { useRecentPlaybackActivation } from '../../composables/useRecentPlaybackActivation.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { useSongEditor } from '../../composables/useSongEditor.js';
import { useReleaseOrganization } from '../../composables/useReleaseOrganization.js';
import { toPlayableTrack } from '../../utils/playableTrack.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { TRACK_MENU_ACTIONS } from '../../utils/playlistMenu.js';
import { collectionForSource } from '../../utils/collectionIdentity.js';
import AppRightDockPanel from '../layout/AppRightDockPanel.vue';
import TrackActionMenu from '../track/TrackActionMenu.vue';
import QueueSection from './QueueSection.vue';
import RecentPlaybackList from './RecentPlaybackList.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiTabs from '../ui/UiTabs.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import { Tickets } from '../../icons/index.js';
import PerformanceSessionDockContent from '../performance-session/PerformanceSessionDockContent.vue';
import PerformanceSessionSummary from '../performance-session/PerformanceSessionSummary.vue';
import BgmPlayer from '../bgm/BgmPlayer.vue';
import { useAppRightDock } from '../../composables/useAppRightDock.js';
import { t } from '../../utils/i18n.js';

defineProps({
  active: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'collapse']);
const dock = useAppRightDock();
const performanceQueue = usePerformanceQueueActions();
const arrangementTabs = [
  { id: 'pending', label: t('queue.panel.pending') },
  { id: 'history', label: t('queue.panel.history') },
];

const {
  state: playerState,
  playTrack,
  toggle: togglePlayerPlayback,
} = usePlayer();
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
const { albumForTrack, jumpToAlbum, jumpToPlaylist } = useAlbumNavigation();
const songEditor = useSongEditor();
const releaseOrganization = useReleaseOrganization();
const { state: playbackHistoryState, recentItems } = usePlaybackHistory();
const { activateRecentEntry } = useRecentPlaybackActivation();
const tabs = [
  { id: 'queue', label: t('queue.panel.queue') },
  { id: 'recent', label: t('queue.panel.recent') },
];
const activeTab = shallowRef('queue');
const selectedTrackId = shallowRef(null);
const selectedRecentEntryKey = shallowRef(null);
const trackMenu = shallowRef(null);
const dockPanel = useTemplateRef('dockPanel');
// Queue rows cost about 1 ms each, so long sections window early.
const QUEUE_VIRTUALIZE_ABOVE = 100;

const currentTracks = computed(() =>
  currentTrack.value ? [currentTrack.value] : [],
);
const hasQueue = computed(
  () =>
    currentTracks.value.length > 0 ||
    queuedTracks.value.length > 0 ||
    sourceUpcomingTracks.value.length > 0,
);
const upcomingSourceLabel = computed(
  () => state.sourceName || t('queue.panel.currentQueue'),
);
// null for a non-playlist source (e.g. useLyrics.js's 'lyrics-workspace'
// marker, or no source at all) — only a real, still-existing playlist/album
// entry is worth making the section title jump to.
const upcomingSourcePlaylist = computed(() => {
  if (!state.sourceId) return null;
  return collectionForSource(playlistState.playlists, state.sourceId) ?? null;
});
const upcomingSourceLinkLabel = computed(() => {
  return t(
    upcomingSourcePlaylist.value?.kind === 'album'
      ? 'queue.panel.goToAlbum'
      : 'queue.panel.goToPlaylist',
    { name: upcomingSourceLabel.value },
  );
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
  trackMenu.value = {
    ...payload,
    anchor: fromButton
      ? { kind: 'element', element: event.currentTarget }
      : {
          kind: 'point',
          x: event.clientX ?? 0,
          y: event.clientY ?? 0,
        },
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
  } else if (value.action === TRACK_MENU_ACTIONS.addToPerformanceQueue) {
    await performanceQueue.addTrack(track.id);
  } else if (value.action === TRACK_MENU_ACTIONS.removeFromQueue) {
    removeQueuedTrack(track.id);
    if (selectedTrackId.value === track.id) selectedTrackId.value = null;
  } else if (value.action === TRACK_MENU_ACTIONS.addToPlaylist) {
    addTrackToPlaylist(value.playlistId, track.id);
  } else if (
    [
      TRACK_MENU_ACTIONS.editMetadata,
      TRACK_MENU_ACTIONS.workOrganization,
    ].includes(value.action)
  ) {
    await songEditor.open(track);
  } else if (value.action === TRACK_MENU_ACTIONS.createLocalRelease) {
    await releaseOrganization.openCreate(track);
  } else if (value.action === TRACK_MENU_ACTIONS.goToRelease) {
    jumpToPlaylist(value.collectionId);
  } else if (value.action === TRACK_MENU_ACTIONS.goToAlbum) {
    jumpToAlbum(track);
  }

  closeTrackMenu();
}

function selectTab(tabId) {
  closeTrackMenu();
  activeTab.value = tabId;
  nextTick(() => {
    dockPanel.value?.scrollTo({ top: 0 });
  });
}

function playCurrentTrack(track) {
  playTrack(toPlayableTrack(track));
}

function playQueuedTrack(track, options = {}) {
  setCurrentTrack(track.id, options);
  playTrack(toPlayableTrack(track));
}

function toggleTrackPlayback(track, activateTrack) {
  if (playerState.track?.id === track.id) {
    togglePlayerPlayback();
    return;
  }
  activateTrack(track);
}

function toggleCurrentTrackPlayback(track) {
  toggleTrackPlayback(track, playCurrentTrack);
}

function toggleQueuedTrackPlayback(track, options = {}) {
  toggleTrackPlayback(track, (nextTrack) =>
    playQueuedTrack(nextTrack, options),
  );
}

function toggleRecentEntryPlayback(entry) {
  if (playerState.track?.id === entry.track.id) {
    togglePlayerPlayback();
    return;
  }
  activateRecentEntry(entry);
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
  <AppRightDockPanel
    ref="dockPanel"
    class="queue-panel"
    :title="t('queue.panel.title')"
    :workspace="
      dock.queueVariant.value === 'arrangement' &&
      dock.arrangementTab.value !== 'history'
    "
    :collapse-label="t('queue.panel.collapse')"
    :aria-label="t('queue.panel.title')"
    @collapse="emit('collapse')"
  >
    <template #overlay>
      <TrackActionMenu
        :performance-queue-busy="performanceQueue.state.isSaving"
        :open="Boolean(trackMenu)"
        :anchor="trackMenu?.anchor"
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
    </template>

    <template #identity>
      <div class="queue-panel__view-controls">
        <UiTabs
          v-if="dock.queueVariant.value === 'queue'"
          :items="tabs"
          :active-id="activeTab"
          :aria-label="t('queue.panel.generalLabel')"
          tab-id-prefix="queue-panel"
          panel-id-prefix="queue-panel"
          variant="bar"
          @update:active-id="selectTab"
        />
        <UiTabs
          v-else
          :items="arrangementTabs"
          :active-id="dock.arrangementTab.value"
          :aria-label="t('queue.panel.arrangementLabel')"
          tab-id-prefix="arrangement-dock"
          panel-id-prefix="arrangement-dock"
          variant="bar"
          @update:active-id="dock.selectArrangementTab"
        />
      </div>
    </template>

    <template #actions>
      <UiIconButton
        :icon="Tickets"
        size="md"
        :label="
          t(
            dock.queueVariant.value === 'arrangement'
              ? 'queue.panel.toGeneral'
              : 'queue.panel.toArrangement',
          )
        "
        :title="
          t(
            dock.queueVariant.value === 'arrangement'
              ? 'queue.panel.toGeneralHint'
              : 'queue.panel.toArrangementHint',
          )
        "
        :active="dock.queueVariant.value === 'arrangement'"
        :aria-pressed="dock.queueVariant.value === 'arrangement'"
        tooltip-placement="bottom"
        @click="
          dock.selectQueueVariant(
            dock.queueVariant.value === 'arrangement' ? 'queue' : 'arrangement',
          )
        "
      />
    </template>

    <template
      v-if="active && dock.queueVariant.value === 'arrangement'"
      #footer
    >
      <div
        v-if="dock.arrangementTab.value === 'history'"
        class="queue-panel__footer-summary"
      >
        <PerformanceSessionSummary compact scope="completed" />
      </div>
      <BgmPlayer
        variant="dock"
        :active="dock.arrangementTab.value !== 'history'"
      />
    </template>

    <PerformanceSessionDockContent
      v-if="active && dock.queueVariant.value === 'arrangement'"
    />

    <div
      v-show="activeTab === 'queue' && dock.queueVariant.value === 'queue'"
      id="queue-panel-queue-panel"
      class="queue-panel__content"
      role="tabpanel"
      aria-labelledby="queue-panel-queue-tab"
      tabindex="0"
    >
      <UiHint v-if="!hasQueue">{{ t('queue.panel.empty') }}</UiHint>

      <div v-else class="queue-panel__sections">
        <QueueSection
          :title="t('queue.panel.nowPlaying')"
          menu-context="current"
          :tracks="currentTracks"
          :selected-track-id="selectedTrackId"
          :current-track-id="state.currentTrackId"
          :playing-track-id="playerState.track?.id ?? null"
          :player-playing="playerState.isPlaying"
          :open-menu-key="openTrackMenuKey"
          @select-track="selectQueueTrack"
          @activate-track="playCurrentTrack"
          @toggle-track-playback="toggleCurrentTrackPlayback"
          @artist-navigate="emit('close')"
          @open-track-menu="openTrackMenu"
        />

        <QueueSection
          v-if="queuedTracks.length > 0"
          :title="t('queue.panel.nextUp')"
          menu-context="queued"
          :tracks="queuedTracks"
          :virtualize-above="QUEUE_VIRTUALIZE_ABOVE"
          :selected-track-id="selectedTrackId"
          :open-menu-key="openTrackMenuKey"
          :playing-track-id="playerState.track?.id ?? null"
          :player-playing="playerState.isPlaying"
          :draggable-items="queuedTracks.length > 1"
          :dragging-track-id="draggingQueuedTrackId"
          :drop-target-track-id="dropTargetQueuedTrackId"
          :drop-position="queuedDropPosition"
          @select-track="selectQueueTrack"
          @activate-track="playQueuedTrack($event, { source: false })"
          @toggle-track-playback="
            toggleQueuedTrackPlayback($event, { source: false })
          "
          @artist-navigate="emit('close')"
          @open-track-menu="openTrackMenu"
          @track-drag-start="startQueuedDrag"
          @track-drag-over="updateQueuedDropTarget"
          @track-drag-leave="leaveQueuedDropTarget"
          @track-drop="dropQueuedTrack"
          @track-drag-end="clearQueuedDragState"
        >
          <template #actions>
            <UiButton @click="clearQueuedTracks">{{
              t('queue.panel.clear')
            }}</UiButton>
          </template>
        </QueueSection>

        <QueueSection
          :title-prefix="t('queue.panel.nextFrom')"
          :title="upcomingSourceLabel"
          menu-context="source"
          :tracks="sourceUpcomingTracks"
          :virtualize-above="QUEUE_VIRTUALIZE_ABOVE"
          :selected-track-id="selectedTrackId"
          :open-menu-key="openTrackMenuKey"
          :playing-track-id="playerState.track?.id ?? null"
          :player-playing="playerState.isPlaying"
          :draggable-items="sourceUpcomingTracks.length > 1"
          :dragging-track-id="draggingSourceTrackId"
          :drop-target-track-id="dropTargetSourceTrackId"
          :drop-position="sourceDropPosition"
          :title-jumpable="Boolean(upcomingSourcePlaylist)"
          :title-link-aria-label="upcomingSourceLinkLabel"
          :empty-text="t('queue.panel.noNext')"
          @select-track="selectQueueTrack"
          @activate-track="playQueuedTrack($event, { source: true })"
          @toggle-track-playback="
            toggleQueuedTrackPlayback($event, { source: true })
          "
          @artist-navigate="emit('close')"
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
      v-show="activeTab === 'recent' && dock.queueVariant.value === 'queue'"
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
        :current-track-id="state.currentTrackId"
        :playing-track-id="playerState.track?.id ?? null"
        :player-playing="playerState.isPlaying"
        :open-menu-key="openTrackMenuKey"
        :selected-entry-key="selectedRecentEntryKey"
        @select-entry="selectRecentEntry"
        @activate-entry="activateRecentEntry"
        @toggle-entry-playback="toggleRecentEntryPlayback"
        @artist-navigate="emit('close')"
        @open-track-menu="openTrackMenu"
      />
    </div>
  </AppRightDockPanel>
</template>

<style scoped>
.queue-panel__view-controls,
.queue-panel__footer-summary,
.queue-panel :deep(.session-history-tools__archives) {
  -webkit-user-select: none;
  user-select: none;
}

.queue-panel__footer-summary {
  min-inline-size: 0;
}
.queue-panel__view-controls {
  min-inline-size: 0;
  inline-size: max-content;
  max-inline-size: 100%;
}
.queue-panel__content {
  min-width: 0;
  -webkit-user-select: none;
  user-select: none;
}

.queue-panel__sections {
  display: grid;
  gap: var(--ui-side-panel-section-gap);
}

.queue-panel__content:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}
</style>
