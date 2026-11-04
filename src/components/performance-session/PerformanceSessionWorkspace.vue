<script setup>
import { computed, onMounted, shallowRef } from 'vue';
import {
  ArrowLeft,
  ListPlus,
  Plus,
  Trash2,
  Ellipsis,
} from '../../icons/index.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePlayer } from '../../composables/usePlayer.js';
import { usePerformanceSessionPlayback } from '../../composables/usePerformanceSessionPlayback.js';
import { useAppRightDock } from '../../composables/useAppRightDock.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { contentLangAttribute } from '../../utils/contentLanguage.js';
import { artistSearchTexts } from '../../utils/artistPage.js';
import { playlistDisplayName } from '../../utils/playlistMenu.js';
import AppFolderWorkspaceToolbar from '../layout/AppFolderWorkspaceToolbar.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import PerformanceSessionCurrent from './PerformanceSessionCurrent.vue';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiChip from '../ui/UiChip.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import PerformanceSessionBoard from './PerformanceSessionBoard.vue';
import PerformanceSessionSummary from './PerformanceSessionSummary.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import PerformanceSessionManualItemForm from './PerformanceSessionManualItemForm.vue';
import PerformanceSessionPlanEditor from './PerformanceSessionPlanEditor.vue';
import PerformanceSessionPlanList from './PerformanceSessionPlanList.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  tracks: { type: Array, default: () => [] },
  showReturn: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);
const { confirm: confirmAction } = useAppConfirmation();
const { state: artistIndexState } = useArtistIndex();
const {
  state,
  selectedItem,
  initialize,
  appendLibraryTrack,
  appendManualItem,
  saveDisplay,
  relinkItem,
  moveItem,
  reorderItem,
  duplicateItem,
  removeItem,
  selectItem,
  clear,
  replaceFromCollection,
} = usePerformanceSessionPlan();
const { selectedPlaylist } = usePlaylists();

const librarySearchQuery = shallowRef('');
const editorOpen = shallowRef(false);
const playback = usePerformanceSessionPlayback();
const dock = useAppRightDock();
const arrangementDockVisible = computed(
  () =>
    dock.isExpanded.value &&
    dock.topSurface.value === 'queue' &&
    dock.queueVariant.value === 'arrangement',
);
const { state: playerState, toggle: togglePlayback } = usePlayer();
const currentConfirmed = computed(() =>
  state.plan.items.some(
    (item) =>
      item.itemId === playback.currentItem.value?.itemId &&
      item.progress === 'playing',
  ),
);
const pendingAttention = computed(
  () => playback.pendingItems.value.filter((item) => !item.ready).length,
);
const creatingManualItem = shallowRef(false);
const libraryAddValidationError = shallowRef(null);
const hasItems = computed(() => state.plan.summary.total > 0);
const normalizedLibrarySearch = computed(() =>
  librarySearchQuery.value.trim().toLocaleLowerCase(),
);
const isSearching = computed(() => normalizedLibrarySearch.value.length > 0);
const filteredTracks = computed(() => {
  const query = normalizedLibrarySearch.value;
  if (!query) return [];
  return props.tracks
    .filter((track) =>
      [
        track.title,
        ...artistSearchTexts(track, artistIndexState.index),
        track.id,
      ].some((value) =>
        String(value ?? '')
          .toLocaleLowerCase()
          .includes(query),
      ),
    )
    .slice(0, 50);
});
const reviewValidationError = computed(() => {
  if (!editorOpen.value) return null;
  const error = state.validationError;
  if (!error || libraryAddValidationError.value) return null;
  if (error.field) return error;
  return [
    'SESSION_PLAN_ITEM_NOT_FOUND',
    'SESSION_PLAN_STALE_REVISION',
  ].includes(error.code)
    ? error
    : null;
});
const workspaceValidationError = computed(() =>
  reviewValidationError.value || libraryAddValidationError.value
    ? null
    : state.validationError,
);
const sourceLabel = computed(() => state.plan.source?.name ?? '');
const sourceLang = computed(() =>
  contentLangAttribute(state.plan.source?.name),
);
const selectedCollectionLabel = computed(() =>
  playlistDisplayName(selectedPlaylist.value),
);
const collectionActionLabel = computed(() =>
  hasItems.value
    ? t('session.workspace.replaceFrom', {
        name: selectedCollectionLabel.value,
      })
    : selectedPlaylist.value?.kind === 'album'
      ? t('session.workspace.fromAlbum')
      : t('session.workspace.fromList'),
);

onMounted(initialize);

async function addLibraryTrack(trackId) {
  if (!(await appendLibraryTrack(trackId))) {
    libraryAddValidationError.value = state.validationError;
    return;
  }
  libraryAddValidationError.value = null;
  librarySearchQuery.value = '';
  creatingManualItem.value = false;
  editorOpen.value = false;
}

function openManualItem() {
  libraryAddValidationError.value = null;
  creatingManualItem.value = true;
  editorOpen.value = true;
}

async function createManualItem(fields) {
  if (!(await appendManualItem(fields))) return;
  creatingManualItem.value = false;
  editorOpen.value = false;
}

async function selectForReview(itemId) {
  if (!(await selectItem(itemId))) return;
  libraryAddValidationError.value = null;
  creatingManualItem.value = false;
  editorOpen.value = true;
}

async function saveSelectedDisplay(fields) {
  if (!selectedItem.value) return;
  if (await saveDisplay(selectedItem.value.itemId, fields))
    editorOpen.value = false;
}

async function relinkSelected(fields) {
  if (!selectedItem.value) return;
  if (await relinkItem(selectedItem.value.itemId, fields))
    editorOpen.value = false;
}

async function confirmRemoveItem(itemId) {
  const item = state.plan.items.find(
    (candidate) => candidate.itemId === itemId,
  );
  if (!item) return;
  const confirmed = await confirmAction({
    title:
      item.progress === 'queued'
        ? t('session.workspace.removeQueuedTitle')
        : t('session.workspace.removeHistoryTitle'),
    subject: item.displayTitle,
    message: t('session.workspace.removeMessage'),
    confirmLabel: t('session.workspace.removeConfirm'),
    intent: 'danger',
  });
  if (confirmed) removeItem(itemId);
}

async function clearDraft() {
  if (!hasItems.value) return;
  const confirmed = await confirmAction({
    title: t('session.workspace.clearTitle'),
    message: t('session.workspace.clearMessage'),
    detail: t('session.workspace.clearDetail'),
    confirmLabel: t('session.workspace.clearConfirm'),
    intent: 'danger',
  });
  if (confirmed && (await playback.stop())) clear();
}

async function prepareSelectedCollection() {
  const collection = selectedPlaylist.value;
  if (!collection) return;

  await initialize();
  let replaceCurrent = hasItems.value;
  if (replaceCurrent) {
    replaceCurrent = await confirmAction({
      title: t('session.workspace.replaceTitle'),
      subject: selectedCollectionLabel.value,
      meta: sourceLabel.value
        ? t('session.workspace.currentSource', { name: sourceLabel.value })
        : undefined,
      message: t('session.workspace.replaceMessage'),
      confirmLabel: t('session.workspace.replaceConfirm'),
      intent: 'danger',
    });
    if (!replaceCurrent) return;
  }

  if (replaceCurrent && !(await playback.stop())) return;
  let prepared = await replaceFromCollection(collection.id, replaceCurrent);
  if (
    !prepared &&
    !replaceCurrent &&
    state.validationError?.code === 'SESSION_PLAN_REPLACE_REQUIRED'
  ) {
    const confirmed = await confirmAction({
      title: t('session.workspace.replaceTitle'),
      message: t('session.workspace.replaceOtherMessage'),
      confirmLabel: t('session.workspace.replaceConfirm'),
      intent: 'danger',
    });
    if (confirmed && (await playback.stop()))
      prepared = await replaceFromCollection(collection.id, true);
  }

  if (prepared) {
    librarySearchQuery.value = '';
    creatingManualItem.value = false;
    editorOpen.value = false;
  }
}
const menuAnchor = shallowRef(null);
const workspaceMenu = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'arrangement',
      items: [
        {
          id: 'bgm',
          kind: 'action',
          value: 'bgm',
          label: t('session.workspace.showBgm'),
        },
        ...(selectedPlaylist.value
          ? [
              {
                id: 'prepare',
                kind: 'action',
                value: 'prepare',
                label: collectionActionLabel.value,
                icon: ListPlus,
                intent: hasItems.value ? 'danger' : 'default',
                disabled: state.isSaving || playback.state.busy,
              },
            ]
          : []),
        {
          id: 'clear',
          kind: 'action',
          value: 'clear',
          label: t('session.workspace.clearConfirm'),
          icon: Trash2,
          intent: 'danger',
          disabled: !hasItems.value || state.isSaving || playback.state.busy,
        },
      ],
    },
  ],
}));
async function selectWorkspaceAction(action) {
  menuAnchor.value = null;
  if (action === 'bgm') {
    dock.selectArrangementTab('pending');
    dock.showQueueVariant('arrangement');
    return;
  }
  if (state.isSaving || playback.state.busy) return;
  if (action === 'prepare') await prepareSelectedCollection();
  if (action === 'clear') await clearDraft();
}
</script>

<template>
  <section
    class="performance-session-workspace"
    :aria-label="t('session.workspace.label')"
  >
    <UiScrollLayout
      class="performance-session-workspace__viewport"
      content-class="performance-session-workspace__content"
      scrollbar-reserve="overflow"
      :aria-label="t('session.workspace.contentLabel')"
    >
      <AppFolderWorkspaceToolbar
        class="performance-session-workspace__toolbar"
        :context="sourceLabel"
        :context-lang="sourceLang"
      >
        <template #status>
          <PerformanceSessionSummary :show-source="false" />
          <UiChip v-if="pendingAttention" tone="warning">{{
            t(
              'session.workspace.attention',
              { count: pendingAttention },
              pendingAttention,
            )
          }}</UiChip>
          <span
            v-if="state.isSaving"
            class="performance-session-workspace__saving"
            role="status"
            >{{ t('session.workspace.saving') }}</span
          >
        </template>
        <template #actions>
          <UiButton
            :aria-pressed="arrangementDockVisible"
            :aria-label="
              t(
                arrangementDockVisible
                  ? 'session.workspace.hideDockLabel'
                  : 'session.workspace.showDockLabel',
              )
            "
            @click="
              arrangementDockVisible
                ? dock.setExpanded(false)
                : dock.showQueueVariant('arrangement')
            "
            >{{
              t(
                arrangementDockVisible
                  ? 'session.workspace.hideDock'
                  : 'session.workspace.showDock',
              )
            }}</UiButton
          >
          <UiButton
            v-if="showReturn"
            :icon="ArrowLeft"
            @click="emit('close')"
            >{{ t('session.workspace.back') }}</UiButton
          >
          <UiIconButton
            :icon="Ellipsis"
            :label="t('session.workspace.moreOptions')"
            aria-haspopup="menu"
            :aria-expanded="Boolean(menuAnchor)"
            @click="
              menuAnchor = menuAnchor
                ? null
                : { kind: 'element', element: $event.currentTarget }
            "
          />
        </template>
      </AppFolderWorkspaceToolbar>
      <UiNotice
        v-if="state.error"
        tone="danger"
        :title="t('session.workspace.arrangementFailed')"
        :message="state.error"
        compact
      />
      <UiNotice
        v-if="playback.state.error"
        tone="danger"
        :title="t('session.workspace.playbackFailed')"
        :message="playback.state.error"
        compact
      />
      <UiNotice
        v-if="!state.error && !playback.state.error && workspaceValidationError"
        tone="warning"
        :title="t('session.workspace.notCompleted')"
        :message="workspaceValidationError.message"
        compact
      />
      <div class="performance-session-workspace__controls">
        <PerformanceSessionCurrent
          class="performance-session-workspace__current"
          variant="workspace"
          :current="playback.currentItem.value"
          :player-track="playback.ownsPlayback.value ? null : playerState.track"
          :tracks="tracks"
          :phase="playerState.playbackPhase"
          :confirmed="currentConfirmed"
          :can-start="playback.canStart.value"
          :busy="state.isSaving || playback.state.busy"
          @start-first="playback.next"
          @complete="playback.complete"
          @stop="playback.stop"
          @toggle="togglePlayback"
        >
          <template #options>
            <UiCheckbox
              id="arrangement-continuous"
              :label="t('session.workspace.continuous')"
              :model-value="playback.state.continuous"
              @update:model-value="playback.setContinuous"
            />
          </template>
        </PerformanceSessionCurrent>
      </div>
      <PerformanceSessionBoard
        class="performance-session-workspace__grid"
        :tracks="tracks"
        :pending-count="playback.pendingItems.value.length"
        :history-items="playback.historyItems.value"
        :busy="state.isSaving || playback.state.busy"
        @duplicate="duplicateItem"
        @remove="confirmRemoveItem"
      >
        <template #search>
          <div class="performance-session-workspace__add">
            <UiSearchBox
              v-model="librarySearchQuery"
              :label="t('session.workspace.searchLabel')"
              :placeholder="t('session.workspace.searchPlaceholder')"
              :disabled="state.isSaving"
            />
            <UiButton
              :icon="Plus"
              variant="secondary"
              :disabled="state.isSaving"
              @click="openManualItem"
              >{{ t('session.workspace.addManual') }}</UiButton
            >
          </div>
          <UiNotice
            v-if="libraryAddValidationError"
            tone="warning"
            :title="t('session.workspace.addFailed')"
            :message="libraryAddValidationError.message"
            compact
          />
          <template v-if="isSearching">
            <UiHint>{{
              t('session.workspace.resultsCount', {
                count: filteredTracks.length,
              })
            }}</UiHint>
            <UiScrollLayout
              v-if="filteredTracks.length"
              class="performance-session-workspace__list-scroll"
              content-tag="ul"
              content-class="performance-session-workspace__search-results"
              :aria-label="t('session.workspace.resultsLabel')"
            >
              <TrackIdentityRow
                v-for="track in filteredTracks"
                :key="track.id"
                :track="track"
                interactive
                hide-duration
                :action-label="
                  t('session.workspace.addNamed', {
                    title: track.title ?? track.id,
                  })
                "
                @row-click="addLibraryTrack(track.id)"
              />
            </UiScrollLayout>
            <UiHint v-else>{{ t('session.workspace.noMatch') }}</UiHint>
          </template>
        </template>
        <template #pending>
          <PerformanceSessionPlanList
            v-if="playback.pendingItems.value.length"
            :items="playback.pendingItems.value"
            :tracks="tracks"
            :selected-item-id="
              editorOpen ? state.plan.reviewCursorItemId : null
            "
            :saving="state.isSaving || playback.state.busy"
            :move-item="moveItem"
            @select="selectForReview"
            @reorder="reorderItem"
            @duplicate="duplicateItem"
            @remove="confirmRemoveItem"
            @play="playback.start"
            @skip="playback.skip"
          />
          <UiHint v-else padded center>{{
            t('session.workspace.hint')
          }}</UiHint>
        </template>
      </PerformanceSessionBoard>
    </UiScrollLayout>
    <UiActionMenu
      :open="Boolean(menuAnchor)"
      :anchor="menuAnchor ?? { kind: 'point', x: 0, y: 0 }"
      :content="workspaceMenu"
      :aria-label="t('session.workspace.actions')"
      @select="selectWorkspaceAction"
      @close="menuAnchor = null"
    />
    <PerformanceSessionManualItemForm
      v-if="editorOpen && creatingManualItem"
      :saving="state.isSaving"
      :validation-error="reviewValidationError"
      @cancel="editorOpen = false"
      @create="createManualItem"
    />
    <PerformanceSessionPlanEditor
      v-else-if="editorOpen"
      :item="selectedItem"
      :tracks="tracks"
      :saving="state.isSaving"
      :validation-error="reviewValidationError"
      @close="editorOpen = false"
      @save-display="saveSelectedDisplay"
      @relink="relinkSelected"
    />
  </section>
</template>
<style scoped>
.performance-session-workspace {
  container-name: performance-session-workspace;
  container-type: inline-size;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.performance-session-workspace__viewport {
  flex: 1;
  min-block-size: 0;
}
.performance-session-workspace__viewport
  :deep(.performance-session-workspace__content) {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  block-size: 100%;
  min-block-size: 0;
}
.performance-session-workspace__toolbar {
  flex: 0 0 auto;
}
.performance-session-workspace__saving {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}
.performance-session-workspace__add {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.performance-session-workspace__add > :first-child {
  flex: 1;
  min-inline-size: 0;
}
.performance-session-workspace__controls {
  display: grid;
  flex: 0 0 auto;
  min-block-size: 0;
  gap: var(--ui-space-2);
  padding-block: var(--ui-space-1);
}
.performance-session-workspace__grid {
  flex: 1;
  min-height: calc(
    var(--ui-control-height) * 3 + var(--ui-list-header-height) +
      var(--ui-track-row-min-height) + var(--ui-space-2) * 4 + 2 *
      var(--ui-focus-safe-inset)
  );
}
.performance-session-workspace__list-scroll {
  flex: 0 1 auto;
  min-block-size: 0;
  max-block-size: calc(var(--ui-track-row-min-height) * 3);
}
.performance-session-workspace__list-scroll
  :deep(.performance-session-workspace__search-results) {
  display: flex;
  flex-direction: column;
  gap: var(--ui-track-list-gap);
  margin: 0;
  list-style: none;
}
@container performance-session-boundary (max-height:20rem) {
  .performance-session-workspace__viewport
    :deep(.performance-session-workspace__content) {
    min-block-size: var(--ui-folder-sheet-min-block-size);
  }
}
@container performance-session-workspace (max-width:24rem) {
  .performance-session-workspace__add {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .performance-session-workspace__add > :first-child {
    flex-basis: 100%;
  }
}
</style>
