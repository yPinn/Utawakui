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
    ? `從${selectedCollectionLabel.value}取代安排`
    : selectedPlaylist.value?.kind === 'album'
      ? '從專輯建立'
      : '從清單建立',
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
      item.progress === 'queued' ? '從待唱移除歌曲？' : '移除這筆播放紀錄？',
    subject: item.displayTitle,
    message: '只會移出這份安排，曲庫歌曲會保留。',
    confirmLabel: '移除歌曲',
    intent: 'danger',
  });
  if (confirmed) removeItem(itemId);
}

async function clearDraft() {
  if (!hasItems.value) return;
  const confirmed = await confirmAction({
    title: '清除演出安排？',
    message: '待唱、演出紀錄與手動調整都會清除；安排中正在播放的曲目也會停止。',
    detail: '曲庫歌曲與播放清單會保留。',
    confirmLabel: '清除安排',
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
      title: '取代待唱安排？',
      subject: selectedCollectionLabel.value,
      meta: sourceLabel.value ? `目前：${sourceLabel.value}` : undefined,
      message: '現有安排與手動調整會被取代。',
      confirmLabel: '取代安排',
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
      title: '取代待唱安排？',
      message: '目前已有其他安排，取代後手動調整會遺失。',
      confirmLabel: '取代安排',
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
          label: '顯示 BGM',
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
          label: '清除安排',
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
  <section class="performance-session-workspace" aria-label="演出安排">
    <UiScrollLayout
      class="performance-session-workspace__viewport"
      content-class="performance-session-workspace__content"
      scrollbar-reserve="overflow"
      aria-label="演出安排工作區內容"
    >
      <AppFolderWorkspaceToolbar
        class="performance-session-workspace__toolbar"
        :context="sourceLabel"
        :context-lang="sourceLang"
      >
        <template #status>
          <PerformanceSessionSummary :show-source="false" />
          <UiChip v-if="pendingAttention" tone="warning"
            >{{ pendingAttention }} 項需處理</UiChip
          >
          <span
            v-if="state.isSaving"
            class="performance-session-workspace__saving"
            role="status"
            >儲存中…</span
          >
        </template>
        <template #actions>
          <UiButton
            :aria-pressed="arrangementDockVisible"
            :aria-label="
              arrangementDockVisible ? '收合演出安排側欄' : '顯示演出安排側欄'
            "
            @click="
              arrangementDockVisible
                ? dock.setExpanded(false)
                : dock.showQueueVariant('arrangement')
            "
            >{{ arrangementDockVisible ? '收合側欄' : '顯示側欄' }}</UiButton
          >
          <UiButton v-if="showReturn" :icon="ArrowLeft" @click="emit('close')"
            >返回</UiButton
          >
          <UiIconButton
            :icon="Ellipsis"
            label="演出安排的更多選項"
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
        title="演出安排未完成"
        :message="state.error"
        compact
      />
      <UiNotice
        v-if="playback.state.error"
        tone="danger"
        title="演出播放未完成"
        :message="playback.state.error"
        compact
      />
      <UiNotice
        v-if="!state.error && !playback.state.error && workspaceValidationError"
        tone="warning"
        title="尚未完成"
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
              label="連續播放"
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
              label="搜尋曲庫並加入演出待唱"
              placeholder="搜尋曲名或歌手…"
              :disabled="state.isSaving"
            />
            <UiButton
              :icon="Plus"
              variant="secondary"
              :disabled="state.isSaving"
              @click="openManualItem"
              >新增手動項目</UiButton
            >
          </div>
          <UiNotice
            v-if="libraryAddValidationError"
            tone="warning"
            title="無法加入這首歌曲"
            :message="libraryAddValidationError.message"
            compact
          />
          <template v-if="isSearching">
            <UiHint>曲庫搜尋結果 {{ filteredTracks.length }}</UiHint>
            <UiScrollLayout
              v-if="filteredTracks.length"
              class="performance-session-workspace__list-scroll"
              content-tag="ul"
              content-class="performance-session-workspace__search-results"
              aria-label="曲庫搜尋結果"
            >
              <TrackIdentityRow
                v-for="track in filteredTracks"
                :key="track.id"
                :track="track"
                interactive
                hide-duration
                :action-label="'加入待唱：' + (track.title ?? track.id)"
                @row-click="addLibraryTrack(track.id)"
              />
            </UiScrollLayout>
            <UiHint v-else>找不到符合的曲目。</UiHint>
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
            @select="selectForReview"
            @move="moveItem"
            @duplicate="duplicateItem"
            @remove="confirmRemoveItem"
            @play="playback.start"
            @skip="playback.skip"
          />
          <UiHint v-else padded center
            >搜尋並加入待唱；從待唱播放才會留下演出紀錄。自行伴奏或外部播放可用「新增手動項目」。</UiHint
          >
        </template>
      </PerformanceSessionBoard>
    </UiScrollLayout>
    <UiActionMenu
      :open="Boolean(menuAnchor)"
      :anchor="menuAnchor ?? { kind: 'point', x: 0, y: 0 }"
      :content="workspaceMenu"
      aria-label="演出安排操作"
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
